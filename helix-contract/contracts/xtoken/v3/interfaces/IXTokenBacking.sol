// SPDX-License-Identifier: MIT
pragma solidity >=0.8.17;

interface IXTokenBacking {
    function lockAndXIssue(
        uint256 _remoteChainId,
        address _originalToken,
        address _recipient,
        uint256 _amount,
        uint256 _nonce,
        bytes calldata _extData,
        bytes memory _extParams
    ) external payable returns(bytes32 transferId);

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

    function guard() external returns(address);
}
