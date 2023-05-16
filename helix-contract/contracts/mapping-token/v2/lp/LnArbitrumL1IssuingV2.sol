// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@arbitrum/nitro-contracts/src/bridge/IInbox.sol";
import "@zeppelin-solidity/contracts/proxy/utils/Initializable.sol";
import "./base/LnAccessController.sol";
import "./base/LnBridgeIssuingV2.sol";

contract LnArbitrumL1IssuingV2 is Initializable, LnAccessController, LnBridgeIssuingV2 {
    IInbox public inbox;
    address public remoteBacking;

    event TransferCanceled(bytes32 transferId, address sender);
    event WithdrawMargin(bytes32 lastTransferId, uint112 amount);

    receive() external payable {}

    function initialize(address _dao, address _inbox) public initializer {
        inbox = IInbox(_inbox);
        _initialize(_dao);
    }

    function setRemoteBacking(address _remoteBacking) external onlyDao {
        remoteBacking = _remoteBacking;
    }

    function submissionRefundFee(
        uint256 baseFee,
        bytes32 lastRefundTransferId,
        bytes32 transferId,
        address receiver,
        address fundReceiver,
        uint256 percentIncrease
    ) external view returns(uint256) {
        bytes memory withdrawCall = _encodeRefundCall(
            lastRefundTransferId,
            transferId,
            receiver,
            fundReceiver
        );
        uint256 fee = IInbox(inbox).calculateRetryableSubmissionFee(withdrawCall.length, baseFee);
        return fee + fee * percentIncrease / 100;
    }

    function requestWithdrawMargin(
        uint256 maxSubmissionCost,
        uint256 maxGas,
        uint256 gasPriceBid,
        bytes32 lastRefundTransferId,
        bytes32 transferId,
        uint112 amount
    ) payable external whenNotPaused {
        bytes memory withdrawCall = _requestWithdrawMargin(
            lastRefundTransferId,
            transferId,
            amount
        );
        _sendMessage(
            maxSubmissionCost,
            maxGas,
            gasPriceBid,
            withdrawCall,
            msg.value);
    }

    function _sendMessage(
        uint256 maxSubmissionCost,
        uint256 maxGas,
        uint256 gasPriceBid,
        bytes memory message,
        uint256 prepaid
    ) internal returns(uint256) {
        return inbox.createRetryableTicket{ value: prepaid }(
            remoteBacking,
            0,
            maxSubmissionCost,
            msg.sender,
            msg.sender,
            maxGas,
            gasPriceBid,
            message
        );
    }

    function requestCancelIssuing(
        bytes32 lastTransferId,
        bytes32 lastRefundTransferId,
        bytes32 transferId,
        uint256 maxSubmissionCost,
        uint256 maxGas,
        uint256 gasPriceBid
    ) payable external whenNotPaused {
        bytes memory cancelIssuingCall = _requestCancelIssuing(
            lastRefundTransferId,
            lastTransferId,
            transferId
        );
        _sendMessage(maxSubmissionCost, maxGas, gasPriceBid, cancelIssuingCall, msg.value);
        emit TransferCanceled(transferId, msg.sender);
    }

    function requestWithdrawMargin(
        bytes32 lastRefundTransferId,
        bytes32 lastTransferId,
        uint112 amount,
        uint256 maxSubmissionCost,
        uint256 maxGas,
        uint256 gasPriceBid
    ) payable external whenNotPaused {
        bytes memory cancelWithdrawMarginCall = _requestWithdrawMargin(
            lastRefundTransferId,
            lastTransferId,
            amount
        );
        _sendMessage(maxSubmissionCost, maxGas, gasPriceBid, cancelWithdrawMarginCall, msg.value);
        emit WithdrawMargin(lastTransferId, amount);
    }
}

