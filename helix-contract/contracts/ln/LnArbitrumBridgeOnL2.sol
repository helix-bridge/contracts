// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@arbitrum/nitro-contracts/src/libraries/AddressAliasHelper.sol";
import "@zeppelin-solidity/contracts/proxy/utils/Initializable.sol";
import "./base/LnAccessController.sol";
import "./base/LnBridgeSource.sol";

contract LnArbitrumBridgeOnL2 is Initializable, LnAccessController, LnBridgeSource {
    address public remoteBridge;
    address public remoteBridgeAlias;

    receive() external payable {}

    modifier onlyRemoteBridge() {
        require(msg.sender == remoteBridgeAlias, "LnArbitrumBridgeOnL2:invalid remote caller");
        _;
    }

    function initialize(address dao) public initializer {
        _initialize(dao);
        _setFeeReceiver(dao);
    }

    function updateFeeReceiver(address _receiver) external onlyDao {
        _setFeeReceiver(_receiver);
    }

    function updateProtocolFee(uint32 _tokenIndex, uint112 _protocolFee) external onlyDao {
        _updateProtocolFee(_tokenIndex, _protocolFee);
    }

    function setRemoteBridge(address _remoteBridge) external onlyDao {
        remoteBridge = _remoteBridge;
        remoteBridgeAlias = AddressAliasHelper.applyL1ToL2Alias(remoteBridge);
    }

    function setRemoteBridgeAlias(address _remoteBridgeAlias) external onlyDao {
        remoteBridgeAlias = _remoteBridgeAlias;
    }

    function registerToken(
        address local,
        address remote,
        uint112 protocolFee,
        uint112 penaltyLnCollateral,
        uint8 localDecimals,
        uint8 remoteDecimals
    ) external onlyOperator {
        _registerToken(local, remote, protocolFee, penaltyLnCollateral, localDecimals, remoteDecimals);
    }

    function refund(
        bytes32 latestSlashTransferId,
        bytes32 transferId,
        address slasher
    ) external onlyRemoteBridge whenNotPaused {
        _refund(latestSlashTransferId, transferId, slasher);
    }

    function withdrawMargin(
        bytes32 latestSlashTransferId,
        bytes32 lastTransferId,
        address provider,
        uint112 amount
    ) external onlyRemoteBridge whenNotPaused {
        _withdrawMargin(latestSlashTransferId, lastTransferId, provider, amount);
    }
}

