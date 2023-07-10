// SPDX-License-Identifier: MIT

pragma solidity >=0.8.10;
import "../base/LnBridgeHelper.sol";

interface ILnDefaultBridgeTarget {
    function slash(
        LnBridgeHelper.TransferParameter memory params,
        address slasher,
        uint112 fee,
        uint112 penalty
    ) external;

    function withdraw(
        bytes32 lastTransferId,
        uint64 withdrawNonce,
        address provider,
        address token,
        uint112 amount
    ) external;
}

