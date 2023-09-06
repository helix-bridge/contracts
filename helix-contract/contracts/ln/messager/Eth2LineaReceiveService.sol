// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "./interface/ILineaMessageService.sol";
import "../interface/ILowLevelMessager.sol";

// from ethereum to linea messager
contract Eth2LineaReceiveService is ILowLevelMessageReceiver {
    uint256 immutable public REMOTE_CHAINID;
    ILineaMessageService public messageService;
    address public remoteMessager;

    mapping(address=>address) public appPairs;

    modifier onlyRemoteBridge() {
        require(msg.sender == address(messageService), "invalid msg.sender");
        require(messageService.sender() == remoteMessager, "invalid remote caller");
        _;
    }

    constructor(address _messageService, uint256 _remoteChainId) {
        messageService = ILineaMessageService(_messageService);
        REMOTE_CHAINID = _remoteChainId;
    }

    // only can be set once
    function setRemoteMessager(address _remoteMessager) external {
        require(remoteMessager == address(0), "remote exist");
        remoteMessager = _remoteMessager;
    }

    function registerRemoteSender(uint256 _remoteChainId, address _remoteBridge) external {
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
    
