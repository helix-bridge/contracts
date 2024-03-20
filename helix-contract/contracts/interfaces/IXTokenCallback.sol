// SPDX-License-Identifier: MIT
pragma solidity >=0.8.17;

interface IXTokenCallback {
    function xTokenCallback(
        uint256 transferId,
        address xToken,
        uint256 amount,
        bytes calldata extData
    ) external;
}

interface IXTokenRollbackCallback {
    function xTokenRollbackCallback(
        uint256 transferId,
        address token,
        uint256 amount
    ) external;
}
