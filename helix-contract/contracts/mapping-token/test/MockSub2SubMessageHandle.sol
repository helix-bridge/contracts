// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "../v2/AccessController.sol";

contract MockSub2SubMessageHandle is AccessController {
    address remoteHelix;
    uint256 outboundNonce;
    uint256 inboundNonce;
    constructor() {
        _initialize(msg.sender);
    }

    modifier onlyRemoteHelix() {
        require(remoteHelix == msg.sender, "DarwiniaSub2SubMessageHandle: Invalid Derived Remote Sender");
        _;
    }

    function setRemoteHelix(address _remoteHelix) external onlyAdmin {
        remoteHelix = _remoteHelix;
    }

    function sendMessage(address receiver, bytes calldata message) external onlyCaller payable returns(uint256) {
        bytes memory recv = abi.encodeWithSelector(
            MockSub2SubMessageHandle.recvMessage.selector,
            receiver,
            message
        );
        remoteHelix.call{value: 0}(recv);
        outboundNonce += 1;
        return outboundNonce - 1;
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
}

