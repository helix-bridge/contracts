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
 * 11/1/2023
 **/

pragma solidity ^0.8.17;

// File contracts/ln/base/LnAccessController.sol
// License-Identifier: MIT

/// @title LnAccessController
/// @notice LnAccessController is a contract to control the access permission 
/// @dev See https://github.com/helix-bridge/contracts/tree/master/helix-contract
contract LnAccessController {
    address public dao;
    address public operator;

    mapping(address=>bool) public callerWhiteList;

    modifier onlyDao() {
        require(msg.sender == dao, "!dao");
        _;
    }

    modifier onlyOperator() {
        require(msg.sender == operator, "!operator");
        _;
    }

    modifier onlyWhiteListCaller() {
        require(callerWhiteList[msg.sender], "caller not in white list");
        _;
    }

    function _initialize(address _dao) internal {
        dao = _dao;
        operator = _dao;
    }

    function setOperator(address _operator) onlyDao external {
        operator = _operator;
    }

    function authoriseAppCaller(address appAddress, bool enable) onlyDao external {
        callerWhiteList[appAddress] = enable;
    }

    function transferOwnership(address _dao) onlyDao external {
        dao = _dao;
    }
}

// File contracts/ln/messager/interface/IScrollMessenger.sol
// License-Identifier: MIT

interface IScrollMessenger {
  function sendMessage(address target, uint256 value, bytes calldata message, uint256 gasLimit, address refundAddress) external payable;
  function messageQueue() external view returns (address);
  function xDomainMessageSender() external view returns (address);
}

interface IL1MessageQueue {
    function estimateCrossDomainMessageFee(uint256 gasLimit) external view returns(uint256);
}

// File contracts/ln/interface/ILowLevelMessager.sol
// License-Identifier: MIT

interface ILowLevelMessageSender {
    function registerRemoteReceiver(uint256 remoteChainId, address remoteBridge) external;
    function sendMessage(uint256 remoteChainId, bytes memory message, bytes memory params) external payable;
}

interface ILowLevelMessageReceiver {
    function registerRemoteSender(uint256 remoteChainId, address remoteBridge) external;
    function recvMessage(address remoteSender, address localReceiver, bytes memory payload) external;
}

// File contracts/ln/messager/Eth2ScrollReceiveService.sol
// License-Identifier: MIT



// from ethereum to arbitrum messager
contract Eth2ScrollReceiveService is ILowLevelMessageReceiver, LnAccessController {
    uint256 immutable public REMOTE_CHAINID;
    address immutable public scrollMessager;
    address public remoteMessager;

    mapping(address=>address) public appPairs;

    modifier onlyRemoteBridge() {
        require(msg.sender == scrollMessager, "invalid caller");
        require(remoteMessager == IScrollMessenger(scrollMessager).xDomainMessageSender(), "invalid remote caller");
        _;
    }

    constructor(address _dao, address _scrollMessager, uint256 _remoteChainId) {
        _initialize(_dao);
        REMOTE_CHAINID = _remoteChainId;
        scrollMessager = _scrollMessager;
    }

    function setRemoteMessager(address _remoteMessager) onlyDao external {
        remoteMessager = _remoteMessager;
    }

    function registerRemoteSender(uint256 _remoteChainId, address _remoteBridge) onlyWhiteListCaller external {
        require(_remoteChainId == REMOTE_CHAINID, "invalid remote chainId");
        appPairs[msg.sender] = _remoteBridge;
    }

    function recvMessage(address _remoteApp, address _localApp, bytes memory _message) onlyRemoteBridge external {
        address remoteAppAddress = appPairs[_localApp];
        require(remoteAppAddress == _remoteApp, "invalid remote app");
        (bool result,) = _localApp.call(_message);
        require(result == true, "local call failed");
    }
}