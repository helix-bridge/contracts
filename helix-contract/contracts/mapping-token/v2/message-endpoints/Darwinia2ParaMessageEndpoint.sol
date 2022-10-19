// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@darwinia/contracts-periphery/contracts/s2s/endpoints/RemoteDispatchEndpoint.sol";
import "../AccessController.sol";

contract Darwinia2ParaMessageEndpoint is AccessController, RemoteDispatchEndpoint {
    address public backing;
    constructor() {
        _initialize(msg.sender);
    }

    modifier onlyRemoteCaller() {
        _;
        // TODO
        // address derivedIssuing = xxx(remoteIssuing)
        // require(derivedIssuing == msg.sender)
    }

    function setBacking(address _backing) external onlyAdmin {
        backing = _backing;
    }

    function setLocalChainId(bytes4 _chainId) external onlyAdmin {
        chainId = _chainId;
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
        uint32 remoteSpecVersion,
        uint64 targetWeight,
        bytes calldata callPayload
    ) external onlyCaller whenNotPaused payable returns(uint64 nonce) {
        uint256 messageId = _remoteDispatch(remoteSpecVersion, callPayload, targetWeight);
        (,nonce) = decodeMessageId(messageId);
        return nonce;
    }

    function recvMessage(
        bytes calldata message
    ) external onlyRemoteCaller whenNotPaused {
        (bool result,) = backing.call(message);
        require(result, "Darwinia2ParaMessageEndpoint:call app failed");
    }

    function lastDeliveredMessageNonce() public view returns (uint64 nonce) {
        uint256 messageId = lastDeliveredMessageId();
        (,nonce) = decodeMessageId(messageId);
        return nonce;
    }

    function isMessageDeliveredByNonce(uint64 nonce) public view returns (bool) {
        uint64 lastNonce = SmartChainXLib.lastDeliveredNonce(
            storageAddress,
            storageKeyForLastDeliveredNonce,
            inboundLaneId
        );
        return nonce <= lastNonce;
    }
}

