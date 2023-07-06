// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@zeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "./LnBridgeHelper.sol";
import "../interface/ILnPositiveBridgeTarget.sol";

/// @title LnPositiveBridgeSource
/// @notice LnPositiveBridgeSource is a contract to help user transfer token to liquidity node and generate proof,
///         then the liquidity node must transfer the same amount of the token to the user on target chain.
///         Otherwise if timeout the slasher can paid for relayer and slash the transfer, then request refund from lnProvider's margin.
/// @dev See https://github.com/helix-bridge/contracts/tree/master/helix-contract
contract LnPositiveBridgeSource is LnBridgeHelper {
    uint256 constant public MIN_SLASH_TIMESTAMP = 30 * 60;
    uint256 constant public LIQUIDITY_FEE_RATE_BASE = 100000;
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
    // 1. if lastTransferId updated, revert
    // 2. if margin decrease or totalFee increase, revert
    // 3. if margin increase or totalFee decrease, success
    struct Snapshot {
        address provider;
        address token;
        bytes32 transferId;
        uint112 totalFee;
        uint64 withdrawNonce;
    }

    struct TokenInfo {
        uint112 protocolFee;
        uint112 penalty;
    }
    
    struct LockInfo {
        uint64 timestamp;
        uint112 feeAndPenalty;
    }
    // token => token info
    mapping(address=>TokenInfo) public tokenInfos;
    // providerKey => provider info
    mapping(bytes32=>LnProviderInfo) public lnProviders;
    // transferId => lock info
    // hash(provider, token, amount, lastId, recipient, timestamp) => timestamp
    mapping(bytes32=>LockInfo) public lockInfos;

    address public protocolFeeReceiver;

    event TokenLocked(
        bytes32 transferId,
        address provider,
        address token,
        uint112 amount,
        uint112 fee,
        address receiver);
    event LiquidityWithdrawn(address provider, address token, uint112 amount);
    event Refund(bytes32 transferId, uint64 providerKey, address provider, uint112 margin, address slasher);
    // relayer
    event LnProviderUpdated(address provider, address token, uint112 baseFee, uint8 liquidityfeeRate);

    function _setFeeReceiver(address _feeReceiver) internal {
        require(_feeReceiver != address(this), "lnBridgeSource:invalid system fee receiver");
        protocolFeeReceiver = _feeReceiver;
    }

    function _setTokenInfo(address _token, uint112 _protocolFee, uint112 _penalty) internal {
        tokenInfos[_token] = TokenInfo(_protocolFee, _penalty);
    }

    // lnProvider can set provider fee on source chain
    // and it must register on target chain to deposit margin
    function setProviderFee(
        address token,
        uint112 baseFee,
        uint8 liquidityFeeRate
    ) external {
        bytes32 providerKey = getProviderKey(msg.sender, token);
        LnProviderFee memory providerFee = LnProviderFee(baseFee, liquidityFeeRate);

        // we only update the field fee of the provider info
        // if the provider has not been registered, then this line will register, otherwise update fee
        lnProviders[providerKey].fee = providerFee;

        emit LnProviderUpdated(msg.sender, token, baseFee, liquidityFeeRate);
    }

    function calculateProviderFee(LnProviderFee memory fee, uint112 amount) internal pure returns(uint256) {
        return uint256(fee.baseFee) + uint256(fee.liquidityFeeRate) * uint256(amount) / LIQUIDITY_FEE_RATE_BASE;
    }

    // the fee user should paid when transfer.
    // totalFee = providerFee + protocolFee
    function totalFee(address provider, address token, uint112 amount) external view returns(uint256) {
        TokenInfo memory tokenInfo = tokenInfos[token];
        bytes32 providerKey = getProviderKey(provider, token);
        LnProviderInfo memory providerInfo = lnProviders[providerKey];
        uint256 providerFee = calculateProviderFee(providerInfo.fee, amount);
        return providerFee + tokenInfo.protocolFee;
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
        require(amount > 0, "lnBridgeSource:invalid amount");
        bytes32 providerKey = getProviderKey(snapshot.provider, snapshot.token);

        LnProviderInfo memory providerInfo = lnProviders[providerKey];
        uint256 providerFee = calculateProviderFee(providerInfo.fee, amount);

        TokenInfo memory tokenInfo = tokenInfos[snapshot.token];
        
        // the chain state not match snapshot
        require(providerInfo.lastTransferId == snapshot.transferId, "snapshot expired:transfer");
        require(snapshot.withdrawNonce == providerInfo.withdrawNonce, "snapshot expired:withdraw");
        require(snapshot.totalFee >= providerFee + tokenInfo.protocolFee && providerFee > 0, "fee is invalid");
        
        bytes32 transferId = keccak256(abi.encodePacked(
            snapshot.transferId,
            snapshot.provider,
            snapshot.token,
            amount,
            uint64(block.timestamp),
            receiver));
        require(lockInfos[transferId].timestamp == 0, "lnBridgeSource:transferId exist");
        // if the transfer refund, then the fee and penalty should be given to slasher, but the protocol fee is ignored
        // and we use the penalty value configure at the moment transfer confirmed
        lockInfos[transferId] = LockInfo(uint64(block.timestamp), snapshot.totalFee + tokenInfo.penalty);

        // update the state to prevent other transfers using the same snapshot
        lnProviders[providerKey].lastTransferId = transferId;

        if (snapshot.token == address(0)) {
            require(amount + snapshot.totalFee == msg.value, "lnBridgeSource:amount unmatched");
            payable(snapshot.provider).transfer(amount + providerFee);
            if (tokenInfo.protocolFee > 0) {
                payable(protocolFeeReceiver).transfer(tokenInfo.protocolFee);
            }
        } else {
            _safeTransferFrom(
                snapshot.token,
                msg.sender,
                snapshot.provider,
                amount + providerFee
            );
            if (tokenInfo.protocolFee > 0) {
                _safeTransferFrom(
                    snapshot.token,
                    msg.sender,
                    protocolFeeReceiver,
                    tokenInfo.protocolFee 
                );
            }
        }
        emit TokenLocked(
            transferId,
            snapshot.provider,
            snapshot.token,
            amount,
            uint112(providerFee),
            receiver);
    }

    function _slashAndRemoteRelease(
        bytes32 lastTransferId,
        address provider,
        address token,
        uint112 amount,
        address receiver,
        uint64 timestamp
    ) internal view returns(bytes memory message) {
        require(block.timestamp > timestamp + MIN_SLASH_TIMESTAMP, "invalid timestamp");

        bytes32 transferId = keccak256(abi.encodePacked(
            lastTransferId,
            provider,
            token,
            amount,
            timestamp,
            receiver));
        LockInfo memory lockInfo = lockInfos[transferId];
        require(lockInfo.timestamp == timestamp && timestamp > 0, "lock info not match");

        message = _encodeSlashCall(
            lastTransferId,
            provider,
            msg.sender,
            token,
            amount,
            timestamp,
            receiver
        );
    }

    function _withdrawMargin(
        address token,
        uint112 amount
    ) internal returns(bytes memory message) {
        bytes32 providerKey = getProviderKey(msg.sender, token);
        LnProviderInfo memory providerInfo = lnProviders[providerKey];
        lnProviders[providerKey].withdrawNonce += 1;
        message = _encodeWithdrawCall(
            providerInfo.lastTransferId,
            providerInfo.withdrawNonce,
            msg.sender,
            token,
            amount
        );
    }

    function _encodeSlashCall(
        bytes32 lastTransferId,
        address provider,
        address slasher,
        address token,
        uint112 amount,
        uint64 timestamp,
        address receiver
    ) internal pure returns(bytes memory message) {
        return abi.encodeWithSelector(
            ILnPositiveBridgeTarget.slash.selector,
            lastTransferId,
            provider,
            slasher,
            token,
            amount,
            timestamp,
            receiver
        );
    }

    function _encodeWithdrawCall(
        bytes32 lastTransferId,
        uint64 withdrawNonce,
        address provider,
        address token,
        uint112 amount
    ) internal pure returns(bytes memory message) {
        return abi.encodeWithSelector(
            ILnPositiveBridgeTarget.withdraw.selector,
            lastTransferId,
            withdrawNonce,
            provider,
            token,
            amount
        );
    }
}
 
