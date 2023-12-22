// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../interface/ILnBridgeSourceV3.sol";
import "./LnBridgeHelper.sol";

contract LnBridgeTargetV3 {
    // timestamp: the time when transfer filled
    // provider: the transfer lnProvider
    struct FillTransfer {
        uint64 timestamp;
        address provider;
    }

    // lockTimestamp: the time when the transfer start from source chain
    // sourceAmount: the send amount on source chain
    struct SlashInfo {
        uint256 remoteChainId;
        uint64 lockTimestamp;
        uint112 sourceAmount;
        address slasher;
    }

    // transferId => FillTransfer
    mapping(bytes32 => FillTransfer) public fillTransfers;
    // transferId => SlashInfo
    mapping(bytes32 => SlashInfo) public slashInfos;

    event TransferFilled(bytes32 transferId, address provider);
    event SlashRequest(bytes32 transferId, uint256 remoteChainId, address provider, address sourceToken, address targetToken, address slasher);

    function _sendMessageToSource(uint256 _remoteChainId, bytes memory _payload, bytes memory _extParams) internal virtual {}

    function transferAndReleaseMargin(
        uint256 _remoteChainId,
        address _provider,
        address _sourceToken,
        address _targetToken,
        uint112 _sourceAmount,
        uint112 _targetAmount,
        address _receiver,
        uint256  _nonce,
        bytes32 _expectedTransferId,
        bool _relayBySelf
    ) external payable {
        // _relayBySelf = true to protect that the msg.sender don't relay for others
        // _relayBySelf = false to allow that lnProvider can use different account between source chain and target chain
        require(!_relayBySelf || _provider == msg.sender, "invalid provider");
        bytes32 transferId = keccak256(abi.encodePacked(
           _remoteChainId,
           block.chainid,
           _provider,
           _sourceToken,
           _targetToken,
           _receiver,
           _sourceAmount,
           _targetAmount,
           _nonce
        ));
        require(_expectedTransferId == transferId, "check expected transferId failed");
        FillTransfer memory fillTransfer = fillTransfers[transferId];
        // Make sure this transfer was never filled before 
        require(fillTransfer.timestamp == 0, "transfer has been filled");
        fillTransfers[transferId] = FillTransfer(uint64(block.timestamp), _provider);

        if (_targetToken == address(0)) {
            require(msg.value == _targetAmount, "invalid amount");
            LnBridgeHelper.safeTransferNative(_receiver, _targetAmount);
        } else {
            LnBridgeHelper.safeTransferFrom(_targetToken, msg.sender, _receiver, uint256(_targetAmount));
        }
        emit TransferFilled(transferId, _provider);
    }

    function requestSlashAndRemoteRelease(
        uint256 _remoteChainId,
        address _provider,
        address _sourceToken,
        address _targetToken,
        uint112 _sourceAmount,
        uint112 _targetAmount,
        address _receiver,
        uint256  _nonce,
        uint64 _timestamp,
        bytes32 _expectedTransferId,
        bytes memory _extParams
    ) external payable {
        bytes32 transferId = keccak256(abi.encodePacked(
           _remoteChainId,
           block.chainid,
           _provider,
           _sourceToken,
           _targetToken,
           _receiver,
           _sourceAmount,
           _targetAmount,
           _nonce
        ));
        require(_expectedTransferId == transferId, "check expected transferId failed");

        FillTransfer memory fillTransfer = fillTransfers[transferId];
        require(fillTransfer.timestamp == 0, "transfer has been filled");

        require(_timestamp < block.timestamp - LnBridgeHelper.SLASH_EXPIRE_TIME, "time not expired");
        fillTransfers[transferId] = FillTransfer(uint64(block.timestamp), _provider);
        slashInfos[transferId] = SlashInfo(_remoteChainId, _timestamp, _sourceAmount, msg.sender);

        if (_targetToken == address(0)) {
            require(msg.value == _targetAmount, "invalid value");
            LnBridgeHelper.safeTransferNative(_receiver, _targetAmount);
        } else {
            require(msg.value == 0, "value not need");
            LnBridgeHelper.safeTransferFrom(_targetToken, msg.sender, _receiver, uint256(_targetAmount));
        }
        bytes memory message = abi.encodeWithSelector(
           ILnBridgeSourceV3.slash.selector,
           transferId,
           _sourceAmount,
           _provider,
           _timestamp,
           msg.sender
        );
        _sendMessageToSource(_remoteChainId, message, _extParams);
        emit SlashRequest(transferId, _remoteChainId, _provider, _sourceToken, _targetToken, msg.sender);
    }

    function retrySlash(bytes32 transferId, bytes memory _extParams) external {
        FillTransfer memory fillTransfer = fillTransfers[transferId];
        require(fillTransfer.timestamp > 0, "transfer not filled");
        SlashInfo memory slashInfo = slashInfos[transferId];
        require(slashInfo.slasher == msg.sender, "invalid slasher");
        // send message
        bytes memory message = abi.encodeWithSelector(
           ILnBridgeSourceV3.slash.selector,
           transferId,
           slashInfo.sourceAmount,
           fillTransfer.provider,
           slashInfo.lockTimestamp,
           slashInfo.slasher
        );
        _sendMessageToSource(slashInfo.remoteChainId, message, _extParams);
    }

    function requestWithdrawLiquidity(
        uint256 _remoteChainId,
        bytes32[] calldata _transferIds,
        address _provider,
        bytes memory _extParams
    ) external {
        for (uint i = 0; i < _transferIds.length; i++) {
            bytes32 transferId = _transferIds[i];
            FillTransfer memory fillTransfer = fillTransfers[transferId];
            require(fillTransfer.provider == _provider, "provider invalid");
        }
        bytes memory message = abi.encodeWithSelector(
           ILnBridgeSourceV3.withdrawLiquidity.selector,
           _transferIds,
           block.chainid,
           _provider
        );
        _sendMessageToSource(_remoteChainId, message, _extParams);
    }
}

