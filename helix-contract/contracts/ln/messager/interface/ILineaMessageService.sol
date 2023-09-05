// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

interface ILineaMessageService {
  function sendMessage(address _to, uint256 _fee, bytes calldata _calldata) external payable;
  function sender() external view returns (address);
}
