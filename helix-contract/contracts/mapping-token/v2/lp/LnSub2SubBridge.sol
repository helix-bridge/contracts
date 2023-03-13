// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@zeppelin-solidity/contracts/proxy/utils/Initializable.sol";
import "./base/LnAccessController.sol";
import "./base/LnBridgeBacking.sol";
import "./base/LnBridgeIssuing.sol";
import "../../interfaces/IHelixSub2SubMessageEndpoint.sol";

contract LnSub2SubBridge is Initializable, LnAccessController, LnBridgeBacking, LnBridgeIssuing {
    address localEndpoint;
    address remoteEndpoint;
    address remoteBridge;

    event TransferCanceled(bytes32 transferId, address sender);

    receive() external payable {}

    modifier onlyEndpoint() {
        require(localEndpoint == msg.sender, "LnSub2SubBridge:invalid endpoint");
        _;
    }

    function fee() external view returns(uint256) {
        return IHelixSub2SubMessageEndpoint(localEndpoint).fee();
    }

    function _sendMessage(
        uint32 remoteSpecVersion,
        uint256 remoteReceiveGasLimit,
        bytes memory message,
        uint256 prepaid) internal returns(uint256) {
        uint256 bridgeFee = IHelixSub2SubMessageEndpoint(localEndpoint).fee();
        require(prepaid >= bridgeFee, "backing:the fee is not enough");
        if (prepaid > bridgeFee) {
            // refund fee to msgSender
            payable(msg.sender).transfer(prepaid - bridgeFee);
        }
        uint256 transferId = IHelixSub2SubMessageEndpoint(localEndpoint).sendMessage{value: bridgeFee}(
            remoteSpecVersion,
            remoteReceiveGasLimit,
            remoteBridge,
            message);
        return transferId;
    }

    function initialize(address _localEndpoint, address _remoteEndpoint, address dao) public initializer {
        localEndpoint = _localEndpoint;
        remoteEndpoint = _remoteEndpoint;
        _initialize(dao);
        _setFeeReceiver(dao);
    }


    function setwTokenIndex(uint32 _wTokenIndex) external onlyDao {
        _setwTokenIndex(_wTokenIndex);
    }

    function updateFeeReceiver(address _receiver) external onlyDao {
        _setFeeReceiver(_receiver);
    }

    function setRemoteBridge(address _remoteBridge) external onlyDao {
        remoteBridge = _remoteBridge;
    }

    // backing mode called
    function registerToken(
        address local,
        address remote,
        uint112 helixFee,
        uint32 remoteChainId,
        uint8 localDecimals,
        uint8 remoteDecimals,
        bool remoteIsNative
    ) external onlyDao {
        _registerToken(local, remote, helixFee, remoteChainId, localDecimals, remoteDecimals, remoteIsNative);
    }

    function withdrawLiquidity(
        bytes32[] memory transferIds,
        bool withdrawNative,
        address receiver
    ) external onlyEndpoint whenNotPaused {
        _withdrawLiquidity(transferIds, withdrawNative, receiver);
    }

    function requestWithdrawLiquidity(
        uint32 remoteSpecVersion,
        uint256 remoteReceiveGasLimit,
        bytes32[] memory transferIds,
        bool withdrawNative,
        address receiver) payable external whenNotPaused {
        bytes memory withdrawCall = _encodeWithdrawLiquidity(transferIds, withdrawNative, receiver);
        _sendMessage(remoteSpecVersion, remoteReceiveGasLimit, withdrawCall, msg.value);
    }

    function requestCancelIssuing(
        uint32 remoteSpecVersion,
        uint256 remoteReceiveGasLimit,
        uint256 nonce,
        bool issuingNative,
        address token,
        address sender,
        address receiver,
        uint112 amount,
        uint64 sourceChainId,
        bool withdrawNative
    ) payable external whenNotPaused {
        bytes32 transferId = _cancelIssuing(nonce, issuingNative, token, sender, receiver, amount, sourceChainId);
        bytes32[] memory transferIds = new bytes32[](1);
        transferIds[0] = transferId;
        // return token to the source sender
        bytes memory withdrawCall = _encodeWithdrawLiquidity(transferIds, withdrawNative, sender);
        _sendMessage(remoteSpecVersion, remoteReceiveGasLimit, withdrawCall, msg.value);
        emit TransferCanceled(transferId, msg.sender);
    }
}

