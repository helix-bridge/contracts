// SPDX-License-Identifier: MIT

pragma solidity >=0.8.10;

interface ILnBridgeSource {
    function refund(
        bytes32 lastRefundTransferId,
        bytes32 transferId,
        address slasher
    ) external;
    function withdrawMargin(
        bytes32 lastRefundTransferId,
        bytes32 lastTransferId,
        address provider,
        uint112 amount
    ) external;

}
