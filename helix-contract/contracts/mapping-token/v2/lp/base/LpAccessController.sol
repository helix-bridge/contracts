// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@zeppelin-solidity/contracts/access/AccessControlEnumerable.sol";
import "@zeppelin-solidity/contracts/security/Pausable.sol";

/// @title LpAccessController
/// @notice LpAccessController is a contract to control the access permission 
/// @dev See https://github.com/helix-bridge/contracts/tree/master/helix-contract
contract LpAccessController is AccessControlEnumerable, Pausable {
    bytes32 public constant DAO_ADMIN_ROLE = keccak256("DAO_ADMIN_ROLE");
    bytes32 public constant OPERATOR_ROLE  = keccak256("OPERATOR_ROLE");

    modifier onlyDao() {
        require(hasRole(DAO_ADMIN_ROLE, msg.sender), "lpBridge:Bad dao role");
        _;
    }

    modifier onlyOperator() {
        require(hasRole(OPERATOR_ROLE, msg.sender), "lpBridge:Bad operator role");
        _;
    }

    function _initialize(address dao) internal {
        _setRoleAdmin(OPERATOR_ROLE, DAO_ADMIN_ROLE);
        _setRoleAdmin(DAO_ADMIN_ROLE, DAO_ADMIN_ROLE);
        _setupRole(DAO_ADMIN_ROLE, dao);
        _setupRole(OPERATOR_ROLE, msg.sender);
    }

    function unpause() external onlyOperator {
        _unpause();
    }

    function pause() external onlyOperator {
        _pause();
    }
}

