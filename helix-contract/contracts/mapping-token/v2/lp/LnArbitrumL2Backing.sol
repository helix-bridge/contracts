// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@arbitrum/nitro-contracts/src/libraries/AddressAliasHelper.sol";
import "@zeppelin-solidity/contracts/proxy/utils/Initializable.sol";
import "./base/LnAccessController.sol";
import "./base/LnBridgeBacking.sol";

contract LnArbitrumL2Backing is Initializable, LnAccessController, LnBridgeBacking {
    address public remoteIssuing;

    receive() external payable {}

    modifier onlyRemoteBridge() {
        require(msg.sender == AddressAliasHelper.applyL1ToL2Alias(remoteIssuing), "LnArbitrumL2Backing:invalid remote caller");
        _;
    }

    function initialize(address dao) public initializer {
        _initialize(dao);
        _setFeeReceiver(dao);
        _setwTokenIndex(INVALID_TOKEN_INDEX);
    }

    function setwTokenIndex(uint32 _wTokenIndex) external onlyDao {
        _setwTokenIndex(_wTokenIndex);
    }

    function updateFeeReceiver(address _receiver) external onlyDao {
        _setFeeReceiver(_receiver);
    }

    function updateHelixFee(uint32 _tokenIndex, uint112 _helixFee) external onlyDao {
        _updateHelixFee(_tokenIndex, _helixFee);
    }

    function setRemoteIssuing(address _remoteIssuing) external onlyDao {
        remoteIssuing = _remoteIssuing;
    }

    // backing mode called
    function registerToken(
        address local,
        address remote,
        uint112 helixFee,
        uint32 remoteChainId,
        uint8 localDecimals,
        uint8 remoteDecimals,
        bool remoteIsNative
    ) external onlyOperator {
        _registerToken(local, remote, helixFee, remoteChainId, localDecimals, remoteDecimals, remoteIsNative);
    }

    function withdrawLiquidity(
        bytes32[] memory transferIds,
        bool withdrawNative,
        address receiver
    ) external onlyRemoteBridge whenNotPaused {
        _withdrawLiquidity(transferIds, withdrawNative, receiver);
    }
}

