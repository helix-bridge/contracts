// SPDX-License-Identifier: MIT
pragma solidity >=0.8.17;

interface IXTokenIssuing {
    function burnAndXUnlock(
        address xToken,
        address recipient,
        address rollbackAccount,
        uint256 amount,
        uint256 nonce,
        bytes calldata extData,
        bytes memory extParams
    ) external payable returns(bytes32);

    function rollbackBurnAndXUnlock(
        uint256 originalChainId,
        address originalToken,
        address originalSender,
        address recipient,
        address rollbackAccount,
        uint256 amount,
        uint256 nonce
    ) external;

    function issue(
        uint256 remoteChainId,
        address originalToken,
        address originalSender,
        address recipient,
        address rollbackAccount,
        uint256 amount,
        uint256 nonce,
        bytes calldata extData
    ) external;

    function guard() external returns(address);
}

