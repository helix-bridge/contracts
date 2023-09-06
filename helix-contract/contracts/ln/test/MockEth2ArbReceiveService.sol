// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "../messager/Eth2ArbReceiveService.sol";

contract MockEth2ArbReceiveService is Eth2ArbReceiveService {
    constructor(uint256 _remoteChainId) Eth2ArbReceiveService(_remoteChainId) {}

    function setRemoteMessagerAlias(address _remoteMessagerAlias) external {
        remoteMessagerAlias = _remoteMessagerAlias;
    }
}
