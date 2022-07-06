// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@zeppelin-solidity-4.4.0/contracts/proxy/utils/Initializable.sol";
import "./AccessController.sol";

contract Backing is AccessController, Initializable {
    address public messageHandle;
    address public remoteMappingTokenFactory;
    
    uint256 internal locked;
    modifier nonReentrant {
        require(locked == 0, "backing: locked");
        locked = 1;
        _;
        locked = 0;
    }

    modifier onlyMessageHandle() {
        require(messageHandle == msg.sender, "Backing:Bad message handle");
        _;
    }

    function initialize(address _messageHandle) public initializer {
        messageHandle = _messageHandle;
        _initialize(msg.sender);
    }

    function _setMessageHandle(address _messageHandle) internal {
        messageHandle = _messageHandle;
    }

    function setRemoteMappingTokenFactory(address _remoteMappingTokenFactory) external onlyAdmin {
          remoteMappingTokenFactory = _remoteMappingTokenFactory;
    }
}
 
