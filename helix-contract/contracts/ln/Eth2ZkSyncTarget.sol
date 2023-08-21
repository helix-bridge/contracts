// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@zeppelin-solidity/contracts/proxy/utils/Initializable.sol";
import "./base/LnAccessController.sol";
import "./base/LnDefaultBridgeTarget.sol";

contract Eth2ZkSyncTarget is Initializable, LnAccessController, LnDefaultBridgeTarget {
    uint160 constant offset = uint160(0x1111000000000000000000000000000000001111);
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
        // l1 address to l2 address
        remoteBridgeAlias = address(uint160(_remoteBridge) + offset);
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
          penalty
        );
    }

    function withdraw(
        bytes32 lastTransferId,
        uint64 withdrawNonce,
        address provider,
        address sourceToken,
        address targetToken,
        uint112 amount
    ) external onlyRemoteBridge whenNotPaused {
        _withdraw(lastTransferId, withdrawNonce, provider, sourceToken, targetToken, amount);
    }
}

