// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@arbitrum/nitro-contracts/src/libraries/AddressAliasHelper.sol";
import "@zeppelin-solidity/contracts/proxy/utils/Initializable.sol";
import "./base/LnAccessController.sol";
import "./base/LnBridgeBackingV2.sol";

contract LnArbitrumL2BackingV2 is Initializable, LnAccessController, LnBridgeBackingV2 {
    address public remoteIssuing;
    address public remoteIssuingOnL2;

    receive() external payable {}

    modifier onlyRemoteBridge() {
        require(msg.sender == remoteIssuingOnL2, "LnArbitrumL2Backing:invalid remote caller");
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

    function setRemoteIssuing(address _remoteIssuing) external onlyDao {
        remoteIssuing = _remoteIssuing;
        remoteIssuingOnL2 = AddressAliasHelper.applyL1ToL2Alias(remoteIssuing);
    }

    function setRemoteIssuingOnL2(address _remoteIssuingOnL2) external onlyDao {
        remoteIssuingOnL2 = _remoteIssuingOnL2;
    }

    // backing mode called
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

