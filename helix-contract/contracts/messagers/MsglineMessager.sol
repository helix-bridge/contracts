// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../utils/AccessController.sol";
import "../interfaces/IMessageLine.sol";

contract MsglineMessager is Application, AccessController {
    // expire time = 1 hour
    uint256 constant public SLASH_EXPIRE_TIME = 3600;

    IMessageLine public immutable msgline;

    struct RemoteMessager {
        uint256 msglineRemoteChainId;
        address messager;
    }

    mapping(address=>bool) public whiteList;
    // app remoteChainId => msgline remote messager
    mapping(uint256=>RemoteMessager) public remoteMessagers;

    // token bridge pair
    // hash(msglineRemoteChainId, localAppAddress) => remoteAppAddress
    mapping(bytes32=>address) public remoteAppReceivers;
    mapping(bytes32=>address) public remoteAppSenders;

    // transferId => timestamp
    mapping(bytes32=>uint256) public slashTransferIds;

    event CallerUnMatched(uint256 srcAppChainId, bytes32 transferId, address srcAppAddress);
    event CallResult(uint256 srcAppChainId, bytes32 transferId, bool result);

    modifier onlyWhiteList() {
        require(whiteList[msg.sender], "msg.sender not in whitelist");
        _;
    }

    modifier onlyMsgline() {
        require(msg.sender == address(msgline), "invalid caller");
        _;
    }

    constructor(address _dao, address _msgline) {
        _initialize(_dao);
        msgline = IMessageLine(_msgline);
    }

    function setRemoteMessager(uint256 _appRemoteChainId, uint256 _msglineRemoteChainId, address _remoteMessager) onlyDao external {
        remoteMessagers[_appRemoteChainId] = RemoteMessager(_msglineRemoteChainId, _remoteMessager);
    }

    function setWhiteList(address _caller, bool _enable) external onlyDao {
        whiteList[_caller] = _enable;
    }

    function registerRemoteReceiver(uint256 _remoteChainId, address _remoteBridge) onlyWhiteList external {
        RemoteMessager memory remoteMessager = remoteMessagers[_remoteChainId];
        require(remoteMessager.messager != address(0), "remote not configured");
        bytes32 key = keccak256(abi.encodePacked(remoteMessager.msglineRemoteChainId, msg.sender));
        remoteAppReceivers[key] = _remoteBridge;
    }

    function registerRemoteSender(uint256 _remoteChainId, address _remoteBridge) onlyWhiteList external {
        RemoteMessager memory remoteMessager = remoteMessagers[_remoteChainId];
        require(remoteMessager.messager != address(0), "remote not configured");
        bytes32 key = keccak256(abi.encodePacked(remoteMessager.msglineRemoteChainId, msg.sender));
        remoteAppSenders[key] = _remoteBridge;
    }

    function sendMessage(uint256 _remoteChainId, bytes memory _message, bytes memory _params) onlyWhiteList external payable {
        RemoteMessager memory remoteMessager = remoteMessagers[_remoteChainId];
        require(remoteMessager.messager != address(0), "remote not configured");
        bytes32 key = keccak256(abi.encodePacked(remoteMessager.msglineRemoteChainId, msg.sender));
        address remoteAppAddress = remoteAppReceivers[key];
        require(remoteAppAddress != address(0), "app pair not registered");
        bytes memory msglinePayload = messagePayload(msg.sender, remoteAppAddress, _message);
        msgline.send{ value: msg.value }(
            remoteMessager.msglineRemoteChainId,
            remoteMessager.messager,
            msglinePayload,
            _params
        );
    }

    function receiveMessage(uint256 _srcAppChainId, address _remoteAppAddress, address _localAppAddress, bytes memory _message) onlyMsgline external {
        uint256 srcChainId = _fromChainId();
        RemoteMessager memory remoteMessager = remoteMessagers[_srcAppChainId];
        require(srcChainId == remoteMessager.msglineRemoteChainId, "invalid remote chainid");
        require(remoteMessager.messager == _xmsgSender(), "invalid remote messager");
        bytes32 key = keccak256(abi.encodePacked(srcChainId, _localAppAddress));
        bytes32 transferId = latestRecvMessageId();

        if (_messageSlashed(transferId)) {
            return;
        }

        // check remote appSender
        if (_remoteAppAddress != remoteAppSenders[key]) {
            emit CallerUnMatched(_srcAppChainId, transferId, _remoteAppAddress);
            return;
        }
        (bool success,) = _localAppAddress.call(_message);
        // don't revert to prevent message block
        emit CallResult(_srcAppChainId, transferId, success);
    }

    function slashMessage(bytes32 transferId) external {
        require(slashTransferIds[transferId] == 0, "!slash");
        slashTransferIds[transferId] = block.timestamp;
    }

    function _messageSlashed(bytes32 transferId) internal view returns(bool) {
        uint256 slashTimestamp = slashTransferIds[transferId];
        return slashTimestamp > 0 && slashTimestamp + SLASH_EXPIRE_TIME < block.timestamp;
    }

    function latestSentMessageId() external view returns(bytes32) {
        return msgline.sentMessageId();
    }

    function latestRecvMessageId() public view returns(bytes32) {
        return msgline.recvMessageId();
    }

    function messageDeliveredOrSlashed(bytes32 transferId) external view returns(bool) {
        return msgline.dones(transferId) || _messageSlashed(transferId);
    }

    function messagePayload(address _from, address _to, bytes memory _message) public view returns(bytes memory) {
        return abi.encodeWithSelector(
            MsglineMessager.receiveMessage.selector,
            block.chainid,
            _from,
            _to,
            _message
        );
    }
}

