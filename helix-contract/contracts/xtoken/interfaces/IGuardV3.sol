// SPDX-License-Identifier: MIT

pragma solidity >=0.8.10;

interface IGuardV3 {
  function deposit(uint256 id, address token, address recipient, uint256 amount, bytes calldata extData) external;
}

