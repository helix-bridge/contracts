// SPDX-License-Identifier: MIT

pragma solidity >=0.8.10;

interface ILnBridgeSource {
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
