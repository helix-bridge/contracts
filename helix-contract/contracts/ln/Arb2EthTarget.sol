// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@arbitrum/nitro-contracts/src/bridge/IInbox.sol";
import "@zeppelin-solidity/contracts/proxy/utils/Initializable.sol";
import "./base/LnAccessController.sol";
import "./base/LnOppositeBridgeTarget.sol";

contract Arb2EthTarget is Initializable, LnAccessController, LnOppositeBridgeTarget {
    IInbox public inbox;
    address public remoteBridge;

    event WithdrawMargin(bytes32 lastTransferId, uint112 amount);

    receive() external payable {}

    function initialize(address _dao, address _inbox) public initializer {
        inbox = IInbox(_inbox);
        _initialize(_dao);
    }

    function setRemoteBridge(address _remoteBridge) external onlyDao {
        remoteBridge = _remoteBridge;
    }

    function submissionRefundFee(
        uint256 baseFee,
        bytes32 latestSlashTransferId,
        bytes32 transferId,
        address provider,
        address sourceToken,
        address slasher,
        uint256 percentIncrease
    ) external view returns(uint256) {
        bytes memory slashCall = _encodeSlashCall(
            latestSlashTransferId,
            transferId,
            provider,
            sourceToken,
            slasher
        );
        uint256 fee = inbox.calculateRetryableSubmissionFee(slashCall.length, baseFee);
        return fee + fee * percentIncrease / 100;
    }

    function submissionWithdrawFee(
        uint256 baseFee,
        bytes32 lastTransferId,
        address sourceToken,
        uint112 amount,
        uint256 percentIncrease
    ) external view returns(uint256) {
        bytes memory withdrawCall = _requestWithdrawMargin(
            lastTransferId,
            sourceToken,
            amount
        );
        uint256 fee = inbox.calculateRetryableSubmissionFee(withdrawCall.length, baseFee);
        return fee + fee * percentIncrease / 100;
    }

    function _sendMessage(
        uint256 maxSubmissionCost,
        uint256 maxGas,
        uint256 gasPriceBid,
        bytes memory message,
        uint256 prepaid
    ) internal returns(uint256) {
        return inbox.createRetryableTicket{ value: prepaid }(
            remoteBridge,
            0,
            maxSubmissionCost,
            msg.sender,
            msg.sender,
            maxGas,
            gasPriceBid,
            message
        );
    }

    function slashAndRemoteRefund(
        ILnOppositeBridgeSource.TransferParameter calldata params,
        bytes32 expectedTransferId,
        uint256 maxSubmissionCost,
        uint256 maxGas,
        uint256 gasPriceBid
    ) payable external whenNotPaused {
        bytes memory refundCallMessage = _slashAndRemoteRefund(
            params,
            expectedTransferId
        );
        uint256 valueUsed = address(0) == params.targetToken ? params.amount : 0;
        _sendMessage(maxSubmissionCost, maxGas, gasPriceBid, refundCallMessage, msg.value - valueUsed);
    }

    function retryRemoteRefund(
        bytes32 transferId,
        uint256 maxSubmissionCost,
        uint256 maxGas,
        uint256 gasPriceBid
    ) payable external whenNotPaused {
        bytes memory refundCallMessage = _retrySlashAndRemoteRefund(transferId);
        _sendMessage(maxSubmissionCost, maxGas, gasPriceBid, refundCallMessage, msg.value);
    }

    function requestWithdrawMargin(
        bytes32 lastTransferId,
        address sourceToken,
        uint112 amount,
        uint256 maxSubmissionCost,
        uint256 maxGas,
        uint256 gasPriceBid
    ) payable external whenNotPaused {
        bytes memory cancelWithdrawMarginCall = _requestWithdrawMargin(
            lastTransferId,
            sourceToken,
            amount
        );
        _sendMessage(maxSubmissionCost, maxGas, gasPriceBid, cancelWithdrawMarginCall, msg.value);
        emit WithdrawMargin(lastTransferId, amount);
    }
}

