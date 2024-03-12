// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../utils/AccessController.sol";

contract DirectMessager is AccessController {
    constructor(address _dao) {
        _initialize(_dao);
    }

    event MessageSent(uint256 remoteChainId, bytes message, bytes params);
    event CallResult(address receiver, bool success);

    function registerRemoteReceiver(uint256, address) external {}

    function registerRemoteSender(uint256, address) external {}

    function sendMessage(uint256 _remoteChainId, bytes memory _message, bytes memory _params) external payable {
        emit MessageSent(_remoteChainId, _message, _params);
    }

    function recvMessage(address _receiver, bytes calldata _payload) external onlyDao {
        (bool success,) = _receiver.call(_payload);
        emit CallResult(_receiver, success);
    }
}

