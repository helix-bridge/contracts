// SPDX-License-Identifier: MIT

pragma solidity >=0.8.10;

interface ILnBridgeBackingV2 {
    function refund(
        bytes32 lastRefundTransferId,
        bytes32 transferId,
        address receiver,
        address rewardReceiver
    ) external;
    function withdrawMargin(
        bytes32 lastRefundTransferId,
        bytes32 lastTransferId,
        address provider,
        uint112 amount
    ) external;

}
