// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "../v2/AccessController.sol";

contract MockSub2SubMessageHandle is AccessController {
    address remoteHelix;
    mapping(bytes4=>uint64) outboundNonces;
    mapping(bytes4=>uint64) inboundNonces;
    bytes4  public inboundLaneId;
    bytes4  public outboundLaneId;
    constructor(uint64 _outboundNonce, uint64 _inboundNonce) {
        inboundNonces[inboundLaneId] = _inboundNonce;
        outboundNonces[outboundLaneId] = _outboundNonce;
        _initialize(msg.sender);
    }

    modifier onlyRemoteHelix() {
        require(remoteHelix == msg.sender, "DarwiniaSub2SubMessageHandle: Invalid Derived Remote Sender");
        _;
    }

    function setInboundLane(bytes4 _inboundLane) external onlyAdmin {
        inboundLaneId = _inboundLane;
    }

    function setOutboundLane(bytes4 _outboundLane) external onlyAdmin {
        outboundLaneId = _outboundLane;
    }

    function setRemoteHelix(address _remoteHelix) external onlyAdmin {
        remoteHelix = _remoteHelix;
    }

    function sendMessage(
        uint256 remoteReceiveGasLimit,
        uint32  remoteSpecVersion,
        uint64  remoteCallWeight,
        address receiver,
        bytes calldata message) external onlyCaller payable returns(uint256) {
        require(msg.value == fee(), "fee is not matched");
        bytes memory recv = abi.encodeWithSelector(
            MockSub2SubMessageHandle.recvMessage.selector,
            receiver,
            message
        );
        uint64 nonce = outboundNonces[outboundLaneId] + 1;
        outboundNonces[outboundLaneId] = nonce;
        remoteHelix.call(recv);
        return encodeMessageId(outboundLaneId, nonce);
    }

    function recvMessage(address receiver, bytes calldata message) external onlyRemoteHelix {
        require(hasRole(CALLER_ROLE, receiver), "MockS2sMessageHandle:receiver is not caller");
        // don't make sure this success to simulate the failed case.
        receiver.call(message);
        inboundNonces[inboundLaneId] = inboundNonces[inboundLaneId] + 1;
    }

    function lastRecvMessageId() public view returns(uint256) {
        return encodeMessageId(inboundLaneId, inboundNonces[inboundLaneId]);
    }

    function fee() public view returns(uint256) {
        return 1 ether;
    }

    function encodeMessageId(bytes4 laneId, uint64 nonce) public pure returns(uint256) {
        return (uint256(uint32(laneId)) << 64) + uint256(nonce);
    }

    function decodeMessageId(uint256 messageId) public pure returns(bytes4, uint64) {
        return (bytes4(uint32(messageId >> 64)), uint64(messageId & 0xffffffffffffffff));
    }

    function isMessageDelivered(uint256 messageId) public view returns(bool) {
        (bytes4 laneId, uint64 nonce) = decodeMessageId(messageId);
        return nonce <= inboundNonces[laneId];
    }
}

