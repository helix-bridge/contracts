// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./IHelixMessageHandle.sol";

interface IHelixSub2SubMessageHandle is IHelixMessageHandle {
    function fee() external view returns (uint256);
    function lastRecvMessageId() external view returns (uint256);
    function isMessageDelivered(uint256 messageId) external view returns(bool);
    function sendMessage(
        uint256 remoteReceiveGasLimit,
        uint32  remoteSpecVersion,
        uint64  remoteCallWeight,
        address receiver,
        bytes calldata encoded) external payable returns (uint256);
}
