// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "../interface/ILnBridgeBackingV2.sol";
import "./LnBridgeHelper.sol";

contract LnBridgeIssuingV2 is LnBridgeHelper {
    uint256 constant public MIN_WITHDRAW_TIMESTAMP = 30 * 60;
    struct IssuedMessageInfo {
        uint64 timestamp;
        uint64 nonce;
        uint64 lastRefundNonce;
        uint64 refundStartTime;
    }
    mapping(bytes32 => IssuedMessageInfo) public issuedMessages;

    event TransferRelayed(bytes32 transferId, address relayer);

    function relay(
        bytes32 lastTransferId,
        uint64 nonce,
        uint64 timestamp,
        address token,
        address sender,
        address receiver,
        uint112 amount,
        uint64 sourceChainId,
        bool issuingNative
    ) payable external {
        IssuedMessageInfo memory lastInfo = issuedMessages[lastTransferId];
        require(lastInfo.nonce + 1 == nonce, "Invalid last transferId");
        bytes32 transferId = keccak256(abi.encodePacked(
            lastTransferId,
            timestamp,
            nonce,
            issuingNative,
            token,
            sender,
            receiver,
            amount,
            sourceChainId,
            uint64(block.chainid)));
        IssuedMessageInfo memory transferInfo = issuedMessages[transferId];
        require(transferInfo.nonce == 0, "lpBridgeIssuing:message exist");
        require(transferInfo.refundStartTime == 0 || transferInfo.refundStartTime + MIN_WITHDRAW_TIMESTAMP < block.timestamp, "refund time expired");
        if (lastInfo.refundStartTime > 0) {
            issuedMessages[transferId] = IssuedMessageInfo(timestamp, nonce, nonce - 1, 0);
        } else {
            issuedMessages[transferId] = IssuedMessageInfo(timestamp, nonce, lastInfo.lastRefundNonce, 0);
        }
        if (issuingNative) {
            require(msg.value == amount, "lpBridgeIssuing:invalid amount");
            payable(receiver).transfer(amount);
        } else {
            _safeTransferFrom(token, msg.sender, receiver, uint256(amount));
        }
        emit TransferRelayed(transferId, msg.sender);
    }

    // only lpProvider can request withdraw liquidity
    function _encodeWithdrawLiquidity(
        bytes32 lastTransferId,
        bytes32 transferId,
        address receiver,
        address fundReceiver,
        uint64 timestamp
    ) public pure returns(bytes memory) {
        return abi.encodeWithSelector(
            ILnBridgeBackingV2.withdrawLiquidity.selector,
            lastTransferId,
            transferId,
            receiver,
            fundReceiver,
            timestamp
        );
    }

    function _initCancelIssuing(
        bytes32 transferId
    ) internal {
        IssuedMessageInfo memory transferInfo = issuedMessages[transferId];
        require(transferInfo.nonce == 0, "lpBridgeIssuing:message exist");
        require(transferInfo.refundStartTime == 0, "refund has been init");
        issuedMessages[transferId] = IssuedMessageInfo(0, 0, 0, uint64(block.timestamp));
    }

    // anyone can cancel
    function _cancelIssuing(
        bytes32 lastTransferId,
        uint64 nonce,
        uint64 timestamp,
        address token,
        address sender,
        address receiver,
        uint112 amount,
        uint64 sourceChainId,
        bool issuingNative
    ) internal returns(bytes32 transferId) {
        IssuedMessageInfo memory lastInfo = issuedMessages[lastTransferId];
        require(lastInfo.nonce + 1 == nonce, "invalid last transfer nonce");
        transferId = keccak256(abi.encodePacked(
            lastTransferId,
            timestamp,
            nonce,
            issuingNative,
            token,
            sender,
            receiver,
            amount,
            sourceChainId,
            uint64(block.chainid)));
        IssuedMessageInfo memory transferInfo = issuedMessages[transferId];
        require(transferInfo.nonce == 0, "lpBridgeIssuing:message exist");
        require(transferInfo.refundStartTime + MIN_WITHDRAW_TIMESTAMP > block.timestamp, "refund time expired");
        if (lastInfo.refundStartTime > 0) {
            issuedMessages[transferId] = IssuedMessageInfo(timestamp, nonce, nonce - 1, transferInfo.refundStartTime);
        } else {
            issuedMessages[transferId] = IssuedMessageInfo(timestamp, nonce, lastInfo.lastRefundNonce, transferInfo.refundStartTime);
        }
    }
}

