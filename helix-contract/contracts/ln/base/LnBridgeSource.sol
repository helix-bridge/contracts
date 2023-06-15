// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@zeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "./LnBridgeHelper.sol";

/// @title LnBridgeSource
/// @notice LnBridgeSource is a contract to help user transfer token to liquidity node and generate proof,
///         then the liquidity node must transfer the same amount of the token to the user on target chain.
///         Otherwise if timeout the slasher can paid for relayer and slash the transfer, then request refund from lnProvider's margin.
/// @dev See https://github.com/helix-bridge/contracts/tree/master/helix-contract
contract LnBridgeSource is LnBridgeHelper {
    uint256 constant public MAX_TRANSFER_AMOUNT = type(uint112).max;
    uint256 constant public LIQUIDITY_FEE_RATE_BASE = 100000;
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
        address provider;
        LnProviderConfigure config;
        bytes32 lastTransferId;
    }
    // the registered token info
    // localToken and remoteToken is the pair of erc20 token addresses
    // if localToken == address(0), then it's native token
    // if remoteToken == address(0), then remote is native token
    // * `protocolFee` is the protocol fee charged by system
    // * `penaltyLnCollateral` is penalty from lnProvider when the transfer refund, if we adjust this value, it'll not affect the old transfers.
    struct TokenInfo {
        address localToken;
        address remoteToken;
        uint112 protocolFee;
        uint112 penaltyLnCollateral;
        uint8 localDecimals;
        uint8 remoteDecimals;
    }
    // the Snapshot is the state of the token bridge when user prepare to transfer across chains.
    // If the snapshot updated when the across chain transfer confirmed, it will
    // 1. if lastTransferId updated, revert
    // 2. if margin decrease or totalFee increase, revert
    // 3. if margin increase or totalFee decrease, success
    struct Snapshot {
        bytes32 transferId;
        uint112 depositedMargin;
        uint112 totalFee;
    }
    // registered token info
    TokenInfo[] public tokens;
    // registered lnProviders
    // tokenIndex|32bit, providerIndex| 32bit
    uint32 public lnProviderSize;
    mapping(uint64=>LnProviderInfo) public lnProviders;
    // Use this store to limit the number of registered providers per address 
    mapping(uint256=>uint64) public lnProviderIndexes;
    // each time cross chain transfer, amount and fee can't be larger than type(uint112).max
    struct LockInfo {
        uint64 providerKey; // tokenIndex << 32 + providerIndex
        // amount + providerFee + penaltyLnCollateral
        // the Indexer should be care about this value, it will frozen lnProvider's margin when the transfer not finished.
        // and when the slasher refund success, this amount of token will be transfer from lnProvider's margin to slasher.
        uint112 amountWithFeeAndPenalty;
        uint64 nonce;
        bool hasRefund;
    }
    // key: transferId = hash(providerKey, proviousTransferId, lastBlockhash, nonce, timestamp, remoteToken, receiver, remoteAmount)
    // * `providerKey` is the unique identification of the token and lnProvider
    // * `proviousTransferId` is used to ensure the continuous of the transfer
    // * `lastBlockhash` is used as a random value to prevent predict of the future transferId
    // * `nonce` is a consecutive number for generate unique transferId
    // * `timestamp` is the block.timestmap to judge timeout on target chain(here we support source and target chain has the same world clock)
    // * `remoteToken`, `receiver` and `remoteAmount` are used on target chain to transfer target token.
    mapping(bytes32 => LockInfo) public lockInfos;
    address public feeReceiver;

    event TokenLocked(
        uint64 nonce,
        bytes32 transferId,
        bytes32 lastBlockHash,
        address localToken,
        uint112 amount,
        uint112 fee,
        address receiver);
    event LiquidityWithdrawn(uint64 providerKey, address provider, uint112 amount);
    event Refund(bytes32 transferId, uint64 providerKey, address provider, uint112 margin, address slasher);
    // relayer
    event LnProviderUpdated(address provider, uint64 providerKey, uint112 margin, uint112 baseFee, uint8 liquidityfeeRate);

    function _setFeeReceiver(address _feeReceiver) internal {
        require(_feeReceiver != address(this), "lnBridgeSource:invalid system fee receiver");
        feeReceiver = _feeReceiver;
    }

    function _updateHelixFee(uint32 _tokenIndex, uint112 _protocolFee) internal {
        require(_tokenIndex < tokens.length, "lnBridgeSource:invalid token index");
        tokens[_tokenIndex].protocolFee = _protocolFee;
    }

    function _lnProviderKey(uint32 tokenIndex, uint32 providerIndex) internal pure returns(uint64) {
        return tokenIndex << 32 + providerIndex;
    }

    function _lnProviderAddressKey(address addr, uint32 tokenIndex) internal pure returns(uint256) {
        return uint256(uint160(addr)) << 32 + tokenIndex;
    }

    function _lnProviderTokenIndex(uint64 providerKey) internal pure returns(uint32) {
        return uint32(providerKey >> 32);
    }

    function _lastBlockHash() internal view returns(bytes32) {
        return blockhash(block.number - 1);
    }

    // lnProvider can register or update its configure by using this function
    // * `margin` is the increased value of the deposited margin
    function registerOrUpdateLnProvider(
        uint32 tokenIndex,
        uint112 margin,
        uint112 baseFee,
        uint8 liquidityFeeRate
    ) external payable {
        require(tokenIndex < tokens.length, "lnBridgeSource:invalid token index");
        require(liquidityFeeRate < LIQUIDITY_FEE_RATE_BASE, "invalid liquidity fee rate");

        uint256 addressKey = _lnProviderAddressKey(msg.sender, tokenIndex);
        uint64 providerKey = lnProviderIndexes[addressKey];

        LnProviderConfigure memory config = LnProviderConfigure(
            margin,
            baseFee,
            liquidityFeeRate);

        if (providerKey == 0) {
            require(margin > 0, "invalid margin value");
            providerKey = _lnProviderKey(tokenIndex, lnProviderSize);
            lnProviderSize += 1;
            lnProviders[providerKey] = LnProviderInfo(msg.sender, config, bytes32(0));
            lnProviderIndexes[addressKey] = providerKey;
        } else {
            LnProviderInfo memory oldProviderInfo = lnProviders[providerKey];
            require(oldProviderInfo.provider == msg.sender, "provider slot exist");
            config.margin += oldProviderInfo.config.margin;
            lnProviders[providerKey].config = config;
        }

        // transfer margin
        TokenInfo memory tokenInfo = tokens[tokenIndex];

        if (tokenInfo.localToken == address(0)) {
            require(msg.value == margin, "invalid margin value");
        } else {
            if (margin > 0) {
                _safeTransferFrom(tokenInfo.localToken, msg.sender, address(this), margin);
            }
        }
        emit LnProviderUpdated(msg.sender, providerKey, config.margin, baseFee, liquidityFeeRate);
    }

    function _registerToken(
        address localToken,
        address remoteToken,
        uint112 protocolFee,
        uint112 penaltyLnCollateral,
        uint8 localDecimals,
        uint8 remoteDecimals
    ) internal {
        tokens.push(TokenInfo(
            localToken,
            remoteToken,
            protocolFee,
            penaltyLnCollateral,
            localDecimals,
            remoteDecimals));
    }

    function _updateProtocolFee(uint32 tokenIndex, uint112 protocolFee) internal {
        require(tokenIndex < tokens.length, "invalid token index");
        tokens[tokenIndex].protocolFee = protocolFee;
    }

    function _updatePenaltyLnCollateral(uint32 tokenIndex, uint112 penaltyLnCollateral) internal {
        require(tokenIndex < tokens.length, "invalid token index");
        tokens[tokenIndex].penaltyLnCollateral = penaltyLnCollateral;
    }

    function calculateProviderFee(LnProviderConfigure memory config, uint112 amount) internal pure returns(uint256) {
        return uint256(config.baseFee) + uint256(config.liquidityFeeRate) * uint256(amount) / LIQUIDITY_FEE_RATE_BASE;
    }

    // the fee user should paid when transfer.
    // totalFee = providerFee + protocolFee
    // providerFee = provider.baseFee + provider.liquidityFeeRate * amount
    function totalFee(uint64 providerKey, uint112 amount) external view returns(uint256) {
        uint32 tokenIndex = _lnProviderTokenIndex(providerKey);
        TokenInfo memory tokenInfo = tokens[tokenIndex];
        LnProviderInfo memory providerInfo = lnProviders[providerKey];
        uint256 providerFee = calculateProviderFee(providerInfo.config, amount);
        return providerFee + tokenInfo.protocolFee;
    }

    // This function transfers tokens from the user to LnProvider and generates a proof on the source chain.
    // The snapshot represents the state of the LN bridge for this LnProvider, obtained by the off-chain indexer.
    // If the chain state is updated and does not match the snapshot state, the transaction will be reverted.
    // 1. the state(lastTransferId, fee, margin) must match snapshot
    // 2. transferId not exist
    function transferAndLockMargin(
        Snapshot calldata snapshot,
        uint64 providerKey,
        uint112 amount,
        address receiver
    ) external payable {
        uint32 tokenIndex = _lnProviderTokenIndex(providerKey);
        uint64 nonce = lockInfos[snapshot.transferId].nonce + 1;
        
        require(tokens.length > tokenIndex, "lnBridgeSource:token not registered");
        require(amount > 0, "lnBridgeSource:invalid amount");

        TokenInfo memory tokenInfo = tokens[tokenIndex];
        LnProviderInfo memory providerInfo = lnProviders[providerKey];
        uint256 providerFee = calculateProviderFee(providerInfo.config, amount);
        
        // Note: this requirement is not enough to ensure that the lnProvider's margin is enough because there maybe some frozen margins in other transfers
        require(providerInfo.config.margin >= amount + tokenInfo.penaltyLnCollateral + uint112(providerFee), "amount not valid");

        // the chain state not match snapshot
        require(providerInfo.lastTransferId == snapshot.transferId, "snapshot expired");
        require(snapshot.totalFee >= tokenInfo.protocolFee + providerFee, "fee is invalid");
        require(snapshot.depositedMargin <= providerInfo.config.margin, "margin updated");
        
        uint256 remoteAmount = uint256(amount) * 10**tokenInfo.remoteDecimals / 10**tokenInfo.localDecimals;
        require(remoteAmount < MAX_TRANSFER_AMOUNT, "lnBridgeSource:overflow amount");
        bytes32 lastBlockHash = _lastBlockHash();
        bytes32 transferId = keccak256(abi.encodePacked(
            providerKey,
            snapshot.transferId,
            lastBlockHash,
            nonce,
            uint64(block.timestamp),
            tokenInfo.remoteToken,
            receiver,
            uint112(remoteAmount)));
        require(lockInfos[transferId].nonce == 0, "lnBridgeSource:transferId exist");
        lockInfos[transferId] = LockInfo(providerKey, amount + tokenInfo.penaltyLnCollateral + uint112(providerFee), nonce, false);

        // update the state to prevent other transfers using the same snapshot
        lnProviders[providerKey].lastTransferId = transferId;

        if (tokenInfo.localToken == address(0)) {
            require(amount + snapshot.totalFee == msg.value, "lnBridgeSource:amount unmatched");
            payable(providerInfo.provider).transfer(amount + providerFee);
            if (tokenInfo.protocolFee > 0) {
                payable(feeReceiver).transfer(tokenInfo.protocolFee);
            }
        } else {
            _safeTransferFrom(
                tokenInfo.localToken,
                msg.sender,
                providerInfo.provider,
                amount + providerFee
            );
            if (tokenInfo.protocolFee > 0) {
                _safeTransferFrom(
                    tokenInfo.localToken,
                    msg.sender,
                    feeReceiver,
                    tokenInfo.protocolFee
                );
            }
        }
        emit TokenLocked(
            nonce,
            transferId,
            lastBlockHash,
            tokenInfo.localToken,
            amount,
            uint112(providerFee),
            receiver);
    }

    // this refund is called by remote message
    // the token should be sent to the slasher who slash and finish the transfer on target chain.
    // latestSlashTransferId is the latest slashed transfer trusted from the target chain, and the current refund transfer cannot be executed before the latestSlash transfer.
    // after refund, the margin of lnProvider need to be updated
    function _refund(
        bytes32 latestSlashTransferId,
        bytes32 transferId,
        address slasher
    ) internal {
        // check lastTransfer
        LockInfo memory lastLockInfo = lockInfos[latestSlashTransferId];
        require(lastLockInfo.hasRefund || latestSlashTransferId == INIT_SLASH_TRANSFER_ID, "latest slash transfer invalid");
        LockInfo memory lockInfo = lockInfos[transferId];
        require(!lockInfo.hasRefund, "transfer has been refund");
        uint32 tokenIndex = _lnProviderTokenIndex(lockInfo.providerKey);
        require(lockInfo.amountWithFeeAndPenalty > 0 && tokenIndex < tokens.length, "lnBridgeSource:invalid transferId");
        LnProviderInfo memory lnProvider = lnProviders[lockInfo.providerKey];
        TokenInfo memory tokenInfo = tokens[tokenIndex];
        lockInfos[transferId].hasRefund = true;
        // transfer token to the slasher
        uint256 withdrawAmount = lockInfo.amountWithFeeAndPenalty;
        require(lnProvider.config.margin >= withdrawAmount, "margin not enough");
        uint112 updatedMargin = lnProvider.config.margin - uint112(withdrawAmount);
        lnProviders[lockInfo.providerKey].config.margin = updatedMargin;

        if (tokenInfo.localToken == address(0)) {
            payable(slasher).transfer(withdrawAmount);
        } else {
            _safeTransfer(tokenInfo.localToken, slasher, withdrawAmount);
        }

        emit Refund(transferId, lockInfo.providerKey, lnProvider.provider, updatedMargin, slasher);
    }

    // lastTransfer is the latest refund transfer, all transfer must be relayed or refunded
    // if user use the snapshot before this transaction to send cross-chain transfer, it should be reverted because this `_withdrawMargin` will decrease margin.
    function _withdrawMargin(
        bytes32 latestSlashTransferId,
        bytes32 lastTransferId,
        address provider,
        uint112 amount
    ) internal {
        // check the latest slash transfer 
        LockInfo memory lastRefundLockInfo = lockInfos[latestSlashTransferId];
        require(lastRefundLockInfo.hasRefund || latestSlashTransferId == INIT_SLASH_TRANSFER_ID, "latest slash transfer invalid");

        LockInfo memory lastLockInfo = lockInfos[lastTransferId];
        uint64 providerKey = lastLockInfo.providerKey;
        uint32 tokenIndex = _lnProviderTokenIndex(providerKey);
        LnProviderInfo memory lnProvider = lnProviders[providerKey];
        // use this condition to ensure that the withdraw message is sent by the provider
        require(provider == lnProvider.provider, "invalid provider");
        require(lnProvider.lastTransferId == lastTransferId, "invalid last transferid");
        TokenInfo memory tokenInfo = tokens[tokenIndex];
        require(lnProvider.config.margin >= amount, "margin not enough");
        uint112 updatedMargin = lnProvider.config.margin - amount;
        lnProviders[providerKey].config.margin = updatedMargin;
        if (tokenInfo.localToken == address(0)) {
            payable(provider).transfer(amount);
        } else {
            _safeTransfer(tokenInfo.localToken, provider, amount);
        }
        emit LiquidityWithdrawn(providerKey, lnProvider.provider, updatedMargin);
    }

    function tokenLength() external view returns (uint) {
        return tokens.length;
    }
}
 
