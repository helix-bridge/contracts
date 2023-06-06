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

    function updateHelixFee(uint32 _tokenIndex, uint112 _helixFee) external onlyDao {
        _updateHelixFee(_tokenIndex, _helixFee);
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
        uint112 helixFee,
        uint112 fineFund,
        uint8 localDecimals,
        uint8 remoteDecimals
    ) external onlyOperator {
        _registerToken(local, remote, helixFee, fineFund, localDecimals, remoteDecimals);
    }

    function refund(
        bytes32 lastRefundTransferId,
        bytes32 transferId,
        address receiver,
        address rewardReceiver
    ) external onlyRemoteBridge whenNotPaused {
        _refund(lastRefundTransferId, transferId, receiver, rewardReceiver);
    }

    function withdrawMargin(
        bytes32 lastRefundTransferId,
        bytes32 lastTransferId,
        address provider,
        uint112 amount
    ) external onlyRemoteBridge whenNotPaused {
        _withdrawMargin(lastRefundTransferId, lastTransferId, provider, amount);
    }
}

