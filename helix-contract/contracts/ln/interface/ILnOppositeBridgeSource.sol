// SPDX-License-Identifier: MIT

pragma solidity >=0.8.10;

interface ILnOppositeBridgeSource {
    struct TransferParameter {
        bytes32 previousTransferId;
        address provider;
        address sourceToken;
        address targetToken;
        uint112 amount;
        uint64 timestamp;
        address receiver;
    }

    function slash(
        bytes32 lastRefundTransferId,
        bytes32 transferId,
        address provider,
        address sourceToken,
        address slasher
    ) external;

    function withdrawMargin(
        bytes32 lastRefundTransferId,
        bytes32 lastTransferId,
        address provider,
        address sourceToken,
        uint112 amount
    ) external;
}
