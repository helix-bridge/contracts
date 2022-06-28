// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "../AccessController.sol";
import "@darwinia/contracts-periphery/contracts/s2s/SmartChainXLib.sol";
import "@darwinia/contracts-periphery/contracts/s2s/types/PalletEthereum.sol";

contract DarwiniaSub2SubMessageHandle is AccessController {
    // remote address
    address public remoteHelix;
    address public derivedRemoteHelix;

    // remote call info
    bytes2  public remoteMessageTransactCallIndex;
    uint256 public remoteReceiveGasLimit;
    uint32  public remoteSpecVersion;
    uint64  public remoteCallWeight;

    // local call address
    address public storageAddress;
    address public dispatchAddress;

    // local call info
    bytes2  public callIndexOfSendMessage;
    bytes4  public laneId;

    // lock readonly storage
    bytes32 public srcStorageKeyForMarketFee;
    bytes32 public srcStorageKeyForLatestNonce;


    constructor(bytes4 remoteChainId) {
        _initialize(msg.sender);
    }

    modifier onlyRemoteHelix() {
        require(derivedRemoteHelix == msg.sender, "DarwiniaSub2SubMessageHandle: Invalid Derived Remote Sender");
        _;
    }

    function setRemoteHelix(bytes4 _remoteChainId, address _remoteHelix) external onlyOperator {
        remoteHelix = _remoteHelix;
        derivedRemoteHelix = derivedRemoteSender(_remoteChainId, _remoteHelix);
    }

    function setRemoteCallInfo(
        bytes2 _remoteMessageTransactCallIndex,
        uint256 _remoteReceiveGasLimit,
        uint32 _remoteSpecVersion,
        uint64 _remoteCallWeight
    ) external onlyOperator {
        remoteMessageTransactCallIndex = _remoteMessageTransactCallIndex;
        remoteReceiveGasLimit = _remoteReceiveGasLimit;
        remoteSpecVersion = _remoteSpecVersion;
        remoteCallWeight = _remoteCallWeight;
    }

    function setLocalAddress(address _storageAddress, address _dispatchAddress) external onlyOperator {
        storageAddress = _storageAddress;
        dispatchAddress = _dispatchAddress;
    }

    function setLocalCallInfo(bytes2 _callIndexOfSendMessage, bytes4 _laneId) external onlyOperator {
        callIndexOfSendMessage = _callIndexOfSendMessage;
        laneId = _laneId;
    }

    function setLocalStoryageKey(bytes32 _srcStorageKeyForMarketFee, bytes32 _srcStorageKeyForLatestNonce) external onlyOperator {
        srcStorageKeyForMarketFee = _srcStorageKeyForMarketFee;
        srcStorageKeyForLatestNonce = _srcStorageKeyForLatestNonce;
    }

    function derivedRemoteSender(bytes4 srcChainId, address sender) public view returns(address) {
        return SmartChainXLib.deriveSenderFromRemote(
            srcChainId,
            sender
        );
    }

    function sendMessage(address receiver, bytes calldata message) external onlyCaller payable returns(uint256) {
        PalletEthereum.MessageTransactCall memory call = PalletEthereum.MessageTransactCall(
            remoteMessageTransactCallIndex,
            PalletEthereum.buildTransactionV2ForMessageTransact(
                remoteReceiveGasLimit, // gas limit
                remoteHelix,
                abi.encodeWithSelector(
                    this.recvMessage.selector,
                    address(this),
                    receiver,
                    message 
                )
            )
        );
        bytes memory callEncoded = PalletEthereum.encodeMessageTransactCall(call);

        uint128 fee = SmartChainXLib.marketFee(
            storageAddress,
            srcStorageKeyForMarketFee
        );

        bytes memory payload = SmartChainXLib.buildMessage(
            remoteSpecVersion,
            remoteCallWeight,
            callEncoded
        );

        SmartChainXLib.sendMessage(
            dispatchAddress,
            callIndexOfSendMessage,
            laneId,
            fee,
            payload
        );

        uint64 nonce = SmartChainXLib.latestNonce(
            storageAddress,
            srcStorageKeyForLatestNonce,
            laneId
        );
        return uint256(nonce);
    }

    function recvMessage(address receiver, bytes calldata message) external onlyRemoteHelix whenNotPaused {
        require(hasRole(CALLER_ROLE, receiver), "DarwiniaSub2SubMessageHandle:receiver is not caller");
        (bool result,) = receiver.call{value: 0}(message);
        require(result, "DarwiniaSub2SubMessageHandle:call app failed");
    }
}

