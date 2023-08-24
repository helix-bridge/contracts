// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@zeppelin-solidity/contracts/proxy/utils/Initializable.sol";
import "./base/LnAccessController.sol";
import "./base/LnOppositeBridgeTarget.sol";
import "./interface/ILineaMessageService.sol";

contract Linea2EthTarget is Initializable, LnAccessController, LnOppositeBridgeTarget {
    ILineaMessageService public messageService;
    address public remoteBridge;

    event WithdrawMargin(bytes32 lastTransferId, uint112 amount);

    receive() external payable {}

    function initialize(address _dao, address _messageService) public initializer {
        messageService = ILineaMessageService(_messageService);
        _initialize(_dao);
    }

    function setRemoteBridge(address _remoteBridge) external onlyDao {
        remoteBridge = _remoteBridge;
    }

    function _sendMessage(
        bytes memory message,
        uint256 fee
    ) internal {
        messageService.sendMessage{ value: fee }(
            remoteBridge,
            fee,
            message
        );
    }

    function slashAndRemoteRefund(
        TransferParameter calldata params,
        bytes32 expectedTransferId
    ) payable external whenNotPaused {
        bytes memory refundCallMessage = _slashAndRemoteRefund(
            params,
            expectedTransferId
        );
        uint256 valueUsed = address(0) == params.targetToken ? params.amount : 0;
        _sendMessage(refundCallMessage, msg.value - valueUsed);
    }

    function retryRemoteRefund(
        bytes32 transferId
    ) payable external whenNotPaused {
        bytes memory refundCallMessage = _retrySlashAndRemoteRefund(transferId);
        _sendMessage(refundCallMessage, msg.value);
    }

    function requestWithdrawMargin(
        bytes32 lastTransferId,
        address sourceToken,
        uint112 amount
    ) payable external whenNotPaused {
        bytes memory cancelWithdrawMarginCall = _requestWithdrawMargin(
            lastTransferId,
            sourceToken,
            amount
        );
        _sendMessage(cancelWithdrawMarginCall, msg.value);
        emit WithdrawMargin(lastTransferId, amount);
    }
}

