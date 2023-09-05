// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@zeppelin-solidity/contracts/proxy/utils/Initializable.sol";
import "./base/LnAccessController.sol";
import "./base/LnOppositeBridgeSource.sol";
import "./base/LnOppositeBridgeTarget.sol";
import "./interface/ILowLevelMessager.sol";

contract LnOppositeBridge is Initializable, LnAccessController, LnOppositeBridgeSource, LnOppositeBridgeTarget {
    mapping(uint256=>address) messagers;

    receive() external payable {}

    function initialize(address _dao) public initializer {
        _initialize(_dao);
        _updateFeeReceiver(_dao);
    }

    function updateFeeReceiver(address _receiver) external onlyDao {
        _updateFeeReceiver(_receiver);
    }

    function setTokenInfo(
        uint256 _remoteChainId,
        address _sourceToken,
        address _targetToken,
        uint112 _protocolFee,
        uint112 _penaltyLnCollateral,
        uint8 _sourceDecimals,
        uint8 _targetDecimals
    ) external onlyDao {
        _setTokenInfo(
            _remoteChainId,
            _sourceToken,
            _targetToken,
            _protocolFee,
            _penaltyLnCollateral,
            _sourceDecimals,
            _targetDecimals
        );
    }

    function _sendMessageToTarget(uint256 _remoteChainId, bytes memory _payload, bytes memory _extParams) internal override {
        address messager = messagers[_remoteChainId];
        require(messager != address(0), "invalid messager");
        ILowLevelMessager(messager).sendMessage(_remoteChainId, _payload, _extParams);
    }

    function _verifyRemote(uint256 _remoteChainId) whenNotPaused internal view override {
        address messager = messagers[_remoteChainId];
        require(messager == msg.sender, "invalid messager");
    }
}

