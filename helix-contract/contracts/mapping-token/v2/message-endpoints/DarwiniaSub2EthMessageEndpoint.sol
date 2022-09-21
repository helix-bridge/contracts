// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "../AccessController.sol";
import "../../interfaces/ICrossChainFilter.sol";
import "../../interfaces/IFeeMarket.sol";
import "../../interfaces/IHelixApp.sol";
import "../../interfaces/IInboundLane.sol";
import "../../interfaces/IMessageCommitment.sol";
import "../../interfaces/IOutboundLane.sol";

contract DarwiniaSub2EthMessageEndpoint is ICrossChainFilter, AccessController {
    address immutable public inboundLane;
    address immutable public outboundLane;
    address immutable public feeMarket;

    address public remoteEndpoint;

    constructor(
        address _inboundLane,
        address _outboundLane,
        address _feeMarket
    ) {
        inboundLane = _inboundLane;
        outboundLane = _outboundLane;
        feeMarket = _feeMarket;
        _initialize(msg.sender);
    }

    modifier onlyInboundLane() {
        require(inboundLane == msg.sender, "DarwiniaSub2EthMessageEndpoint:caller is not the inboundLane account");
        _;
    }

    modifier onlyOutBoundLane() {
        require(outboundLane == msg.sender, "DarwiniaSub2EthMessageEndpoint:caller is not the outboundLane account");
        _;
    }

    function setRemoteEndpoint(address _remoteEndpoint) external onlyAdmin {
        require(remoteEndpoint == address(0), "DarwiniaSub2EthMessageEndpoint:can only set once");
        remoteEndpoint = _remoteEndpoint;
    }

    function cross_chain_filter(
        uint32 bridgedChainPosition,
        uint32 bridgedLanePosition,
        address sourceAccount,
        bytes calldata
    ) external view returns (bool) {
        return inboundLane == msg.sender && remoteEndpoint == sourceAccount;
    }

    function fee() public view returns(uint256) {
        return IFeeMarket(feeMarket).market_fee();
    }

    function sendMessage(address receiver, bytes calldata message) external onlyCaller payable returns (uint256) {
        bytes memory messageWithCaller = abi.encodeWithSelector(
            DarwiniaSub2EthMessageEndpoint.recvMessage.selector,
            receiver,
            message
        );
        IOutboundLane(outboundLane).send_message{value: msg.value}(remoteEndpoint, messageWithCaller);
        IOutboundLane.OutboundLaneNonce memory outboundLaneNonce = IOutboundLane(outboundLane).outboundLaneNonce();
        return outboundLaneNonce.latest_generated_nonce;
    }

    function recvMessage(
        address receiver,
        bytes calldata message
    ) external onlyInboundLane whenNotPaused {
        require(hasRole(CALLEE_ROLE, receiver), "DarwiniaSub2EthMessageEndpoint:receiver is not callee");
        (bool result,) = receiver.call(message);
        require(result, "DarwiniaSub2EthMessageEndpoint:call app failed");
    }

    // we use nonce as message id
    function currentDeliveredMessageId() public view returns(uint256) {
        IInboundLane.InboundLaneNonce memory inboundLaneNonce = IInboundLane(inboundLane).inboundLaneNonce();
        return inboundLaneNonce.last_delivered_nonce + 1;
    }

    function isMessageDelivered(uint256 messageId) public view returns (bool) {
        uint256 lastMessageId = currentDeliveredMessageId();
        return messageId <= lastMessageId;
    }
}

