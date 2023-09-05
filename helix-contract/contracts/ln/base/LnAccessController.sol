// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@zeppelin-solidity/contracts/security/Pausable.sol";

/// @title LnAccessController
/// @notice LnAccessController is a contract to control the access permission 
/// @dev See https://github.com/helix-bridge/contracts/tree/master/helix-contract
contract LnAccessController is Pausable {
    address public dao;
    address public operator;

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
        operator = msg.sender;
    }

    function setOperator(address _operator) onlyDao external {
        operator = _operator;
    }

    function transferOwnership(address _dao) onlyDao external {
        dao = _dao;
    }

    function unpause() external onlyOperator {
        _unpause();
    }

    function pause() external onlyOperator {
        _pause();
    }
}

