// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@arbitrum/nitro-contracts/src/bridge/IInbox.sol";
import "@arbitrum/nitro-contracts/src/libraries/AddressAliasHelper.sol";
import "../interface/ILowLevelMessager.sol";

// from ethereum to arbitrum messager
contract Eth2ArbMessager is ILowLevelMessager {
    uint256 immutable public REMOTE_CHAINID;
    IInbox public inbox;
    address public remoteMessager;
    address public remoteMessagerAlias;

    mapping(address=>address) public appPairs;

    modifier onlyRemoteBridge() {
        require(msg.sender == remoteMessagerAlias, "invalid remote caller");
        _;
    }

    constructor(address _inbox, uint256 _remoteChainId) {
        inbox = IInbox(_inbox);
        REMOTE_CHAINID = _remoteChainId;
    }

    // only can be set once
    function setRemoteMessager(address _remoteMessager) external {
        require(remoteMessager == address(0), "remote exist");
        remoteMessager = _remoteMessager;
        remoteMessagerAlias = AddressAliasHelper.applyL1ToL2Alias(_remoteMessager);
    }

    function registerBridgePair(uint256 _remoteChainId, address _remoteBridge) external {
        require(_remoteChainId == REMOTE_CHAINID, "invalid remote chainId");
        appPairs[msg.sender] = _remoteBridge;
    }

    function sendMessage(uint256 _remoteChainId, bytes memory _message, bytes memory _params) external payable {
        require(_remoteChainId == REMOTE_CHAINID, "invalid remote chainId");
        address remoteAppAddress = appPairs[msg.sender];
        require(remoteAppAddress != address(0), "app not registered");

        (uint256 maxSubmissionCost, uint256 l2GasPrice, uint256 l2GasLimit, address refunder) = abi.decode(_params, (uint256, uint256, uint256, address));

        bytes memory remoteReceiveCall = abi.encodeWithSelector(
            Eth2ArbMessager.recvMessage.selector,
            msg.sender,
            remoteAppAddress,
            _message
        );
        inbox.createRetryableTicket{value: msg.value}(
            remoteMessager,
            0,
            maxSubmissionCost,
            refunder,
            refunder,
            l2GasLimit,
            l2GasPrice,
            remoteReceiveCall
        );
    }

    function recvMessage(address _remoteApp, address _localApp, bytes memory _message) onlyRemoteBridge external {
        address remoteAppAddress = appPairs[_localApp];
        require(remoteAppAddress == _remoteApp, "invalid remote app");
        (bool result,) = _localApp.call(_message);
        require(result == true, "local call failed");
    }

    function fee(
        uint256 _callSize,
        uint256 _l1GasPrice,
        uint256 _l2GasPrice,
        uint256 _l2GasLimit,
        uint256 _percentIncrease
    ) external view returns(uint256, uint256) {
        uint256 submissionFee = inbox.calculateRetryableSubmissionFee(_callSize, _l1GasPrice);
        uint256 scaleSubmissionFee = submissionFee + submissionFee * _percentIncrease / 100;
        return (scaleSubmissionFee, scaleSubmissionFee + _l2GasPrice * _l2GasLimit);
    }

    function encodeParams(
        uint256 _maxSubmissionCost,
        uint256 _l2GasPrice,
        uint256 _l2GasLimit,
        address _refunder
    ) external pure returns(bytes memory) {
        return abi.encode(_maxSubmissionCost, _l2GasPrice, _l2GasLimit, _refunder);
    }
}

