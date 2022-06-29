// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IHelixAppSupportConfirm {
    function onMessageDelivered(uint256 messageId, bool result) external;
}

interface IHelixAppSupportUnlockFailed {
    function handleFailedRemoteOperation(
        uint256 messageId,
        address token,
        address sender,
        uint256 amount,
        bytes32[] memory proof,
        uint64 index
    ) external;
    function unlockForFailedRemoteOperation(
        uint256 messageId,
        address token,
        address sender,
        uint256 amount,
        bytes32[] memory proof,
        uint64 index
    ) external;
}
