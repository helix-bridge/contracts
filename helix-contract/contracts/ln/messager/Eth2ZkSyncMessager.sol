// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "./interface/IZksyncMailbox.sol";
import "../interface/ILowLevelMessager.sol";

// from ethereum to zkSync messager
contract Eth2ZkSyncMessager is ILowLevelMessager {
    uint160 constant offset = uint160(0x1111000000000000000000000000000000001111);
    uint256 immutable public REMOTE_CHAINID;
    IMailbox public mailbox;
    address public remoteMessager;
    address public remoteMessagerAlias;

    mapping(address=>address) public appPairs;

    modifier onlyRemoteBridge() {
        require(msg.sender == remoteMessagerAlias, "invalid remote caller");
        _;
    }

    constructor(address _mailbox, uint256 _remoteChainId) {
        mailbox = IMailbox(_mailbox);
        REMOTE_CHAINID = _remoteChainId;
    }

    // only can be set once
    function setRemoteMessager(address _remoteMessager) external {
        require(remoteMessager == address(0), "remote exist");
        remoteMessager = _remoteMessager;
        remoteMessagerAlias = address(uint160(_remoteMessager) + offset);
    }

    function registerBridgePair(uint256 _remoteChainId, address _remoteBridge) external {
        require(_remoteChainId == REMOTE_CHAINID, "invalid remote chainId");
        appPairs[msg.sender] = _remoteBridge;
    }

    function sendMessage(uint256 _remoteChainId, bytes memory _message, bytes memory _params) external payable {
        require(_remoteChainId == REMOTE_CHAINID, "invalid remote chainId");
        address remoteAppAddress = appPairs[msg.sender];
        require(remoteAppAddress != address(0), "app not registered");

        (uint256 l2GasLimit, uint256 l2GasPerPubdataByteLimit, address refunder) = abi.decode(_params, (uint256, uint256, address));

        bytes memory remoteReceiveCall = abi.encodeWithSelector(
            Eth2ZkSyncMessager.recvMessage.selector,
            msg.sender,
            remoteAppAddress,
            _message
        );
        mailbox.requestL2Transaction{value: msg.value}(
            remoteMessager,
            0,
            remoteReceiveCall,
            l2GasLimit,
            l2GasPerPubdataByteLimit,
            new bytes[](0),
            refunder
        );
    }

    function recvMessage(address _remoteApp, address _localApp, bytes memory _message) onlyRemoteBridge external {
        address remoteAppAddress = appPairs[_localApp];
        require(remoteAppAddress == _remoteApp, "invalid remote app");
        (bool result,) = _localApp.call(_message);
        require(result == true, "local call failed");
    }

    function fee(
        uint256 _gasPrice,
        uint256 _l2GasLimit,
        uint256 _l2GasPerPubdataByteLimit
    ) external view returns(uint256) {
        return mailbox.l2TransactionBaseCost(_gasPrice, _l2GasLimit, _l2GasPerPubdataByteLimit);
    }

    function encodeParams(
        uint256 _l2GasLimit,
        uint256 _l2GasPerPubdataByteLimit,
        address _refunder
    ) external pure returns(bytes memory) {
        return abi.encode(_l2GasLimit, _l2GasPerPubdataByteLimit, _refunder);
    }
}

