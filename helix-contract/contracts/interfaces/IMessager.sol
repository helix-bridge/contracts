// SPDX-License-Identifier: MIT
pragma solidity >=0.8.17;

interface ILowLevelMessageSender {
    function registerRemoteReceiver(uint256 remoteChainId, address remoteBridge) external;
    function sendMessage(uint256 remoteChainId, bytes memory message, bytes memory params) external payable;
}

interface ILowLevelMessageReceiver {
    function registerRemoteSender(uint256 remoteChainId, address remoteBridge) external;
    function recvMessage(address remoteSender, address localReceiver, bytes memory payload) external;
}

interface IMessageId {
    function latestSentMessageId() external view returns(bytes32);
    function latestRecvMessageId() external view returns(bytes32);
}
