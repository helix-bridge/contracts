// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@zeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "./LnBridgeHelper.sol";
import "../interface/ILnDefaultBridgeTarget.sol";

/// @title LnPositiveBridgeSource
/// @notice LnPositiveBridgeSource is a contract to help user transfer token to liquidity node and generate proof,
///         then the liquidity node must transfer the same amount of the token to the user on target chain.
///         Otherwise if timeout the slasher can send a slash request message to target chain, then force transfer from lnProvider's margin to the user.
/// @dev See https://github.com/helix-bridge/contracts/tree/master/helix-contract
contract LnDefaultBridgeSource is LnBridgeHelper {
    // the time(seconds) for liquidity provider to delivery message
    // if timeout, slasher can work.
    uint256 constant public MIN_SLASH_TIMESTAMP = 30 * 60;
    // liquidity fee base rate
    // liquidityFee = liquidityFeeRate / LIQUIDITY_FEE_RATE_BASE * sendAmount
    uint256 constant public LIQUIDITY_FEE_RATE_BASE = 100000;
    // max transfer amount one time
    uint256 constant public MAX_TRANSFER_AMOUNT = type(uint112).max;
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

    // provider fee is paid to liquidity node's account
    // the fee is charged by the same token that user transfered
    // providerFee = baseFee + liquidityFeeRate/LIQUIDITY_FEE_RATE_BASE * sendAmount
    struct LnProviderFee {
        uint112 baseFee;
        uint8 liquidityFeeRate;
    }
    
    struct LnProviderInfo {
        LnProviderFee fee;
        // we use this nonce to generate the unique withdraw id
        uint64 withdrawNonce;
        bytes32 lastTransferId;
    }
    // the Snapshot is the state of the token bridge when user prepare to transfer across chains.
    // If the snapshot updated when the across chain transfer confirmed, it will
    // 1. if lastTransferId or withdrawNonce updated, revert
    // 2. if totalFee increase, revert
    // 3. if totalFee decrease, success
    struct Snapshot {
        address provider;
        address sourceToken;
        bytes32 transferId;
        uint112 totalFee;
        uint64 withdrawNonce;
    }

    // lock info
    // the fee and penalty is the state of the transfer confirmed
    struct LockInfo {
        uint112 fee;
        uint112 penalty;
        bool isLocked;
    }
    // sourceToken => token info
    mapping(address=>TokenInfo) public tokenInfos;
    // providerKey => provider info
    mapping(bytes32=>LnProviderInfo) public lnProviders;
    // transferId => lock info
    mapping(bytes32=>LockInfo) public lockInfos;

    address public protocolFeeReceiver;

    event TokenLocked(
        bytes32 transferId,
        address provider,
        address sourceToken,
        uint112 amount,
        uint112 fee,
        uint112 penalty,
        address receiver);
    event LnProviderUpdated(address provider, address sourceToken, uint112 baseFee, uint8 liquidityfeeRate);

    // protocolFeeReceiver is the protocol fee reciever, we don't use the contract itself as the receiver
    function _setFeeReceiver(address _feeReceiver) internal {
        require(_feeReceiver != address(this), "invalid system fee receiver");
        protocolFeeReceiver = _feeReceiver;
    }

    // register or update token info, it can be only called by contract owner
    // source token can only map a unique target token on target chain
    function _setTokenInfo(
        address _sourceToken,
        address _targetToken,
        uint112 _protocolFee,
        uint112 _penaltyLnCollateral,
        uint8 _sourceDecimals,
        uint8 _targetDecimals
    ) internal {
        tokenInfos[_sourceToken] = TokenInfo(
            _targetToken,
            _protocolFee,
            _penaltyLnCollateral,
            _sourceDecimals,
            _targetDecimals,
            true
        );
    }

    // lnProvider register
    // 1. set fee on source chain
    // 2. deposit margin on target chain
    function setProviderFee(
        address sourceToken,
        uint112 baseFee,
        uint8 liquidityFeeRate
    ) external {
        TokenInfo memory tokenInfo = tokenInfos[sourceToken];
        require(tokenInfo.isRegistered, "token not registered");
        bytes32 providerKey = getDefaultProviderKey(msg.sender, sourceToken, tokenInfo.targetToken);
        LnProviderFee memory providerFee = LnProviderFee(baseFee, liquidityFeeRate);

        // we only update the field fee of the provider info
        // if the provider has not been registered, then this line will register, otherwise update fee
        lnProviders[providerKey].fee = providerFee;

        emit LnProviderUpdated(msg.sender, sourceToken, baseFee, liquidityFeeRate);
    }

    function calculateProviderFee(LnProviderFee memory fee, uint112 amount) internal pure returns(uint256) {
        return uint256(fee.baseFee) + uint256(fee.liquidityFeeRate) * uint256(amount) / LIQUIDITY_FEE_RATE_BASE;
    }

    // the fee user should paid when transfer.
    // totalFee = providerFee + protocolFee
    function totalFee(address provider, address sourceToken, uint112 amount) external view returns(uint256) {
        TokenInfo memory tokenInfo = tokenInfos[sourceToken];
        bytes32 providerKey = getDefaultProviderKey(provider, sourceToken, tokenInfo.targetToken);
        LnProviderInfo memory providerInfo = lnProviders[providerKey];
        uint256 providerFee = calculateProviderFee(providerInfo.fee, amount);
        return providerFee + tokenInfo.protocolFee;
    }

    // This function transfers tokens from the user to LnProvider and generates a proof on the source chain.
    // The snapshot represents the state of the LN bridge for this LnProvider, obtained by the off-chain indexer.
    // If the chain state is updated and does not match the snapshot state, the transaction will be reverted.
    // 1. the state(lastTransferId, fee, withdrawNonce) must match snapshot
    // 2. transferId not exist
    function transferAndLockMargin(
        Snapshot calldata snapshot,
        uint112 amount,
        address receiver
    ) external payable {
        require(amount > 0, "invalid amount");

        TokenInfo memory tokenInfo = tokenInfos[snapshot.sourceToken];
        require(tokenInfo.isRegistered, "token not registered");
        
        bytes32 providerKey = getDefaultProviderKey(snapshot.provider, snapshot.sourceToken, tokenInfo.targetToken);

        LnProviderInfo memory providerInfo = lnProviders[providerKey];
        uint256 providerFee = calculateProviderFee(providerInfo.fee, amount);

        // the chain state not match snapshot
        require(providerInfo.lastTransferId == snapshot.transferId, "snapshot expired:transfer");
        require(snapshot.withdrawNonce == providerInfo.withdrawNonce, "snapshot expired:withdraw");
        require(snapshot.totalFee >= providerFee + tokenInfo.protocolFee && providerFee > 0, "fee is invalid");
        
        uint256 targetAmount = _sourceAmountToTargetAmount(tokenInfo, uint256(amount));
        uint256 targetPenalty = _sourceAmountToTargetAmount(tokenInfo, uint256(tokenInfo.penaltyLnCollateral));
        bytes32 transferId = keccak256(abi.encodePacked(
            snapshot.transferId,
            snapshot.provider,
            snapshot.sourceToken,
            tokenInfo.targetToken,
            receiver,
            uint64(block.timestamp),
            uint112(targetAmount),
            uint112(targetPenalty)
        ));
        require(!lockInfos[transferId].isLocked, "transferId exist");
        // if the transfer refund, then the fee and penalty should be given to slasher, but the protocol fee is ignored
        // and we use the penalty value configure at the moment transfer confirmed
        lockInfos[transferId] = LockInfo(snapshot.totalFee, tokenInfo.penaltyLnCollateral, true);

        // update the state to prevent other transfers using the same snapshot
        lnProviders[providerKey].lastTransferId = transferId;

        if (snapshot.sourceToken == address(0)) {
            require(amount + snapshot.totalFee == msg.value, "amount unmatched");
            payable(snapshot.provider).transfer(amount + providerFee);
            if (tokenInfo.protocolFee > 0) {
                payable(protocolFeeReceiver).transfer(tokenInfo.protocolFee);
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
                    protocolFeeReceiver,
                    tokenInfo.protocolFee 
                );
            }
        }
        emit TokenLocked(
            transferId,
            snapshot.provider,
            snapshot.sourceToken,
            uint112(targetAmount),
            uint112(providerFee),
            uint112(targetPenalty),
            receiver);
    }

    function _sourceAmountToTargetAmount(
        TokenInfo memory tokenInfo,
        uint256 amount
    ) internal pure returns(uint256) {
        uint256 targetAmount = amount * 10**tokenInfo.targetDecimals / 10**tokenInfo.sourceDecimals;
        require(targetAmount < MAX_TRANSFER_AMOUNT, "overflow amount");
        return targetAmount;
    }

    function _slashAndRemoteRelease(
        TransferParameter memory params,
        uint112 penalty,
        bytes32 expectedTransferId
    ) internal view returns(bytes memory message) {
        require(block.timestamp > params.timestamp + MIN_SLASH_TIMESTAMP, "invalid timestamp");
        TokenInfo memory tokenInfo = tokenInfos[params.sourceToken];
        require(tokenInfo.isRegistered, "token not registered");
        uint256 targetAmount = _sourceAmountToTargetAmount(tokenInfo, uint256(params.amount));
        uint256 targetPenalty = _sourceAmountToTargetAmount(tokenInfo, penalty);

        bytes32 transferId = keccak256(abi.encodePacked(
           params.previousTransferId,
           params.provider,
           params.sourceToken,
           params.targetToken,
           params.receiver,
           params.timestamp,
           uint112(targetAmount),
           uint112(targetPenalty)
        ));
        require(expectedTransferId == transferId, "expected transfer id not match");
        LockInfo memory lockInfo = lockInfos[transferId];
        require(lockInfo.isLocked, "lock info not match");
        uint256 targetFee = _sourceAmountToTargetAmount(tokenInfo, lockInfo.fee);

        message = _encodeSlashCall(
            params,
            msg.sender,
            uint112(targetFee),
            uint112(targetPenalty)
        );
    }

    function _withdrawMargin(
        address sourceToken,
        uint112 amount
    ) internal returns(bytes memory message) {
        TokenInfo memory tokenInfo = tokenInfos[sourceToken];
        require(tokenInfo.isRegistered, "token not registered");

        bytes32 providerKey = getDefaultProviderKey(msg.sender, sourceToken, tokenInfo.targetToken);
        LnProviderInfo memory providerInfo = lnProviders[providerKey];
        lnProviders[providerKey].withdrawNonce = providerInfo.withdrawNonce + 1;
        uint256 targetAmount = _sourceAmountToTargetAmount(tokenInfo, amount);
        message = _encodeWithdrawCall(
            providerInfo.lastTransferId,
            providerInfo.withdrawNonce,
            msg.sender,
            sourceToken,
            tokenInfo.targetToken,
            uint112(targetAmount)
        );
    }

    function _encodeSlashCall(
        TransferParameter memory params,
        address slasher,
        uint112 fee,
        uint112 penalty
    ) internal pure returns(bytes memory message) {
        return abi.encodeWithSelector(
           ILnDefaultBridgeTarget.slash.selector,
           params,
           slasher,
           fee,
           penalty
        );
    }

    function _encodeWithdrawCall(
        bytes32 lastTransferId,
        uint64 withdrawNonce,
        address provider,
        address sourceToken,
        address targetToken,
        uint112 amount
    ) internal pure returns(bytes memory message) {
        return abi.encodeWithSelector(
            ILnDefaultBridgeTarget.withdraw.selector,
            lastTransferId,
            withdrawNonce,
            provider,
            sourceToken,
            targetToken,
            amount
        );
    }
}
 
