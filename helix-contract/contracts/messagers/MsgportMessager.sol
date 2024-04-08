// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./interface/IMessagePort.sol";
import "../utils/AccessController.sol";

contract MsgportMessager is Application, AccessController {
    IMessagePort public msgport;

    struct RemoteMessager {
        uint256 msgportRemoteChainId;
        address messager;
    }

    mapping(address=>bool) public whiteList;
    // app remoteChainId => msgport remote messager
    mapping(uint256=>RemoteMessager) public remoteMessagers;

    // token bridge pair
    // hash(msgportRemoteChainId, localAppAddress) => remoteAppAddress
    mapping(bytes32=>address) public remoteAppReceivers;
    mapping(bytes32=>address) public remoteAppSenders;

    event CallerUnMatched(uint256 srcAppChainId, address srcAppAddress);
    event CallResult(uint256 srcAppChainId, bool result);

    modifier onlyWhiteList() {
        require(whiteList[msg.sender], "msg.sender not in whitelist");
        _;
    }

    modifier onlyMsgPort() {
        require(msg.sender == address(msgport), "invalid caller");
        _;
    }

    constructor(address _dao, address _msgport) {
        _initialize(_dao);
        msgport = IMessagePort(_msgport);
    }

    function setMsgPort(address _msgport) onlyDao external {
        msgport = IMessagePort(_msgport);
    }

    function setRemoteMessager(uint256 _appRemoteChainId, uint256 _msgportRemoteChainId, address _remoteMessager) onlyDao external {
        remoteMessagers[_appRemoteChainId] = RemoteMessager(_msgportRemoteChainId, _remoteMessager);
    }

    function setWhiteList(address _caller, bool _enable) external onlyDao {
        whiteList[_caller] = _enable;
    }

    function registerRemoteReceiver(uint256 _remoteChainId, address _remoteBridge) onlyWhiteList external {
        RemoteMessager memory remoteMessager = remoteMessagers[_remoteChainId];
        require(remoteMessager.messager != address(0), "remote not configured");
        bytes32 key = keccak256(abi.encodePacked(remoteMessager.msgportRemoteChainId, msg.sender));
        remoteAppReceivers[key] = _remoteBridge;
    }

    function registerRemoteSender(uint256 _remoteChainId, address _remoteBridge) onlyWhiteList external {
        RemoteMessager memory remoteMessager = remoteMessagers[_remoteChainId];
        require(remoteMessager.messager != address(0), "remote not configured");
        bytes32 key = keccak256(abi.encodePacked(remoteMessager.msgportRemoteChainId, msg.sender));
        remoteAppSenders[key] = _remoteBridge;
    }

    function sendMessage(uint256 _remoteChainId, bytes memory _message, bytes memory _params) onlyWhiteList external payable {
        RemoteMessager memory remoteMessager = remoteMessagers[_remoteChainId];
        require(remoteMessager.messager != address(0), "remote not configured");
        bytes32 key = keccak256(abi.encodePacked(remoteMessager.msgportRemoteChainId, msg.sender));
        address remoteAppAddress = remoteAppReceivers[key];
        require(remoteAppAddress != address(0), "app pair not registered");
        bytes memory msgportPayload = messagePayload(msg.sender, remoteAppAddress, _message);
        msgport.send{ value: msg.value }(
            remoteMessager.msgportRemoteChainId,
            remoteMessager.messager,
            msgportPayload,
            _params
        );
    }

    function receiveMessage(uint256 _srcAppChainId, address _remoteAppAddress, address _localAppAddress, bytes memory _message) onlyMsgPort external {
        uint256 srcChainId = _fromChainId();
        RemoteMessager memory remoteMessager = remoteMessagers[_srcAppChainId];
        require(srcChainId == remoteMessager.msgportRemoteChainId, "invalid remote chainid");
        require(remoteMessager.messager == _xmsgSender(), "invalid remote messager");
        bytes32 key = keccak256(abi.encodePacked(srcChainId, _localAppAddress));

        // check remote appSender
        if (_remoteAppAddress != remoteAppSenders[key]) {
            emit CallerUnMatched(_srcAppChainId, _remoteAppAddress);
            return;
        }
        (bool success,) = _localAppAddress.call(_message);
        // don't revert to prevent message block
        emit CallResult(_srcAppChainId, success);
    }

    function messagePayload(address _from, address _to, bytes memory _message) public view returns(bytes memory) {
        return abi.encodeWithSelector(
            MsgportMessager.receiveMessage.selector,
            block.chainid,
            _from,
            _to,
            _message
        );
    }
}

