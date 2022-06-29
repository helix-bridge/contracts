// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./IHelixMessageHandle.sol";

interface IHelixMessageHandleSupportUnlockFailed is IHelixMessageHandle {
    function latestRecvMessageId() external view returns (uint256);
    function sendMessage(
        uint256 remoteReceiveGasLimit,
        uint32  remoteSpecVersion,
        uint64  remoteCallWeight,
        address receiver,
        bytes calldata encoded) external payable returns (uint256);
}
