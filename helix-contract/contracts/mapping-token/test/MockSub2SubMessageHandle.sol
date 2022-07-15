// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "../v2/AccessController.sol";

contract MockSub2SubMessageHandle is AccessController {
    address remoteHelix;
    mapping(bytes4=>uint64) outboundLanes;
    mapping(bytes4=>uint64) inboundLanes;
    bytes4  public inboundLaneId;
    bytes4  public outboundLaneId;
    constructor(uint64 _outboundNonce, uint64 _inboundNonce) {
        inboundLanes[inboundLaneId] = _inboundNonce;
        outboundLanes[outboundLaneId] = _outboundNonce;
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
        uint64 nonce = outboundLanes[outboundLaneId] + 1;
        outboundLanes[outboundLaneId] = nonce;
        remoteHelix.call(recv);
        return encodeTransferId(outboundLaneId, nonce);
    }

    function recvMessage(address receiver, bytes calldata message) external onlyRemoteHelix {
        require(hasRole(CALLER_ROLE, receiver), "MockS2sMessageHandle:receiver is not caller");
        // don't make sure this success to simulate the failed case.
        receiver.call(message);
        inboundLanes[inboundLaneId] = inboundLanes[inboundLaneId] + 1;
    }

    function latestRecvMessageId() public view returns(uint256) {
        return inboundLanes[inboundLaneId];
    }

    function fee() public view returns(uint256) {
        return 1 ether;
    }

    function encodeTransferId(bytes4 laneId, uint64 nonce) public pure returns(uint256) {
        return (uint256(uint32(laneId)) << 64) + uint256(nonce);
    }

    function decodeTransferId(uint256 transferId) public pure returns(bytes4, uint64) {
        return (bytes4(uint32(transferId >> 64)), uint64(transferId & 0xffffffffffffffff));
    }

    function isMessageTransfered(uint256 transferId) public view returns(bool) {
        (bytes4 laneId, uint64 nonce) = decodeTransferId(transferId);
        return nonce <= inboundLanes[laneId];
    }
}

