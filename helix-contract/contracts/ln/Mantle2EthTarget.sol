// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@zeppelin-solidity/contracts/proxy/utils/Initializable.sol";
import "./base/LnAccessController.sol";
import "./base/LnOppositeBridgeTarget.sol";
import "./interface/ICrossDomainMessenger.sol";

contract Mantle2EthTarget is Initializable, LnAccessController, LnOppositeBridgeTarget {
    address public remoteBridge;
    ICrossDomainMessenger public crossDomainMessenger;

    event WithdrawMargin(bytes32 lastTransferId, uint112 amount);

    receive() external payable {}

    function initialize(address _dao, address _crossDomainMessenger) public initializer {
        crossDomainMessenger = ICrossDomainMessenger(_crossDomainMessenger);
        _initialize(_dao);
    }

    function setRemoteBridge(address _remoteBridge) external onlyDao {
        remoteBridge = _remoteBridge;
    }

    function _sendMessage(
        bytes memory message,
        uint256 l2GasLimit
    ) internal {
        crossDomainMessenger.sendMessage(
            remoteBridge,
            message,
            uint32(l2GasLimit)
        );
    }

    function slashAndRemoteRefund(
        TransferParameter calldata params,
        bytes32 expectedTransferId,
        uint256 l2GasLimit
    ) payable external whenNotPaused {
        bytes memory refundCallMessage = _slashAndRemoteRefund(
            params,
            expectedTransferId
        );
        _sendMessage(refundCallMessage, l2GasLimit);
    }

    function retryRemoteRefund(
        bytes32 transferId,
        uint256 l2GasLimit
    ) payable external whenNotPaused {
        bytes memory refundCallMessage = _retrySlashAndRemoteRefund(transferId);
        _sendMessage(refundCallMessage, l2GasLimit);
    }

    function requestWithdrawMargin(
        bytes32 lastTransferId,
        address sourceToken,
        uint112 amount,
        uint256 l2GasLimit
    ) payable external whenNotPaused {
        bytes memory cancelWithdrawMarginCall = _requestWithdrawMargin(
            lastTransferId,
            sourceToken,
            amount
        );
        _sendMessage(cancelWithdrawMarginCall, l2GasLimit);
        emit WithdrawMargin(lastTransferId, amount);
    }
}

