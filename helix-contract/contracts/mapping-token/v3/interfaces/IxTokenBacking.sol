// SPDX-License-Identifier: MIT
pragma solidity >=0.8.17;

interface IxTokenBacking {
    function unlockFromRemote(
        uint256 remoteChainId,
        address originalToken,
        address recipient,
        uint256 amount
    ) external;

    function handleUnlockForIssuingFailureFromRemote(
        uint256 remoteChainId,
        bytes32 transferId,
        address originalToken,
        address originalSender,
        uint256 amount
    ) external;
}
