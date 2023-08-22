// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@zeppelin-solidity/contracts/proxy/utils/Initializable.sol";
import "./base/LnAccessController.sol";
import "./base/LnDefaultBridgeSource.sol";
import "./interface/ILineaMessageService.sol";

contract Eth2LineaSource is Initializable, LnAccessController, LnDefaultBridgeSource {
    ILineaMessageService public messageService;
    address public remoteBridge;

    event WithdrawMargin(address sourceToken, uint112 amount);

    receive() external payable {}

    function initialize(address _dao, address _messageService) public initializer {
        messageService = ILineaMessageService(_messageService);
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

    // this function can retry
    function slashAndRemoteRelease(
        TransferParameter calldata params,
        bytes32 expectedTransferId
    ) payable external whenNotPaused {
        bytes memory slashCallMessage = _slashAndRemoteRelease(
           params,
           expectedTransferId
        );
        _sendMessage(slashCallMessage, msg.value);
    }

    function requestWithdrawMargin(
        address sourceToken,
        uint112 amount
    ) payable external whenNotPaused {
        bytes memory withdrawCallMessage = _withdrawMargin(
            sourceToken,
            amount
        );
        _sendMessage(withdrawCallMessage, msg.value);
        emit WithdrawMargin(sourceToken, amount);
    }
}

