// SPDX-License-Identifier: MIT

pragma solidity >=0.8.10;

interface ILnBridgeBackingV2 {
    function withdrawLiquidity(
        bytes32 lastTransferId,
        bytes32 transferId,
        address receiver,
        address sourceSender,
        uint64 timestamp
    ) external;
}
