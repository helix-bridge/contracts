// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@zeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "./LnBridgeHelper.sol";

/// @title LnBridgeSource
/// @notice LnBridgeSource is a contract to help user transfer token to liquidity node and generate proof,
///         then the liquidity node must transfer the same amount of the token to the user on target chain.
///         Otherwise if timeout the slasher can paid for relayer and slash the transfer, then request slash from lnProvider's margin.
/// @dev See https://github.com/helix-bridge/contracts/tree/master/helix-contract
contract LnOppositeBridgeSource is LnBridgeHelper {
    uint256 constant public MAX_TRANSFER_AMOUNT = type(uint112).max;
    uint256 constant public LIQUIDITY_FEE_RATE_BASE = 100000;

    // the registered token info
    // sourceToken and targetToken is the pair of erc20 token addresses
    // if sourceToken == address(0), then it's native token
    // if targetToken == address(0), then remote is native token
    // * `protocolFee` is the protocol fee charged by system
    // * `penaltyLnCollateral` is penalty from lnProvider when the transfer slashed, if we adjust this value, it'll not affect the old transfers.
    struct TokenInfo {
        address targetToken;
        uint112 protocolFee;
        uint112 penaltyLnCollateral;
        uint8 sourceDecimals;
        uint8 targetDecimals;
        bool isRegistered;
    }
    // the Liquidity Node provider info
    // Liquidity Node need register first
    struct LnProviderConfigure {
        uint112 margin;
        uint112 baseFee;
        // liquidityFeeRate / 100,000 * amount = liquidityFee
        // the max liquidity fee rate is 0.255%
        uint8 liquidityFeeRate;
    }
    struct LnProviderInfo {
        LnProviderConfigure config;
        bool pause;
        bytes32 lastTransferId;
    }
    
    // the Snapshot is the state of the token bridge when user prepare to transfer across chains.
    // If the snapshot updated when the across chain transfer confirmed, it will
    // 1. if lastTransferId updated, revert
    // 2. if margin decrease or totalFee increase, revert
    // 3. if margin increase or totalFee decrease, success
    struct Snapshot {
        address provider;
        address sourceToken;
        bytes32 transferId;
        uint112 depositedMargin;
        uint112 totalFee;
    }
    // registered token info
    // sourceToken => token info
    mapping(address=>TokenInfo) public tokenInfos;
    // registered lnProviders
    mapping(bytes32=>LnProviderInfo) public lnProviders;
    // each time cross chain transfer, amount and fee can't be larger than type(uint112).max
    struct LockInfo {
        // amount + providerFee + penaltyLnCollateral
        // the Indexer should be care about this value, it will frozen lnProvider's margin when the transfer not finished.
        // and when the slasher slash success, this amount of token will be transfer from lnProvider's margin to slasher.
        uint112 amountWithFeeAndPenalty;
        bool hasSlashed;
    }
    // key: transferId = hash(proviousTransferId, timestamp, targetToken, receiver, targetAmount)
    // * `proviousTransferId` is used to ensure the continuous of the transfer
    // * `timestamp` is the block.timestmap to judge timeout on target chain(here we support source and target chain has the same world clock)
    // * `targetToken`, `receiver` and `targetAmount` are used on target chain to transfer target token.
    mapping(bytes32 => LockInfo) public lockInfos;
    address public feeReceiver;

    event TokenLocked(
        bytes32 transferId,
        address provider,
        address sourceToken,
        uint112 amount,
        uint112 fee,
        address receiver);
    event LiquidityWithdrawn(address provider, address token, uint112 amount);
    event Slash(bytes32 transferId, address provider, address token, uint112 margin, address slasher);
    // relayer
    event LnProviderUpdated(address provider, address token, uint112 margin, uint112 baseFee, uint8 liquidityfeeRate);

    function _setFeeReceiver(address _feeReceiver) internal {
        require(_feeReceiver != address(this), "invalid system fee receiver");
        feeReceiver = _feeReceiver;
    }

    function _updateProtocolFee(address _token, uint112 _protocolFee) internal {
        require(tokenInfos[_token].isRegistered, "token not registered");
        tokenInfos[_token].protocolFee = _protocolFee;
    }

    function _updatePenaltyLnCollateral(address _token, uint112 _penaltyLnCollateral) internal {
        require(tokenInfos[_token].isRegistered, "token not registered");
        tokenInfos[_token].penaltyLnCollateral = _penaltyLnCollateral;
    }

    function providerPause(address sourceToken) external {
        bytes32 providerKey = getProviderKey(msg.sender, sourceToken);
        lnProviders[providerKey].pause = true;
    }

    function providerUnpause(address sourceToken) external {
        bytes32 providerKey = getProviderKey(msg.sender, sourceToken);
        lnProviders[providerKey].pause = false;
    }

    // lnProvider can register or update its configure by using this function
    // * `margin` is the increased value of the deposited margin
    function updateProviderFeeAndMargin(
        address sourceToken,
        uint112 margin,
        uint112 baseFee,
        uint8 liquidityFeeRate
    ) external payable {
        TokenInfo memory tokenInfo = tokenInfos[sourceToken];
        require(tokenInfo.isRegistered, "token is not registered");

        bytes32 providerKey = getProviderKey(msg.sender, sourceToken);
        LnProviderInfo memory providerInfo = lnProviders[providerKey];

        LnProviderConfigure memory config = LnProviderConfigure(
            // the margin can be only increased here
            margin + providerInfo.config.margin,
            baseFee,
            liquidityFeeRate);

        lnProviders[providerKey].config = config;

        if (sourceToken == address(0)) {
            require(msg.value == margin, "invalid margin value");
        } else {
            if (margin > 0) {
                _safeTransferFrom(sourceToken, msg.sender, address(this), margin);
            }
        }
        emit LnProviderUpdated(msg.sender, sourceToken, config.margin, baseFee, liquidityFeeRate);
    }

    function _registerToken(
        address sourceToken,
        address targetToken,
        uint112 protocolFee,
        uint112 penaltyLnCollateral,
        uint8 sourceDecimals,
        uint8 targetDecimals
    ) internal {
        tokenInfos[sourceToken] = TokenInfo(
            targetToken,
            protocolFee,
            penaltyLnCollateral,
            sourceDecimals,
            targetDecimals,
            true
        );
    }

    function calculateProviderFee(LnProviderConfigure memory config, uint112 amount) internal pure returns(uint256) {
        return uint256(config.baseFee) + uint256(config.liquidityFeeRate) * uint256(amount) / LIQUIDITY_FEE_RATE_BASE;
    }

    // the fee user should paid when transfer.
    // totalFee = providerFee + protocolFee
    // providerFee = provider.baseFee + provider.liquidityFeeRate * amount
    function totalFee(address provider, address sourceToken, uint112 amount) external view returns(uint256) {
        bytes32 providerKey = getProviderKey(provider, sourceToken);
        LnProviderInfo memory providerInfo = lnProviders[providerKey];
        uint256 providerFee = calculateProviderFee(providerInfo.config, amount);
        return providerFee + tokenInfos[sourceToken].protocolFee;
    }

    // This function transfers tokens from the user to LnProvider and generates a proof on the source chain.
    // The snapshot represents the state of the LN bridge for this LnProvider, obtained by the off-chain indexer.
    // If the chain state is updated and does not match the snapshot state, the transaction will be reverted.
    // 1. the state(lastTransferId, fee, margin) must match snapshot
    // 2. transferId not exist
    function transferAndLockMargin(
        Snapshot calldata snapshot,
        uint112 amount,
        address receiver
    ) external payable {
        require(amount > 0, "invalid amount");

        bytes32 providerKey = getProviderKey(snapshot.provider, snapshot.sourceToken);
        LnProviderInfo memory providerInfo = lnProviders[providerKey];

        require(!providerInfo.pause, "provider paused");

        TokenInfo memory tokenInfo = tokenInfos[snapshot.sourceToken];

        uint256 providerFee = calculateProviderFee(providerInfo.config, amount);
        
        // Note: this requirement is not enough to ensure that the lnProvider's margin is enough because there maybe some frozen margins in other transfers
        require(providerInfo.config.margin >= amount + tokenInfo.penaltyLnCollateral + uint112(providerFee), "amount not valid");

        // the chain state not match snapshot
        require(providerInfo.lastTransferId == snapshot.transferId, "snapshot expired");
        require(snapshot.totalFee >= tokenInfo.protocolFee + providerFee, "fee is invalid");
        require(snapshot.depositedMargin <= providerInfo.config.margin, "margin updated");
        
        uint256 targetAmount = uint256(amount) * 10**tokenInfo.targetDecimals / 10**tokenInfo.sourceDecimals;
        require(targetAmount < MAX_TRANSFER_AMOUNT, "overflow amount");
        bytes32 transferId = keccak256(abi.encodePacked(
            snapshot.transferId,
            snapshot.provider,
            snapshot.sourceToken,
            tokenInfo.targetToken,
            receiver,
            uint64(block.timestamp),
            uint112(targetAmount)));
        require(lockInfos[transferId].amountWithFeeAndPenalty == 0, "transferId exist");
        lockInfos[transferId] = LockInfo(amount + tokenInfo.penaltyLnCollateral + uint112(providerFee), false);

        // update the state to prevent other transfers using the same snapshot
        lnProviders[providerKey].lastTransferId = transferId;

        if (snapshot.sourceToken == address(0)) {
            require(amount + snapshot.totalFee == msg.value, "amount unmatched");
            payable(snapshot.provider).transfer(amount + providerFee);
            if (tokenInfo.protocolFee > 0) {
                payable(feeReceiver).transfer(tokenInfo.protocolFee);
            }
            uint256 refund = snapshot.totalFee - tokenInfo.protocolFee - providerFee;
            if ( refund > 0 ) {
                payable(msg.sender).transfer(refund);
            }
        } else {
            _safeTransferFrom(
                snapshot.sourceToken,
                msg.sender,
                snapshot.provider,
                amount + providerFee
            );
            if (tokenInfo.protocolFee > 0) {
                _safeTransferFrom(
                    snapshot.sourceToken,
                    msg.sender,
                    feeReceiver,
                    tokenInfo.protocolFee
                );
            }
        }
        emit TokenLocked(
            transferId,
            snapshot.provider,
            snapshot.sourceToken,
            amount,
            uint112(providerFee),
            receiver);
    }

    // this slash is called by remote message
    // the token should be sent to the slasher who slash and finish the transfer on target chain.
    // latestSlashTransferId is the latest slashed transfer trusted from the target chain, and the current slash transfer cannot be executed before the latestSlash transfer.
    // after slash, the margin of lnProvider need to be updated
    function _slash(
        bytes32 latestSlashTransferId,
        bytes32 transferId,
        address sourceToken,
        address provider,
        address slasher
    ) internal {
        // check lastTransfer
        // ensure last slash transfer(checked on target chain) has been slashed
        LockInfo memory lastLockInfo = lockInfos[latestSlashTransferId];
        require(lastLockInfo.hasSlashed || latestSlashTransferId == INIT_SLASH_TRANSFER_ID, "latest slash transfer invalid");
        LockInfo memory lockInfo = lockInfos[transferId];

        // ensure transfer exist and not slashed yet
        require(!lockInfo.hasSlashed, "transfer has been slashed");
        require(lockInfo.amountWithFeeAndPenalty > 0, "lnBridgeSource:invalid transferId");

        bytes32 providerKey = getProviderKey(provider, sourceToken);

        LnProviderInfo memory lnProvider = lnProviders[providerKey];
        lockInfos[transferId].hasSlashed = true;
        // transfer token to the slasher
        uint256 slashAmount = lockInfo.amountWithFeeAndPenalty;
        require(lnProvider.config.margin >= slashAmount, "margin not enough");
        uint112 updatedMargin = lnProvider.config.margin - uint112(slashAmount);
        lnProviders[providerKey].config.margin = updatedMargin;

        if (sourceToken == address(0)) {
            payable(slasher).transfer(slashAmount);
        } else {
            _safeTransfer(sourceToken, slasher, slashAmount);
        }

        emit Slash(transferId, provider, sourceToken, updatedMargin, slasher);
    }

    // lastTransfer is the latest slash transfer, all transfer must be relayed or slashed
    // if user use the snapshot before this transaction to send cross-chain transfer, it should be reverted because this `_withdrawMargin` will decrease margin.
    function _withdrawMargin(
        bytes32 latestSlashTransferId,
        bytes32 lastTransferId,
        address provider,
        address sourceToken,
        uint112 amount
    ) internal {
        // check the latest slash transfer 
        // ensure latest slash tranfer(verified on target chain) has been slashed on source chain
        LockInfo memory lastRefundLockInfo = lockInfos[latestSlashTransferId];
        require(lastRefundLockInfo.hasSlashed || latestSlashTransferId == INIT_SLASH_TRANSFER_ID, "latest slash transfer invalid");

        // use this condition to ensure that the withdraw message is sent by the provider
        // the parameter provider is the message sender of this remote withdraw call
        bytes32 providerKey = getProviderKey(provider, sourceToken);
        LnProviderInfo memory lnProvider = lnProviders[providerKey];

        // ensure all transfer has finished
        require(lnProvider.lastTransferId == lastTransferId, "invalid last transferid");
        require(lnProvider.config.margin >= amount, "margin not enough");
        uint112 updatedMargin = lnProvider.config.margin - amount;
        lnProviders[providerKey].config.margin = updatedMargin;
        if (sourceToken == address(0)) {
            payable(provider).transfer(amount);
        } else {
            _safeTransfer(sourceToken, provider, amount);
        }
        emit LiquidityWithdrawn(provider, sourceToken, updatedMargin);
    }
}
 
