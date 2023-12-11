// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@zeppelin-solidity/contracts/proxy/utils/Initializable.sol";
import "@zeppelin-solidity/contracts/security/Pausable.sol";
import "../../../interfaces/IMessager.sol";
import "../../../utils/AccessController.sol";
import "../../../utils/DailyLimit.sol";
import "../../../utils/TokenTransferHelper.sol";

// The Base contract for xToken protocol
// Backing or Issuing contract will inherit the contract.
// This contract define the access authorization, the message channel
contract xTokenBridgeBase is Initializable, Pausable, AccessController, DailyLimit {
    struct MessagerService {
        address sendService;
        address receiveService;
    }

    // the version is to issue different xTokens for different version of bridge.
    string public version;
    // the protocol fee for each time user send transaction
    uint256 public protocolFee;
    // the reserved protocol fee in the contract
    uint256 public protocolFeeReserved;
    address public guard;
    // remoteChainId => info
    mapping(uint256 => MessagerService) public messagers;

    // must be called by message service configured
    modifier calledByMessager(uint256 _remoteChainId) {
        address receiveService = messagers[_remoteChainId].receiveService;
        require(receiveService == msg.sender, "invalid messager");
        _;
    }

    receive() external payable {}

    function initialize(address _dao, string calldata _version) public initializer {
        _initialize(_dao);
        version = _version;
    }

    function unpause() external onlyOperator {
        _unpause();
    }

    function pause() external onlyOperator {
        _pause();
    }

    function setProtocolFee(uint256 _protocolFee) external onlyOperator {
        protocolFee = _protocolFee;
    }

    function setSendService(uint256 _remoteChainId, address _remoteBridge, address _service) external onlyDao {
        messagers[_remoteChainId].sendService = _service;
        ILowLevelMessageSender(_service).registerRemoteReceiver(_remoteChainId, _remoteBridge);
    }

    function setReceiveService(uint256 _remoteChainId, address _remoteBridge, address _service) external onlyDao {
        messagers[_remoteChainId].receiveService = _service;
        ILowLevelMessageReceiver(_service).registerRemoteSender(_remoteChainId, _remoteBridge);
    }

    function withdrawProtocolFee(address _receiver, uint256 _amount) external onlyDao {
        require(_amount <= protocolFeeReserved, "not enough fee");
        protocolFeeReserved -= _amount;
        TokenTransferHelper.safeTransferNative(_receiver, _amount);
    }

    function _sendMessage(
        uint256 _remoteChainId,
        bytes memory _payload,
        uint256 _feePrepaid,
        bytes memory _extParams
    ) internal whenNotPaused returns(bytes32 messageId) {
        MessagerService memory service = messagers[_remoteChainId];
        require(service.sendService != address(0), "bridge not configured");
        uint256 _protocolFee = protocolFee;
        protocolFeeReserved += _protocolFee;
        ILowLevelMessageSender(service.sendService).sendMessage{value: _feePrepaid - _protocolFee}(
            _remoteChainId,
            _payload,
            _extParams
        );
        messageId = IMessageId(service.sendService).latestSentMessageId();
    }

    // check a special message is delivered by message service
    // the delivered message can't be received any more
    function _assertMessageIsDelivered(uint256 _remoteChainId, bytes32 _transferId) view internal {
        MessagerService memory service = messagers[_remoteChainId];
        require(service.receiveService != address(0), "bridge not configured");
        require(IMessageId(service.receiveService).messageDelivered(_transferId), "message not delivered");
    }

    // the latest received message id
    // when this method is called in the receive method, it's the current received message's id
    function _latestRecvMessageId(uint256 _remoteChainId) view internal returns(bytes32) {
        MessagerService memory service = messagers[_remoteChainId];
        require(service.receiveService != address(0), "invalid remoteChainId");
        return IMessageId(service.receiveService).latestRecvMessageId();
    }

    // settings
    function updateGuard(address _guard) external onlyDao {
        guard = _guard;
    }

    function setDailyLimit(address _token, uint256 _dailyLimit) external onlyDao {
        _setDailyLimit(_token, _dailyLimit);
    }
}

