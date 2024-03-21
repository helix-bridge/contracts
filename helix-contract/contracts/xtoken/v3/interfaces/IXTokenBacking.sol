// SPDX-License-Identifier: MIT
pragma solidity >=0.8.17;

interface IXTokenBacking {
    function unlock(
        uint256 remoteChainId,
        address originalToken,
        address originalSender,
        address recipient,
        uint256 amount,
        uint256 nonce,
        bytes calldata extData
    ) external;

    function rollbackLockAndXIssue(
        uint256 remoteChainId,
        address originalToken,
        address originalSender,
        address recipient,
        uint256 amount,
        uint256 nonce
    ) external;
}
