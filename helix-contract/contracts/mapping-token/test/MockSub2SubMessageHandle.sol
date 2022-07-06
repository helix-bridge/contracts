// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "../v2/AccessController.sol";

contract MockSub2SubMessageHandle is AccessController {
    address remoteHelix;
    uint256 outboundNonce;
    uint256 inboundNonce;
    constructor(uint256 _outboundNonce, uint256 _inboundNonce) {
        inboundNonce = _inboundNonce;
        outboundNonce = _outboundNonce;
        _initialize(msg.sender);
    }

    modifier onlyRemoteHelix() {
        require(remoteHelix == msg.sender, "DarwiniaSub2SubMessageHandle: Invalid Derived Remote Sender");
        _;
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
        outboundNonce += 1;
        remoteHelix.call{value: 0}(recv);
        return outboundNonce;
    }

    function recvMessage(address receiver, bytes calldata message) external onlyRemoteHelix {
        require(hasRole(CALLER_ROLE, receiver), "MockS2sMessageHandle:receiver is not caller");
        // don't make sure this success to simulate the failed case.
        receiver.call{value: 0}(message);
        inboundNonce += 1;
    }

    function latestRecvMessageId() public view returns(uint256) {
        return inboundNonce;
    }

    function fee() public view returns(uint256) {
        return 1 ether;
    }
}

