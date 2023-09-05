// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

interface ILowLevelMessager {
    function registerBridgePair(uint256 remoteChainId, address remoteBridge) external;
    function sendMessage(uint256 remoteChainId, bytes memory message, bytes memory params) external payable;
}
