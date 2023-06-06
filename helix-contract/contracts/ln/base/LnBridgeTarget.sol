// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "../interface/ILnBridgeSource.sol";
import "./LnBridgeHelper.sol";

contract LnBridgeTarget is LnBridgeHelper {
    uint256 constant public MIN_REFUND_TIMESTAMP = 30 * 60;
    struct TransferInfo {
        uint64 nonce;
        uint64 lastRefundNonce;
        uint64 refundStartTime;
    }
    mapping(bytes32 => TransferInfo) public transferInfos;
    mapping(bytes32 => address) public refundReceiver;

    event TransferRelayed(bytes32 transferId, address relayer);
    event CancelTransferInited(bytes32 transferId, uint256 timestamp);

    function transferAndReleaseMargin(
        bytes32 lastTransferId,
        bytes32 lastBlockHash,
        uint64 nonce,
        address token,
        address receiver,
        uint112 amount
    ) payable external {
        TransferInfo memory lastInfo = transferInfos[lastTransferId];
        require(lastInfo.nonce + 1 == nonce, "Invalid last transferId");
        bytes32 transferId = keccak256(abi.encodePacked(
            lastTransferId,
            lastBlockHash,
            nonce,
            token,
            receiver,
            amount));
        TransferInfo memory transferInfo = transferInfos[transferId];
        require(transferInfo.nonce == 0 || transferInfo.refundStartTime > 0, "lnBridgeTarget:message exist");
        require(transferInfo.refundStartTime == 0 || transferInfo.refundStartTime + MIN_REFUND_TIMESTAMP > block.timestamp, "refund time expired");
        if (lastInfo.refundStartTime > 0) {
            transferInfos[transferId] = TransferInfo(nonce, nonce - 1, 0);
        } else {
            transferInfos[transferId] = TransferInfo(nonce, lastInfo.lastRefundNonce, 0);
        }
        if (token == address(0)) {
            require(msg.value == amount, "lnBridgeTarget:invalid amount");
            payable(receiver).transfer(amount);
        } else {
            _safeTransferFrom(token, msg.sender, receiver, uint256(amount));
        }
        emit TransferRelayed(transferId, msg.sender);
    }

    function _encodeRefundCall(
        bytes32 lastRefundTransferId,
        bytes32 transferId,
        address receiver,
        address rewardReceiver
    ) internal pure returns(bytes memory) {
        return abi.encodeWithSelector(
            ILnBridgeSource.refund.selector,
            lastRefundTransferId,
            transferId,
            receiver,
            rewardReceiver
        );
    }

    function _encodeWithdrawMarginCall(
        bytes32 lastRefundTransferId,
        bytes32 lastTransferId,
        address provider,
        uint112 amount
    ) internal pure returns(bytes memory) {
        return abi.encodeWithSelector(
            ILnBridgeSource.withdrawMargin.selector,
            lastRefundTransferId,
            lastTransferId,
            provider,
            amount
        );
    }

    function initCancelTransfer(
        bytes32 lastTransferId,
        bytes32 lastBlockHash,
        address token,
        address receiver,
        uint64 nonce,
        uint112 amount
    ) external {
        TransferInfo memory lastInfo = transferInfos[lastTransferId];
        require(lastInfo.nonce + 1 == nonce, "invalid last transfer nonce");
        bytes32 transferId = keccak256(abi.encodePacked(
            lastTransferId,
            lastBlockHash,
            nonce,
            token,
            receiver,
            amount));
        TransferInfo memory transferInfo = transferInfos[transferId];
        require(transferInfo.nonce == 0, "lnBridgeTarget:message exist");
        require(transferInfo.refundStartTime == 0, "refund has been init");

        uint64 lastRefundNonce = lastInfo.refundStartTime > 0 ? nonce - 1 : lastInfo.lastRefundNonce;
        transferInfos[transferId] = TransferInfo(nonce, lastRefundNonce, uint64(block.timestamp));
        refundReceiver[transferId] = receiver;
        emit CancelTransferInited(transferId, block.timestamp);
    }

    // anyone can cancel
    function _requestCancelTransfer(
        bytes32 lastRefundTransferId,
        bytes32 lastTransferId,
        bytes32 transferId
    ) internal view returns(bytes memory message) {
        TransferInfo memory lastInfo = transferInfos[lastTransferId];
        TransferInfo memory transferInfo = transferInfos[transferId];
        require(transferInfo.nonce == lastInfo.nonce + 1, "invalid last transferInfo");
        require(transferInfo.refundStartTime + MIN_REFUND_TIMESTAMP < block.timestamp, "refund time not expired");
        TransferInfo memory lastRefundInfo = transferInfos[lastRefundTransferId];
        require(lastRefundInfo.nonce == transferInfo.lastRefundNonce, "invalid last refundid");
        address receiver = refundReceiver[transferId];
        require(receiver != address(0), "no receiver");
        return _encodeRefundCall(
            lastRefundTransferId,
            transferId,
            receiver,
            msg.sender
        );
    }

    function _requestWithdrawMargin(
        bytes32 lastRefundTransferId,
        bytes32 lastTransferId,
        uint112 amount
    ) internal view returns(bytes memory message) {
        TransferInfo memory lastInfo = transferInfos[lastTransferId];
        TransferInfo memory lastRefundInfo = transferInfos[lastRefundTransferId];
        require(lastInfo.lastRefundNonce == lastRefundInfo.nonce, "invalid last refundid");

        return _encodeWithdrawMarginCall(
            lastRefundTransferId,
            lastTransferId,
            msg.sender,
            amount
        );
    }
}

