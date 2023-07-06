// SPDX-License-Identifier: MIT

pragma solidity >=0.8.10;

interface ILnPositiveBridgeTarget {
    function slash(
        bytes32 lastTransferId,
        address provider,
        address slasher,
        address token,
        uint112 amount,
        uint64 timestamp,
        address receiver
    ) external;
    function withdraw(
        bytes32 lastTransferId,
        uint64 withdrawNonce,
        address provider,
        address token,
        uint112 amount
    ) external;
}

