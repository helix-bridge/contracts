// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@arbitrum/nitro-contracts/src/libraries/AddressAliasHelper.sol";
import "./interface/ILowLevelMessager.sol";
import "../utils/AccessController.sol";

// from ethereum to arbitrum messager
contract Eth2ArbReceiveService is ILowLevelMessageReceiver, AccessController {
    uint256 immutable public REMOTE_CHAINID;
    address public remoteMessagerAlias;

    mapping(address=>bool) public whiteList;
    mapping(address=>address) public appPairs;

    modifier onlyWhiteList() {
        require(whiteList[msg.sender], "msg.sender not in whitelist");
        _;
    }

    modifier onlyRemoteBridge() {
        require(msg.sender == remoteMessagerAlias, "invalid remote caller");
        _;
    }

    constructor(address _dao, uint256 _remoteChainId) {
        _initialize(_dao);
        REMOTE_CHAINID = _remoteChainId;
    }

    function setWhiteList(address _caller, bool _enable) external onlyDao {
        whiteList[_caller] = _enable;
    }

    function setRemoteMessager(address _remoteMessager) onlyDao external {
        remoteMessagerAlias = AddressAliasHelper.applyL1ToL2Alias(_remoteMessager);
    }

    function registerRemoteSender(uint256 _remoteChainId, address _remoteBridge) onlyWhiteList external {
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

