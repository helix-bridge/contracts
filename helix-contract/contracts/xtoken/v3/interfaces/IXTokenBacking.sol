// SPDX-License-Identifier: MIT
pragma solidity >=0.8.17;

interface IXTokenBacking {
    function lockAndXIssue(
        uint256 remoteChainId,
        address originalToken,
        address recipient,
        address rollbackAccount,
        uint256 amount,
        uint256 nonce,
        bytes calldata extData,
        bytes memory extParams
    ) external payable returns(bytes32 transferId);

    function unlock(
        uint256 remoteChainId,
        address originalToken,
        address originalSender,
        address recipient,
        address rollbackAccount,
        uint256 amount,
        uint256 nonce,
        bytes calldata extData
    ) external;

    function rollbackLockAndXIssue(
        uint256 remoteChainId,
        address originalToken,
        address originalSender,
        address recipient,
        address rollbackAccount,
        uint256 amount,
        uint256 nonce
    ) external;

    function guard() external returns(address);
}
