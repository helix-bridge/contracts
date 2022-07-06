// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IHelixAppSupportConfirm {
    function onMessageDelivered(uint256 messageId, bool result) external;
}

interface IHelixAppSupportWithdrawFailed {
    function handleWithdrawFailedTransfer(
        uint256 messageId,
        address token,
        address sender,
        uint256 amount
    ) external;
}
