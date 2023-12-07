// SPDX-License-Identifier: MIT
pragma solidity >=0.8.17;

interface IxTokenIssuing {
    function handleIssuingForUnlockFailureFromRemote(
        uint256 remoteChainId,
        bytes32 transferId,
        address originalToken,
        address originalSender,
        uint256 amount
    ) external;

    function issuexToken(
        uint256 remoteChainId,
        address originalToken,
        address recipient,
        uint256 amount
    ) external;
}
