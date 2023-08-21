// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@zeppelin-solidity/contracts/proxy/utils/Initializable.sol";
import "./base/LnAccessController.sol";
import "./base/LnDefaultBridgeSource.sol";
import "./interface/IZksyncMailbox.sol";

contract Eth2ZkSyncSource is Initializable, LnAccessController, LnDefaultBridgeSource {
    IMailbox public mailbox;
    address public remoteBridge;

    event WithdrawMargin(address sourceToken, uint112 amount);

    receive() external payable {}

    function initialize(address _dao, address _mailbox) public initializer {
        mailbox = IMailbox(_mailbox);
        _initialize(_dao);
        _setFeeReceiver(_dao);
    }

    function updateFeeReceiver(address _receiver) external onlyDao {
        _setFeeReceiver(_receiver);
    }

    function setTokenInfo(
        address _sourceToken,
        address _targetToken,
        uint112 _protocolFee,
        uint112 _penaltyLnCollateral,
        uint8 _sourceDecimals,
        uint8 _targetDecimals
    ) external onlyDao {
        _setTokenInfo(
            _sourceToken,
            _targetToken,
            _protocolFee,
            _penaltyLnCollateral,
            _sourceDecimals,
            _targetDecimals
        );
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

    // this function can retry
    function slashAndRemoteRelease(
        TransferParameter calldata params,
        bytes32 expectedTransferId,
        uint256 l2GasLimit,
        uint256 l2GasPerPubdataByteLimit
    ) payable external whenNotPaused {
        bytes memory slashCallMessage = _slashAndRemoteRelease(
           params,
           expectedTransferId
        );
        _sendMessage(l2GasLimit, l2GasPerPubdataByteLimit, slashCallMessage, msg.value);
    }

    function requestWithdrawMargin(
        address sourceToken,
        uint112 amount,
        uint256 l2GasLimit,
        uint256 l2GasPerPubdataByteLimit
    ) payable external whenNotPaused {
        bytes memory withdrawCallMessage = _withdrawMargin(
            sourceToken,
            amount
        );
        _sendMessage(l2GasLimit, l2GasPerPubdataByteLimit, withdrawCallMessage, msg.value);
        emit WithdrawMargin(sourceToken, amount);
    }
}

