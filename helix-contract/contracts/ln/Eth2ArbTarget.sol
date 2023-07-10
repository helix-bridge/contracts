// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@arbitrum/nitro-contracts/src/libraries/AddressAliasHelper.sol";
import "@zeppelin-solidity/contracts/proxy/utils/Initializable.sol";
import "./base/LnAccessController.sol";
import "./base/LnDefaultBridgeTarget.sol";

contract Eth2ArbTarget is Initializable, LnAccessController, LnDefaultBridgeTarget {
    address public remoteBridge;
    address public remoteBridgeAlias;

    receive() external payable {}

    modifier onlyRemoteBridge() {
        require(msg.sender == remoteBridgeAlias, "invalid remote caller");
        _;
    }

    function initialize(address dao) public initializer {
        _initialize(dao);
    }

    function setRemoteBridge(address _remoteBridge) external onlyDao {
        remoteBridge = _remoteBridge;
        remoteBridgeAlias = AddressAliasHelper.applyL1ToL2Alias(remoteBridge);
    }

    function setRemoteBridgeAlias(address _remoteBridgeAlias) external onlyDao {
        remoteBridgeAlias = _remoteBridgeAlias;
    }

    function slash(
        TransferParameter memory params,
        address slasher,
        uint112 fee,
        uint112 penalty
    ) external onlyRemoteBridge whenNotPaused {
        _slash(
          params,
          slasher,
          fee,
          penalty);
    }

    function withdrawMargin(
        bytes32 lastTransferId,
        uint64 withdrawNonce,
        address provider,
        address sourceToken,
        uint112 amount
    ) external onlyRemoteBridge whenNotPaused {
        _withdraw(lastTransferId, withdrawNonce, provider, sourceToken, amount);
    }
}

