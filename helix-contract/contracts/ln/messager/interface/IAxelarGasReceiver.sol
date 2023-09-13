// SPDX-License-Identifier: MIT

pragma solidity ^0.8.10;

interface IAxelarGasReceiver {
    function payNativeGasForContractCall(
        address sender,
        string calldata destinationChain,
        string calldata destinationAddress,
        bytes calldata payload,
        address refundAddress
    ) external payable;
}
 
