// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@zeppelin-solidity/contracts/proxy/utils/Initializable.sol";
import "./base/LnAccessController.sol";
import "./base/LnDefaultBridgeTarget.sol";
import "./interface/ILineaMessageService.sol";

contract Eth2LineaTarget is Initializable, LnAccessController, LnDefaultBridgeTarget {
    address public remoteBridge;
    address public messageService;

    receive() external payable {}

    modifier onlyRemoteBridge() {
        require(msg.sender == messageService, "invalid msg.sender");
        require(ILineaMessageService(messageService).sender() == remoteBridge, "invalid remote caller");
        _;
    }

    function initialize(address _dao, address _messageService) public initializer {
        _initialize(_dao);
        messageService = _messageService;
    }

    function setRemoteBridge(address _remoteBridge) external onlyDao {
        remoteBridge = _remoteBridge;
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

