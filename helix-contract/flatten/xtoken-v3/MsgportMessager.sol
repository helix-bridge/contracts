// SPDX-License-Identifier: MIT

/**
 * .----------------.  .----------------.  .----------------.  .----------------.  .----------------. 
 * | .--------------. || .--------------. || .--------------. || .--------------. || .--------------. |
 * | |  ____  ____  | || |  _________   | || |   _____      | || |     _____    | || |  ____  ____  | |
 * | | |_   ||   _| | || | |_   ___  |  | || |  |_   _|     | || |    |_   _|   | || | |_  _||_  _| | |
 * | |   | |__| |   | || |   | |_  \_|  | || |    | |       | || |      | |     | || |   \ \  / /   | |
 * | |   |  __  |   | || |   |  _|  _   | || |    | |   _   | || |      | |     | || |    > `' <    | |
 * | |  _| |  | |_  | || |  _| |___/ |  | || |   _| |__/ |  | || |     _| |_    | || |  _/ /'`\ \_  | |
 * | | |____||____| | || | |_________|  | || |  |________|  | || |    |_____|   | || | |____||____| | |
 * | |              | || |              | || |              | || |              | || |              | |
 * | '--------------' || '--------------' || '--------------' || '--------------' || '--------------' |
 *  '----------------'  '----------------'  '----------------'  '----------------'  '----------------' '
 * 
 *
 * 2/6/2024
 **/

pragma solidity ^0.8.17;

// File contracts/utils/AccessController.sol
// License-Identifier: MIT

/// @title AccessController
/// @notice AccessController is a contract to control the access permission 
/// @dev See https://github.com/helix-bridge/contracts/tree/master/helix-contract
contract AccessController {
    address public dao;
    address public operator;
    address public pendingDao;

    modifier onlyDao() {
        require(msg.sender == dao, "!dao");
        _;
    }

    modifier onlyOperator() {
        require(msg.sender == operator, "!operator");
        _;
    }

    function _initialize(address _dao) internal {
        dao = _dao;
        operator = _dao;
    }

    function setOperator(address _operator) onlyDao external {
        operator = _operator;
    }

    function transferOwnership(address _dao) onlyDao external {
        pendingDao = _dao;
    }

    function acceptOwnership() external {
        address newDao = msg.sender;
        require(pendingDao == newDao, "!pendingDao");
        delete pendingDao;
        dao = newDao;
    }
}

// File contracts/interfaces/IMessageLine.sol
// License-Identifier: MIT

interface IMessageLine {
    function send(uint256 toChainId, address toDapp, bytes calldata message, bytes calldata params) external payable;
    function fee(uint256 toChainId, address toDapp, bytes calldata message, bytes calldata params) external view returns (uint256);
}

abstract contract Application {
    function _msgSender() internal view returns (address payable _line) {
        _line = payable(msg.sender);
    }

    function _fromChainId() internal pure returns (uint256 _msgDataFromChainId) {
        require(msg.data.length >= 52, "!fromChainId");
        assembly {
            _msgDataFromChainId := calldataload(sub(calldatasize(), 52))
        }
    }

    function _xmsgSender() internal pure returns (address payable _from) {
        require(msg.data.length >= 20, "!line");
        assembly {
            _from := shr(96, calldataload(sub(calldatasize(), 20)))
        }
    }
}

// File contracts/messagers/MsgportMessager.sol
// License-Identifier: MIT


contract MsgportMessager is Application, AccessController {
    IMessageLine public msgport;

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

    modifier onlyMsgline() {
        require(msg.sender == address(msgport), "invalid caller");
        _;
    }

    constructor(address _dao, address _msgport) {
        _initialize(_dao);
        msgport = IMessageLine(_msgport);
    }

    function setMsgline(address _msgport) onlyDao external {
        msgport = IMessageLine(_msgport);
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

    function receiveMessage(uint256 _srcAppChainId, address _remoteAppAddress, address _localAppAddress, bytes memory _message) onlyMsgline external {
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