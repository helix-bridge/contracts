// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@arbitrum/nitro-contracts/src/bridge/IInbox.sol";
import "@zeppelin-solidity/contracts/proxy/utils/Initializable.sol";
import "./base/LnAccessController.sol";
import "./base/LnPositiveBridgeSource.sol";

contract Eth2ArbSource is Initializable, LnAccessController, LnPositiveBridgeSource {
    IInbox public inbox;
    address public remoteBridge;

    event WithdrawMargin(address sourceToken, uint112 amount);

    receive() external payable {}

    function initialize(address _dao, address _inbox) public initializer {
        inbox = IInbox(_inbox);
        _initialize(_dao);
        _setFeeReceiver(_dao);
    }

    function updateFeeReceiver(address _receiver) external onlyDao {
        _setFeeReceiver(_receiver);
    }

    function setTokenInfo(address _sourceToken, uint112 _protocolFee, uint112 _penalty) external onlyDao {
        _setTokenInfo(_sourceToken, _protocolFee, _penalty);
    }

    function setRemoteBridge(address _remoteBridge) external onlyDao {
        remoteBridge = _remoteBridge;
    }

    function submissionSlashFee(
        uint256 baseFee,
        ILnPositiveBridgeTarget.TransferParameter memory params,
        address slasher,
        uint112 fee,
        uint112 penalty,
        uint256 percentIncrease
    ) external view returns(uint256) {
        bytes memory slashCall = _encodeSlashCall(
            params,
            slasher,
            fee,
            penalty
        );
        uint256 submissionFee = inbox.calculateRetryableSubmissionFee(slashCall.length, baseFee);
        return submissionFee + submissionFee * percentIncrease / 100;
    }

    function submissionWithdrawFee(
        uint256 baseFee,
        bytes32 lastTransferId,
        uint64 withdrawNonce,
        address provider,
        address sourceToken,
        uint112 amount,
        uint256 percentIncrease
    ) external view returns(uint256) {
        bytes memory withdrawCall = _encodeWithdrawCall(
            lastTransferId,
            withdrawNonce,
            provider,
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

    // this function can retry
    function slashAndRemoteRelease(
        ILnPositiveBridgeTarget.TransferParameter calldata params,
        bytes32 expectedTransferId,
        uint256 maxSubmissionCost,
        uint256 maxGas,
        uint256 gasPriceBid
    ) payable external whenNotPaused {
        bytes memory slashCallMessage = _slashAndRemoteRelease(
           params,
           expectedTransferId
        );
        _sendMessage(maxSubmissionCost, maxGas, gasPriceBid, slashCallMessage, msg.value);
    }

    function requestWithdrawMargin(
        address sourceToken,
        uint112 amount,
        uint256 maxSubmissionCost,
        uint256 maxGas,
        uint256 gasPriceBid
    ) payable external whenNotPaused {
        bytes memory withdrawCallMessage = _withdrawMargin(
            sourceToken,
            amount
        );
        _sendMessage(maxSubmissionCost, maxGas, gasPriceBid, withdrawCallMessage, msg.value);
        emit WithdrawMargin(sourceToken, amount);
    }
}

