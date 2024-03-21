// SPDX-License-Identifier: MIT
pragma solidity >=0.8.17;

interface IXTokenIssuing {
    function burnAndXUnlock(
        address _xToken,
        address _recipient,
        uint256 _amount,
        uint256 _nonce,
        bytes calldata _extData,
        bytes memory _extParams
    ) external returns(bytes32);
    function rollbackBurnAndXUnlock(
        uint256 originalChainId,
        address originalToken,
        address originalSender,
        address recipient,
        uint256 amount,
        uint256 nonce
    ) external;

    function issue(
        uint256 remoteChainId,
        address originalToken,
        address originalSender,
        address recipient,
        uint256 amount,
        uint256 nonce,
        bytes calldata extData
    ) external;
}
