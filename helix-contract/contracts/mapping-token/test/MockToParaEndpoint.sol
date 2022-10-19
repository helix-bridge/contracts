// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

contract MockDarwinia2ParaMessageEndpoint {
    uint64 public outboundNonce;
    uint64 public inboundNonce;
    address public backing;

    constructor(uint64 _outboundNonce, uint64 _inboundNonce) {
        outboundNonce = _outboundNonce;
        inboundNonce = _inboundNonce;
    }

    receive() external payable {}

    function setBacking(address _backing) external {
        backing = _backing;
    }

    function fee() external view returns(uint256) {
        return 50;
    }

    function sendMessage(
        uint32 remoteSpecVersion,
        uint64 targetWeight,
        bytes calldata callPayload
    ) external payable returns(uint64 nonce) {
        outboundNonce += 1;
        return outboundNonce;
    }

    function recvMessage(
        bytes calldata message
    ) external {
        (bool result,) = backing.call(message);
        require(result, "Darwinia2ParaMessageEndpoint:call app failed");
        inboundNonce += 1;
    }

    function lastDeliveredMessageNonce() public view returns (uint64 nonce) {
        return inboundNonce;
    }

    function isMessageDeliveredByNonce(uint64 nonce) public view returns (bool) {
        return nonce <= inboundNonce;
    }
}

