// SPDX-License-Identifier: MIT
pragma solidity >=0.8.17;

interface IxTokenBacking {
    function unlockFromRemote(
        address originalToken,
        address recipient,
        uint256 amount
    ) external;

    function handleUnlockForIssuingFailureFromRemote(
        address originalToken,
        address originalSender,
        uint256 amount
    ) external;
}
