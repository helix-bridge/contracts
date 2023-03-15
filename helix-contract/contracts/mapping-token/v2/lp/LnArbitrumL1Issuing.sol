// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@arbitrum/nitro-contracts/src/bridge/IInbox.sol";
import "@zeppelin-solidity/contracts/proxy/utils/Initializable.sol";
import "./base/LnAccessController.sol";
import "./base/LnBridgeIssuing.sol";

contract LnArbitrumL1Issuing is Initializable, LnAccessController, LnBridgeIssuing {
    IInbox public inbox;
    address public remoteBacking;

    event TransferCanceled(bytes32 transferId, address sender);

    receive() external payable {}

    function initialize(address _dao, address _inbox) public initializer {
        inbox = IInbox(_inbox);
        _initialize(_dao);
    }

    function setRemoteBacking(address _remoteBacking) external onlyDao {
        remoteBacking = _remoteBacking;
    }

    function submissionFee(
        uint256 baseFee,
        bytes32[] memory transferIds,
        bool withdrawNative,
        address receiver,
        uint256 percentIncrease
    ) external view returns(uint256) {
        bytes memory withdrawCall = _encodeWithdrawLiquidity(transferIds, withdrawNative, receiver);
        uint256 fee = IInbox(inbox).calculateRetryableSubmissionFee(withdrawCall.length, baseFee);
        return fee + fee * percentIncrease / 100;
    }

    function requestWithdrawLiquidity(
        uint256 maxSubmissionCost,
        uint256 maxGas,
        uint256 gasPriceBid,
        bytes32[] memory transferIds,
        bool withdrawNative,
        address receiver
    ) payable external whenNotPaused {
        bytes memory withdrawCall = _encodeWithdrawLiquidity(transferIds, withdrawNative, receiver);
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
        uint256 nonce,
        bool issuingNative,
        address token,
        address sender,
        address receiver,
        uint112 amount,
        uint64 sourceChainId,
        bool withdrawNative,
        uint256 maxSubmissionCost,
        uint256 maxGas,
        uint256 gasPriceBid
    ) payable external whenNotPaused {
        bytes32 transferId = _cancelIssuing(nonce, issuingNative, token, sender, receiver, amount, sourceChainId);
        bytes32[] memory transferIds = new bytes32[](1);
        transferIds[0] = transferId;
        // return token to the source sender
        bytes memory withdrawCall = _encodeWithdrawLiquidity(transferIds, withdrawNative, sender);
        _sendMessage(maxSubmissionCost, maxGas, gasPriceBid, withdrawCall, msg.value);
        emit TransferCanceled(transferId, msg.sender);
    }
}

