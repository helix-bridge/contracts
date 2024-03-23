// SPDX-License-Identifier: MIT
pragma solidity >=0.8.17;

interface IXRINGLockBox {
    function depositFor(address to, uint256 amount) external;
    function withdraw(uint256 amount) external;
}
