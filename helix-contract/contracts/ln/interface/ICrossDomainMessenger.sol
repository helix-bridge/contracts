// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

interface ICrossDomainMessenger {
    function sendMessage(
        address _target,
        bytes calldata _message,
        uint32 _gasLimit
    ) external;

    function xDomainMessageSender() external view returns (address);
}

