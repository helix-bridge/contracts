// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@arbitrum/nitro-contracts/src/libraries/AddressAliasHelper.sol";
import "@zeppelin-solidity/contracts/proxy/utils/Initializable.sol";
import "./base/LnAccessController.sol";
import "./base/LnOppositeBridgeSource.sol";

contract Arb2EthSource is Initializable, LnAccessController, LnOppositeBridgeSource {
    address public remoteBridge;
    address public remoteBridgeAlias;

    receive() external payable {}

    modifier onlyRemoteBridge() {
        require(msg.sender == remoteBridgeAlias, "Arb2EthSource:invalid remote caller");
        _;
    }

    function initialize(address dao) public initializer {
        _initialize(dao);
        _setFeeReceiver(dao);
    }

    function updateFeeReceiver(address _receiver) external onlyDao {
        _setFeeReceiver(_receiver);
    }

    function updateProtocolFee(address token, uint112 _protocolFee) external onlyDao {
        _updateProtocolFee(token, _protocolFee);
    }

    function setRemoteBridge(address _remoteBridge) external onlyDao {
        remoteBridge = _remoteBridge;
        remoteBridgeAlias = AddressAliasHelper.applyL1ToL2Alias(remoteBridge);
    }

    function setRemoteBridgeAlias(address _remoteBridgeAlias) external onlyDao {
        remoteBridgeAlias = _remoteBridgeAlias;
    }

    function registerToken(
        address sourceToken,
        address targetToken,
        uint112 protocolFee,
        uint112 penaltyLnCollateral,
        uint8 sourceDecimals,
        uint8 targetDecimals
    ) external onlyOperator {
        _registerToken(sourceToken, targetToken, protocolFee, penaltyLnCollateral, sourceDecimals, targetDecimals);
    }

    function slash(
        bytes32 latestSlashTransferId,
        bytes32 transferId,
        address provider,
        address sourceToken,
        address slasher
    ) external onlyRemoteBridge whenNotPaused {
        _slash(latestSlashTransferId, transferId, sourceToken, provider, slasher);
    }

    function withdrawMargin(
        bytes32 latestSlashTransferId,
        bytes32 lastTransferId,
        address provider,
        address sourceToken,
        uint112 amount
    ) external onlyRemoteBridge whenNotPaused {
        _withdrawMargin(latestSlashTransferId, lastTransferId, provider, sourceToken, amount);
    }
}

