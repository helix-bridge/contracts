// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "../interface/ILnBridgeSource.sol";
import "./LnBridgeHelper.sol";

contract LnOppositeBridgeTarget is LnBridgeHelper {
    uint256 constant public MIN_REFUND_TIMESTAMP = 30 * 60;

    // if slasher == address(0), this FillTransfer is relayed by lnProvider
    // otherwise, this FillTransfer is slashed by slasher
    // if there is no slash transfer before, then it's latestSlashTransferId is assigned by INIT_SLASH_TRANSFER_ID, a special flag
    struct SlashInfo {
        address provider;
        address sourceToken;
        address slasher;
    }

    // transferId => latest slash transfer Id
    mapping(bytes32 => bytes32) public fillTransfers;
    // transferId => Slash info
    mapping(bytes32 => SlashInfo) public slashInfos;

    event TransferFilled(bytes32 transferId, address slasher);

    // if slasher is nonzero, then it's a slash fill transfer
    function _checkPreviousAndFillTransfer(
        bytes32 transferId,
        bytes32 previousTransferId
    ) internal {
        // the first fill transfer, we fill the INIT_SLASH_TRANSFER_ID as the latest slash transferId
        if (previousTransferId == bytes32(0)) {
            fillTransfers[transferId] = INIT_SLASH_TRANSFER_ID;
        } else {
            // Find the previous refund fill, it is a refund fill if the slasher is not zero address.
            bytes32 previousLatestSlashTransferId = fillTransfers[previousTransferId];
            require(previousLatestSlashTransferId != bytes32(0), "invalid latest slash transfer");

            SlashInfo memory previousSlashInfo = slashInfos[previousTransferId];
            // we use latestSlashTransferId to store the latest slash transferId
            // 1. if previous.slasher != 0, then previous has been filled
            // 2. if previous.latestSlashTransferId != 0, then previous has been filled
            bytes32 latestSlashTransferId = previousSlashInfo.slasher != address(0) ? previousTransferId : previousLatestSlashTransferId;

            fillTransfers[transferId] = latestSlashTransferId;
        }
    }

    // fill transfer
    // 1. if transfer is not refund or relayed, LnProvider relay message to fill the transfer, and the transfer finished on target chain
    // 2. if transfer is timeout and not processed, slasher(any account) can fill the transfer and request refund
    // if it's filled by slasher, we store the address of the slasher
    // expectedTransferId used to ensure the parameter is the same as on source chain
    // some cases
    // 1) If transferId is not exist on source chain, it'll be rejected by source chain when refund.
    // 2) If transferId exist on source chain. We have the same hash process on source and target chain, so the previousTransferId is trusted.
    //    2.1) If transferId is the first transfer Id of this provider, then previousTransferId is zero and the latestSlashTransferId is INIT_SLASH_TRANSFER_ID
    //    2.2) If transferId is not the first transfer, then it's latestSlashTransferId has the next two scenarios
    //         * the previousTransfer is a refund transfer, then latestSlashTransferId is previousTransferId
    //         * the previousTransfer is a normal relayed transfer, then latestSlashTransferId is previousTransfer's latestSlashTransferId
    //    I.   transferId is trusted => previousTransferId is trusted => previousTransfer.previousTransferId is trusted => ... => firstTransfer is trusted
    //    II.  transferId is trusted => previousTransferId is trusted => latestSlashTransferId is trusted if previousTransfer is a refund transfer
    //    III. Both I and II => latestSlashTransferId is trusted if previousTransfer is normal relayed tranfer
    function _fillTransfer(
        TransferParameter calldata params,
        bytes32 expectedTransferId
    ) internal {
        bytes32 transferId = keccak256(abi.encodePacked(
            params.previousTransferId,
            params.provider,
            params.sourceToken,
            params.targetToken,
            params.receiver,
            params.lastBlockHash,
            params.timestamp,
            params.amount));
        require(expectedTransferId == transferId, "check expected transferId failed");
        bytes32 latestSlashTransferId = fillTransfers[transferId];
        // Make sure this transfer was never filled before 
        require(latestSlashTransferId == bytes32(0), "lnBridgeTarget:message exist");

        _checkPreviousAndFillTransfer(transferId, params.previousTransferId);

        if (params.targetToken == address(0)) {
            require(msg.value >= params.amount, "lnBridgeTarget:invalid amount");
            payable(params.receiver).transfer(params.amount);
        } else {
            _safeTransferFrom(params.targetToken, msg.sender, params.receiver, uint256(params.amount));
        }
    }

    function transferAndReleaseMargin(
        TransferParameter calldata params,
        bytes32 expectedTransferId
    ) payable external {
        // normal relay message, fill slasher as zero
        _fillTransfer(params, expectedTransferId);

        emit TransferFilled(expectedTransferId, address(0));
    }

    // The condition for slash is that the transfer has timed out
    // Meanwhile we need to request a refund transaction to the source chain to withdraw the LnProvider's margin
    // On the source chain, we need to verify all the transfers before has been relayed or slashed.
    // So we needs to carry the the previous shash transferId to ensure that the slash is continuous.
    function _slashAndRemoteRefund(
        TransferParameter calldata params,
        bytes32 expectedTransferId
    ) internal returns(bytes memory message) {
        require(block.timestamp > params.timestamp + MIN_REFUND_TIMESTAMP, "refund time not expired");
        _fillTransfer(params, expectedTransferId);

        // slasher = msg.sender
        slashInfos[expectedTransferId] = SlashInfo(params.provider, params.sourceToken, msg.sender);

        // Do not refund `transferId` in source chain unless `latestSlashTransferId` has been refunded
        message = _encodeSlashCall(
            fillTransfers[expectedTransferId],
            expectedTransferId,
            params.provider,
            params.sourceToken,
            msg.sender
        );
        emit TransferFilled(expectedTransferId, msg.sender);
    }

    // we use this to verify that the transfer has been slashed by user and it can resend the refund request
    function _retrySlashAndRemoteRefund(bytes32 transferId) internal view returns(bytes memory message) {
        bytes32 latestSlashTransferId = fillTransfers[transferId];
        // transfer must be filled
        require(latestSlashTransferId != bytes32(0), "invalid transfer id");
        // transfer must be slashed
        SlashInfo memory slashInfo = slashInfos[transferId];
        require(slashInfo.slasher != address(0), "slasher not exist");
        message = _encodeSlashCall(
            latestSlashTransferId,
            transferId,
            slashInfo.provider,
            slashInfo.sourceToken,
            slashInfo.slasher
        );
    }

    function _encodeSlashCall(
        bytes32 latestSlashTransferId,
        bytes32 transferId,
        address provider,
        address sourceToken,
        address slasher
    ) internal pure returns(bytes memory) {
        return abi.encodeWithSelector(
            ILnBridgeSource.slash.selector,
            latestSlashTransferId,
            transferId,
            provider,
            sourceToken,
            slasher
        );
    }

    function _requestWithdrawMargin(
        bytes32 lastTransferId,
        address sourceToken,
        uint112 amount
    ) internal view returns(bytes memory message) {
        bytes32 latestSlashTransferId = fillTransfers[lastTransferId];
        require(latestSlashTransferId != bytes32(0), "invalid last transfer");

        return abi.encodeWithSelector(
            ILnBridgeSource.withdrawMargin.selector,
            latestSlashTransferId,
            lastTransferId,
            msg.sender,
            sourceToken,
            amount
        );
    }
}

