// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@zeppelin-solidity/contracts/proxy/utils/Initializable.sol";
import "./base/LnAccessController.sol";
import "./base/LnOppositeBridgeTarget.sol";
import "./interface/IZksyncMailbox.sol";

contract ZkSync2EthTarget is Initializable, LnAccessController, LnOppositeBridgeTarget {
    IMailbox public mailbox;
    address public remoteBridge;

    event WithdrawMargin(bytes32 lastTransferId, uint112 amount);

    receive() external payable {}

    function initialize(address _dao, address _mailBox) public initializer {
        mailbox = IMailbox(_mailBox);
        _initialize(_dao);
    }

    function setRemoteBridge(address _remoteBridge) external onlyDao {
        remoteBridge = _remoteBridge;
    }

    function l2Fee(
        uint256 gasPrice,
        uint256 l2GasLimit,
        uint256 l2GasPerPubdataByteLimit
    ) external view returns(uint256) {
        return mailbox.l2TransactionBaseCost(gasPrice, l2GasLimit, l2GasPerPubdataByteLimit);
    }

    function _sendMessage(
        uint256 l2GasLimit,
        uint256 l2GasPerPubdataByteLimit,
        bytes memory message,
        uint256 prepaid
    ) internal returns(bytes32) {
        return mailbox.requestL2Transaction{ value: prepaid }(
            remoteBridge,
            0,
            message,
            l2GasLimit,
            l2GasPerPubdataByteLimit,
            new bytes[](0),
            msg.sender
        );
    }

    function slashAndRemoteRefund(
        TransferParameter calldata params,
        bytes32 expectedTransferId,
        uint256 l2GasLimit,
        uint256 l2GasPerPubdataByteLimit
    ) payable external whenNotPaused {
        bytes memory refundCallMessage = _slashAndRemoteRefund(
            params,
            expectedTransferId
        );
        uint256 valueUsed = address(0) == params.targetToken ? params.amount : 0;
        _sendMessage(l2GasLimit, l2GasPerPubdataByteLimit, refundCallMessage, msg.value - valueUsed);
    }

    function retryRemoteRefund(
        bytes32 transferId,
        uint256 l2GasLimit,
        uint256 l2GasPerPubdataByteLimit
    ) payable external whenNotPaused {
        bytes memory refundCallMessage = _retrySlashAndRemoteRefund(transferId);
        _sendMessage(l2GasLimit, l2GasPerPubdataByteLimit, refundCallMessage, msg.value);
    }

    function requestWithdrawMargin(
        bytes32 lastTransferId,
        address sourceToken,
        uint112 amount,
        uint256 l2GasLimit,
        uint256 l2GasPerPubdataByteLimit
    ) payable external whenNotPaused {
        bytes memory cancelWithdrawMarginCall = _requestWithdrawMargin(
            lastTransferId,
            sourceToken,
            amount
        );
        _sendMessage(l2GasLimit, l2GasPerPubdataByteLimit, cancelWithdrawMarginCall, msg.value);
        emit WithdrawMargin(lastTransferId, amount);
    }
}

