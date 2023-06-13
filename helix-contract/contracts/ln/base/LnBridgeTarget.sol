// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "../interface/ILnBridgeSource.sol";
import "./LnBridgeHelper.sol";

contract LnBridgeTarget is LnBridgeHelper {
    uint256 constant public MIN_REFUND_TIMESTAMP = 30 * 60;
    struct TransferInfo {
        uint48 nonce;
        uint48 lastRefundNonce;
        address slasher;
    }

    mapping(bytes32 => TransferInfo) public transferInfos;

    event TransferFilled(bytes32 transferId, address slasher);

    // fill transfer
    // 1. if transfer is not refund or relayed, LnProvider relay message to fill the transfer, and the transfer finished on target chain
    // 2. if transfer is timeout and not processed, slasher(any account) can fill the transfer and request refund
    // if it's filled by slasher, we store the address of the slasher
    // expectedTransferId used to ensure the parameter is the same as on source chain
    function _fillTransfer(
        TransferParameter calldata params,
        bytes32 expectedTransferId,
        address slasher
    ) internal returns(bytes32 transferId) {
        TransferInfo memory lastInfo = transferInfos[params.lastTransferId];
        require(lastInfo.nonce + 1 == params.nonce, "Invalid last transferId");
        transferId = keccak256(abi.encodePacked(
            params.lastTransferId,
            params.lastBlockHash,
            params.nonce,
            params.timestamp,
            params.token,
            params.receiver,
            params.amount));
        require(expectedTransferId == transferId, "check expected transferId failed");
        TransferInfo memory transferInfo = transferInfos[transferId];
        // Make sure this transfer was never filled before 
        require(transferInfo.nonce == 0, "lnBridgeTarget:message exist");
        // Find the previous refund fill, it is a refund fill if the slasher is not zero address.
        // We optimise storage gas by using nonce of fill id for that refund instead of directly use fill id.
        uint48 lastRefundNonce = lastInfo.slasher != address(0) ? lastInfo.nonce : lastInfo.lastRefundNonce;
        transferInfos[transferId] = TransferInfo(params.nonce, lastRefundNonce, slasher);
        if (params.token == address(0)) {
            require(msg.value >= params.amount, "lnBridgeTarget:invalid amount");
            payable(params.receiver).transfer(params.amount);
        } else {
            _safeTransferFrom(params.token, msg.sender, params.receiver, uint256(params.amount));
        }
        emit TransferFilled(transferId, slasher);
    }

    function transferAndReleaseMargin(
        TransferParameter calldata params,
        bytes32 expectedTransferId
    ) payable external {
        _fillTransfer(params, expectedTransferId, address(0));
    }

    // The condition for slash is that the transfer has timed out
    // Meanwhile we need to request a refund transaction to the source chain to withdraw the LnProvider's margin
    // On the source chain, we need to verify all the transfers before has been relayed or slashed.
    // So we needs to carry the the previous refund transferId to ensure that the slash is continuous.
    function _slashAndRemoteRefund(
        TransferParameter calldata params,
        bytes32 expectedTransferId,
        bytes32 lastRefundTransferId
    ) internal returns(bytes memory message) {
        require(block.timestamp > params.timestamp + MIN_REFUND_TIMESTAMP, "refund time not expired");
        bytes32 transferId = _fillTransfer(params, expectedTransferId, msg.sender);
        // The same nonce indicate they have same transfer Id.
        require(transferInfos[lastRefundTransferId].nonce == transferInfos[transferId].lastRefundNonce, "invalid last refund nonce");
        // Do not refund `transferId` in source chain unless `lastRefundTransferId` has been refunded
        message = _encodeRefundCall(
            lastRefundTransferId,
            transferId,
            msg.sender
        );
    }

    // we use this to verify that the transfer has been slashed by user and it can resend the refund request
    function verifyAndGetSlasher(
        bytes32 lastRefundTransferId,
        bytes32 transferId
    ) public view returns(address slasher) {
        TransferInfo memory transferInfo = transferInfos[transferId];
        TransferInfo memory lastRefundInfo = transferInfos[lastRefundTransferId];
        require(lastRefundInfo.nonce == transferInfo.lastRefundNonce, "invalid last refund transfer");
        return transferInfo.slasher;
    }

    function _encodeRefundCall(
        bytes32 lastRefundTransferId,
        bytes32 transferId,
        address slasher
    ) internal pure returns(bytes memory) {
        return abi.encodeWithSelector(
            ILnBridgeSource.refund.selector,
            lastRefundTransferId,
            transferId,
            slasher
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

