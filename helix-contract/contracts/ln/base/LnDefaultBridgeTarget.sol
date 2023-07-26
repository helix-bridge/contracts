// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "./LnBridgeHelper.sol";

contract LnDefaultBridgeTarget is LnBridgeHelper {
    uint256 constant public MIN_SLASH_TIMESTAMP = 30 * 60;

    struct ProviderInfo {
        uint256 margin;
        // use penalty to store the penalty that provider relayed when timeout
        uint256 penalty;
        uint64 withdrawNonce;
    }

    // providerKey => margin
    // providerKey = hash(provider, sourceToken, targetToken)
    mapping(bytes32=>ProviderInfo) lnProviderInfos;

    // if timestamp > 0, the Transfer has been relayed or slashed
    // if slasher == address(0), this FillTransfer is relayed by lnProvider
    // otherwise, this FillTransfer is slashed by slasher
    struct FillTransfer {
        uint64 timestamp;
        address slasher;
    }

    // transferId => FillTransfer
    mapping(bytes32 => FillTransfer) public fillTransfers;

    event TransferFilled(address provider, bytes32 transferId);
    event Slash(bytes32 transferId, address provider, address token, uint256 margin, address slasher);
    event MarginUpdated(address provider, address token, uint112 amount);

    function depositProviderMargin(
        address sourceToken,
        address targetToken,
        uint256 margin
    ) external payable {
        require(margin > 0, "invalid margin");
        bytes32 providerKey = getDefaultProviderKey(msg.sender, sourceToken, targetToken);
        uint256 updatedMargin = lnProviderInfos[providerKey].margin + margin;
        lnProviderInfos[providerKey].margin = updatedMargin;
        if (targetToken == address(0)) {
            require(msg.value == margin, "invalid margin value");
        } else {
            _safeTransferFrom(targetToken, msg.sender, address(this), margin);
        }
        emit MarginUpdated(msg.sender, sourceToken, uint112(updatedMargin));
    }

    function transferAndReleaseMargin(
        TransferParameter calldata params,
        uint112 penalty,
        bytes32 expectedTransferId
    ) external payable {
        require(params.provider == msg.sender, "invalid provider");
        require(params.previousTransferId == bytes32(0) || fillTransfers[params.previousTransferId].timestamp > 0, "last transfer not filled");
        bytes32 transferId = keccak256(abi.encodePacked(
           params.previousTransferId,
           params.provider,
           params.sourceToken,
           params.targetToken,
           params.receiver,
           params.timestamp,
           params.amount,
           penalty
        ));
        require(expectedTransferId == transferId, "check expected transferId failed");
        FillTransfer memory fillTransfer = fillTransfers[transferId];
        // Make sure this transfer was never filled before 
        require(fillTransfer.timestamp == 0, "transfer has been filled");

        fillTransfers[transferId].timestamp = uint64(block.timestamp);
        if (block.timestamp > params.timestamp + MIN_SLASH_TIMESTAMP) {
            bytes32 providerKey = getDefaultProviderKey(msg.sender, params.sourceToken, params.targetToken);
            ProviderInfo memory providerInfo = lnProviderInfos[providerKey];
            lnProviderInfos[providerKey].margin = providerInfo.margin - penalty;
            lnProviderInfos[providerKey].penalty = providerInfo.penalty + penalty;
        }

        if (params.targetToken == address(0)) {
            require(msg.value == params.amount, "lnBridgeTarget:invalid amount");
            payable(params.receiver).transfer(params.amount);
        } else {
            _safeTransferFrom(params.targetToken, msg.sender, params.receiver, uint256(params.amount));
        }
        emit TransferFilled(params.provider, transferId);
    }

    function _withdraw(
        bytes32 lastTransferId,
        uint64 withdrawNonce,
        address provider,
        address sourceToken,
        address targetToken,
        uint112 amount
    ) internal {
        // ensure all transfer has finished
        require(lastTransferId == bytes32(0) || fillTransfers[lastTransferId].timestamp > 0, "last transfer not filled");

        bytes32 providerKey = getDefaultProviderKey(provider, sourceToken, targetToken);
        ProviderInfo memory providerInfo = lnProviderInfos[providerKey];
        // all the early withdraw info ignored
        require(providerInfo.withdrawNonce < withdrawNonce, "withdraw nonce expired");

        // transfer token
        require(providerInfo.margin >= amount, "margin not enough");
        lnProviderInfos[providerKey].margin = providerInfo.margin - amount;
        lnProviderInfos[providerKey].withdrawNonce = withdrawNonce;

        if (targetToken == address(0)) {
            payable(provider).transfer(amount);
        } else {
            _safeTransfer(targetToken, provider, amount);
        }
        emit MarginUpdated(provider, sourceToken, amount);
    }

    function _slash(
        TransferParameter memory params,
        address slasher,
        uint112 fee,
        uint112 penalty
    ) internal {
        require(params.previousTransferId == bytes32(0) || fillTransfers[params.previousTransferId].timestamp > 0, "last transfer not filled");

        bytes32 transferId = keccak256(abi.encodePacked(
            params.previousTransferId,
            params.provider,
            params.sourceToken,
            params.targetToken,
            params.receiver,
            params.timestamp,
            params.amount,
            penalty
        ));
        FillTransfer memory fillTransfer = fillTransfers[transferId];
        require(fillTransfer.slasher == address(0), "transfer has been slashed");
        bytes32 providerKey = getDefaultProviderKey(params.provider, params.sourceToken, params.targetToken);
        ProviderInfo memory providerInfo = lnProviderInfos[providerKey];
        uint256 updatedMargin = providerInfo.margin;
        // transfer is not filled
        if (fillTransfer.timestamp == 0) {
            require(params.timestamp < block.timestamp - MIN_SLASH_TIMESTAMP, "time not expired");
            fillTransfers[transferId] = FillTransfer(uint64(block.timestamp), slasher);

            // 1. transfer token to receiver
            // 2. trnasfer fee and penalty to slasher
            // update margin
            uint256 marginCost = params.amount + fee + penalty;
            require(providerInfo.margin >= marginCost, "margin not enough");
            updatedMargin = providerInfo.margin - marginCost;
            lnProviderInfos[providerKey].margin = updatedMargin;

            if (params.targetToken == address(0)) {
                payable(params.receiver).transfer(params.amount);
                payable(slasher).transfer(fee + penalty);
            } else {
                _safeTransfer(params.targetToken, params.receiver, uint256(params.amount));
                _safeTransfer(params.targetToken, slasher, fee + penalty);
            }
        } else {
            require(fillTransfer.timestamp > params.timestamp + MIN_SLASH_TIMESTAMP, "time not expired");
            fillTransfers[transferId].slasher = slasher;
            // transfer penalty to slasher
            require(providerInfo.penalty >= penalty, "penalty not enough");
            lnProviderInfos[providerKey].penalty = providerInfo.penalty - penalty;
            if (params.targetToken == address(0)) {
                payable(slasher).transfer(penalty);
            } else {
                _safeTransfer(params.targetToken, slasher, penalty);
            }
        }
        emit Slash(transferId, params.provider, params.sourceToken, updatedMargin, slasher);
    }
}

