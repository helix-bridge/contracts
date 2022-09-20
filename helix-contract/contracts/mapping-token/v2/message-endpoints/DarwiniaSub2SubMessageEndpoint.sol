// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "../AccessController.sol";
import "@darwinia/contracts-periphery/contracts/s2s/MessageEndpoint.sol";

contract DarwiniaSub2SubMessageEndpoint is AccessController, MessageEndpoint {
    constructor() {
        _initialize(msg.sender);
    }

    function setRemoteHelix(bytes4 _remoteChainId, uint64 _remoteSmartChainId, address _remoteHelix) external onlyAdmin {
        _setRemoteEndpoint(_remoteChainId, _remoteHelix);
        _setRemoteSmartChainId(_remoteSmartChainId);
    }

    function setRemoteCallIndex(bytes2 _remoteMessageTransactCallIndex) external onlyAdmin {
        _setRemoteMessageTransactCallIndex(_remoteMessageTransactCallIndex);
    }

    function setLocalAddress(address _storageAddress, address _dispatchAddress) external onlyAdmin {
        _setStorageAddress(_storageAddress);
        _setDispatchAddress(_dispatchAddress);
    }

    function setLocalCallInfo(bytes2 _callIndexOfSendMessage, bytes4 _outboundLaneId, bytes4 _inboundLaneId) external onlyAdmin {
        _setSendMessageCallIndex(_callIndexOfSendMessage);
        _setOutboundLaneId(_outboundLaneId);
        _setInboundLaneId(_inboundLaneId);
    }

    function setLocalStorageKey(
        bytes32 _srcStorageKeyForMarketFee,
        bytes32 _srcStorageKeyForLatestNonce,
        bytes32 _dstStorageKeyForLastDeliveredNonce
    ) external onlyAdmin {
        _setStorageKeyForMarketFee(_srcStorageKeyForMarketFee);
        _setStorageKeyForLatestNonce(_srcStorageKeyForLatestNonce);
        _setStorageKeyForLastDeliveredNonce(_dstStorageKeyForLastDeliveredNonce);
    }

    function sendMessage(
        uint32  remoteSpecVersion,
        uint256 remoteReceiveGasLimit,
        address receiver,
        bytes calldata callPayload
    ) external onlyCaller whenNotPaused payable returns(uint256) {
        return _remoteExecute(remoteSpecVersion, receiver, callPayload, remoteReceiveGasLimit);
    }

    function _canBeExecuted(address callReceiver, bytes calldata) internal view override whenNotPaused returns (bool) {
        return hasRole(CALLEE_ROLE, callReceiver);
    }
}

