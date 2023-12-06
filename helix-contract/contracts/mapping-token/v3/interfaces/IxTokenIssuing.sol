// SPDX-License-Identifier: MIT
pragma solidity >=0.8.17;

interface IxTokenIssuing {
    function handleIssuingForUnlockFailureFromRemote(
        bytes32 transferId,
        address originalToken,
        address originalSender,
        uint256 amount
    ) external;

    function issuexToken(
        address originalToken,
        address recipient,
        uint256 amount
    ) external;
}
