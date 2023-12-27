// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../interface/ILnBridgeSourceV3.sol";
import "./LnBridgeHelper.sol";

contract LnBridgeTargetV3 {
    // timestamp: the time when transfer filled, this is also the flag that the transfer is filled(relayed or slashed)
    // provider: the transfer lnProvider
    struct FillTransfer {
        uint64 timestamp;
        address provider;
    }

    // lockTimestamp: the time when the transfer start from source chain
    // the lockTimestamp is verified on source chain, if slasher falsify this timestamp, then it can't be verified on source chain
    // sourceAmount: the send amount on source chain
    struct SlashInfo {
        uint256 remoteChainId;
        uint64 lockTimestamp;
        uint112 sourceAmount;
        address slasher;
    }

    struct RelayParams {
        uint256 remoteChainId;
        address provider;
        address sourceToken;
        address targetToken;
        uint112 sourceAmount;
        uint112 targetAmount;
        address receiver;
        uint256 nonce;
    }

    // transferId => FillTransfer
    mapping(bytes32 => FillTransfer) public fillTransfers;
    // transferId => SlashInfo
    mapping(bytes32 => SlashInfo) public slashInfos;

    event TransferFilled(bytes32 transferId, address provider);
    event SlashRequest(bytes32 transferId, uint256 remoteChainId, address provider, address sourceToken, address targetToken, address slasher);

    function _sendMessageToSource(uint256 _remoteChainId, bytes memory _payload, bytes memory _extParams) internal virtual {}

    function transferAndReleaseMargin(
        RelayParams calldata _params,
        bytes32 _expectedTransferId,
        bool _relayBySelf
    ) external payable {
        // _relayBySelf = true to protect that the msg.sender don't relay for others
        // _relayBySelf = false to allow that lnProvider can use different account between source chain and target chain
        require(!_relayBySelf || _params.provider == msg.sender, "invalid provider");
        bytes32 transferId = keccak256(abi.encodePacked(
           _params.remoteChainId,
           block.chainid,
           _params.provider,
           _params.sourceToken,
           _params.targetToken,
           _params.receiver,
           _params.sourceAmount,
           _params.targetAmount,
           _params.nonce
        ));
        require(_expectedTransferId == transferId, "check expected transferId failed");
        FillTransfer memory fillTransfer = fillTransfers[transferId];
        // Make sure this transfer was never filled before 
        require(fillTransfer.timestamp == 0, "transfer has been filled");
        fillTransfers[transferId] = FillTransfer(uint64(block.timestamp), _params.provider);

        if (_params.targetToken == address(0)) {
            require(msg.value == _params.targetAmount, "invalid amount");
            LnBridgeHelper.safeTransferNative(_params.receiver, _params.targetAmount);
        } else {
            LnBridgeHelper.safeTransferFrom(_params.targetToken, msg.sender, _params.receiver, uint256(_params.targetAmount));
        }
        emit TransferFilled(transferId, _params.provider);
    }

    function requestSlashAndRemoteRelease(
        RelayParams calldata _params,
        uint64 _timestamp,
        bytes32 _expectedTransferId,
        bytes32 _expectedIdWithTimestamp,
        bytes memory _extParams
    ) external payable {
        bytes32 transferId = keccak256(abi.encodePacked(
           _params.remoteChainId,
           block.chainid,
           _params.provider,
           _params.sourceToken,
           _params.targetToken,
           _params.receiver,
           _params.sourceAmount,
           _params.targetAmount,
           _params.nonce
        ));
        require(_expectedTransferId == transferId, "check expected transferId failed");
        bytes32 idWithTimestamp = keccak256(abi.encodePacked(transferId, _timestamp));
        require(idWithTimestamp == _expectedIdWithTimestamp, "check timestamp failed");

        FillTransfer memory fillTransfer = fillTransfers[transferId];
        require(fillTransfer.timestamp == 0, "transfer has been filled");

        require(_timestamp < block.timestamp - LnBridgeHelper.SLASH_EXPIRE_TIME, "time not expired");
        fillTransfers[transferId] = FillTransfer(uint64(block.timestamp), _params.provider);
        slashInfos[transferId] = SlashInfo(_params.remoteChainId, _timestamp, _params.sourceAmount, msg.sender);

        if (_params.targetToken == address(0)) {
            require(msg.value == _params.targetAmount, "invalid value");
            LnBridgeHelper.safeTransferNative(_params.receiver, _params.targetAmount);
        } else {
            require(msg.value == 0, "value not need");
            LnBridgeHelper.safeTransferFrom(_params.targetToken, msg.sender, _params.receiver, uint256(_params.targetAmount));
        }
        bytes memory message = abi.encodeWithSelector(
           ILnBridgeSourceV3.slash.selector,
           block.chainid,
           transferId,
           _params.sourceAmount,
           _params.provider,
           _timestamp,
           msg.sender
        );
        _sendMessageToSource(_params.remoteChainId, message, _extParams);
        emit SlashRequest(transferId, _params.remoteChainId, _params.provider, _params.sourceToken, _params.targetToken, msg.sender);
    }

    function retrySlash(bytes32 transferId, bytes memory _extParams) external {
        FillTransfer memory fillTransfer = fillTransfers[transferId];
        require(fillTransfer.timestamp > 0, "transfer not filled");
        SlashInfo memory slashInfo = slashInfos[transferId];
        require(slashInfo.slasher == msg.sender, "invalid slasher");
        // send message
        bytes memory message = abi.encodeWithSelector(
           ILnBridgeSourceV3.slash.selector,
           block.chainid,
           transferId,
           slashInfo.sourceAmount,
           fillTransfer.provider,
           slashInfo.lockTimestamp,
           slashInfo.slasher
        );
        _sendMessageToSource(slashInfo.remoteChainId, message, _extParams);
    }

    // can't withdraw for different providers each time
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

