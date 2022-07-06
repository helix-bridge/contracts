// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "../AccessController.sol";
import "@darwinia/contracts-periphery/contracts/s2s/SmartChainXLib.sol";
import "@darwinia/contracts-periphery/contracts/s2s/types/PalletEthereum.sol";

contract DarwiniaSub2SubMessageHandle is AccessController {
    // remote address
    uint64 public remoteSmartChainId;
    address public remoteHelix;
    address public derivedRemoteHelix;

    // remote call info
    bytes2  public remoteMessageTransactCallIndex;

    // local call address
    address public storageAddress;
    address public dispatchAddress;

    // local bridge info
    bytes2  public callIndexOfSendMessage;
    bytes4  public inboundLaneId;
    bytes4  public outboundLaneId;

    // readonly storage key
    bytes32 public srcStorageKeyForMarketFee;
    bytes32 public srcStorageKeyForLatestNonce;
    bytes32 public dstStorageKeyForLastDeliveredNonce;

    constructor() {
        _initialize(msg.sender);
    }

    modifier onlyRemoteHelix() {
        require(derivedRemoteHelix == msg.sender, "DarwiniaSub2SubMessageHandle: Invalid Derived Remote Sender");
        _;
    }

    function setRemoteHelix(bytes4 _remoteChainId, uint64 _remoteSmartChainId, address _remoteHelix) external onlyAdmin {
        remoteSmartChainId = _remoteSmartChainId;
        remoteHelix = _remoteHelix;
        derivedRemoteHelix = derivedRemoteSender(_remoteChainId, _remoteHelix);
    }

    function setRemoteCallIndex(bytes2 _remoteMessageTransactCallIndex) external onlyAdmin {
        remoteMessageTransactCallIndex = _remoteMessageTransactCallIndex;
    }

    function setLocalAddress(address _storageAddress, address _dispatchAddress) external onlyAdmin {
        storageAddress = _storageAddress;
        dispatchAddress = _dispatchAddress;
    }

    function setLocalCallInfo(bytes2 _callIndexOfSendMessage, bytes4 _outboundLaneId, bytes4 _inboundLaneId) external onlyAdmin {
        callIndexOfSendMessage = _callIndexOfSendMessage;
        outboundLaneId = _outboundLaneId;
        inboundLaneId = _inboundLaneId;
    }

    function setLocalStorageKey(
        bytes32 _srcStorageKeyForMarketFee,
        bytes32 _srcStorageKeyForLatestNonce,
        bytes32 _dstStorageKeyForLastDeliveredNonce
    ) external onlyAdmin {
        srcStorageKeyForMarketFee = _srcStorageKeyForMarketFee;
        srcStorageKeyForLatestNonce = _srcStorageKeyForLatestNonce;
        dstStorageKeyForLastDeliveredNonce = _dstStorageKeyForLastDeliveredNonce;
    }

    function derivedRemoteSender(bytes4 srcChainId, address sender) public view returns(address) {
        return SmartChainXLib.deriveSenderFromRemote(
            srcChainId,
            sender
        );
    }

    function sendMessage(
        uint256 remoteReceiveGasLimit,
        uint32  remoteSpecVersion,
        uint64  remoteCallWeight,
        address receiver,
        bytes calldata message) external onlyCaller payable returns(uint256) {
        PalletEthereum.MessageTransactCall memory call = PalletEthereum.MessageTransactCall(
            remoteMessageTransactCallIndex,
            PalletEthereum.buildTransactionV2ForMessageTransact(
                remoteReceiveGasLimit, // gas limit
                remoteHelix,
                remoteSmartChainId,
                abi.encodeWithSelector(
                    this.recvMessage.selector,
                    receiver,
                    message 
                )
            )
        );
        bytes memory callEncoded = PalletEthereum.encodeMessageTransactCall(call);
        bytes memory payload = SmartChainXLib.buildMessage(
            remoteSpecVersion,
            remoteCallWeight,
            callEncoded
        );

        SmartChainXLib.sendMessage(
            dispatchAddress,
            callIndexOfSendMessage,
            outboundLaneId,
            msg.value,
            payload
        );

        uint64 nonce = SmartChainXLib.latestNonce(
            storageAddress,
            srcStorageKeyForLatestNonce,
            outboundLaneId
        );
        return uint256(nonce);
    }

    function recvMessage(address receiver, bytes calldata message) external onlyRemoteHelix whenNotPaused {
        require(hasRole(CALLER_ROLE, receiver), "DarwiniaSub2SubMessageHandle:receiver is not caller");
        (bool result,) = receiver.call{value: 0}(message);
        require(result, "DarwiniaSub2SubMessageHandle:call app failed");
    }

    function latestRecvMessageId() public view returns(uint256) {
        return SmartChainXLib.lastDeliveredNonce(
            storageAddress,
            dstStorageKeyForLastDeliveredNonce,
            inboundLaneId
        );
    }

    function fee() public view returns(uint256) {
        return SmartChainXLib.marketFee(
            storageAddress,
            srcStorageKeyForMarketFee
        );
    }
}

