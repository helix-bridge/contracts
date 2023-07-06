// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "../interface/ILnBridgeSource.sol";
import "./LnBridgeHelper.sol";

contract LnBridgeTarget is LnBridgeHelper {
    uint256 constant public MIN_SLASH_TIMESTAMP = 30 * 60;

    struct TokenInfo {
        address targetToken;
        uint8 sourceDecimals;
        uint8 targetDecimals;
        bool isRegistered;
    }

    struct ProviderInfo {
        uint256 margin;
        uint64 withdrawNonce;
    }

    // token infos
    // remoteToken => token info
    mapping(address=>TokenInfo) tokenInfos;

    // providerKey => margin
    // providerKey = hash(provider, sourceToken)
    mapping(bytes32=>ProviderInfo) lnProviderMargins;

    // if slasher == address(0), this FillTransfer is relayed by lnProvider
    // otherwise, this FillTransfer is slashed by slasher
    // if there is no slash transfer before, then it's latestSlashTransferId is assigned by INIT_SLASH_TRANSFER_ID, a special flag
    struct FillTransfer {
        uint64 timestamp;
        address slasher;
    }

    // transferId => FillTransfer
    mapping(bytes32 => FillTransfer) public fillTransfers;

    event TransferFilled(bytes32 transferId, address slasher);

    function _fillTransfer(
        bytes32 lastTransferId,
        bytes32 expectedTransferId,
        address sourceToken,
        uint112 amount,
        uint64 timestamp,
        address receiver
    ) internal {
        TokenInfo memory tokenInfo = tokenInfos[sourceToken];
        require(tokenInfo.isRegistered, "token has not been registered");
        bytes32 transferId = keccak256(abi.encodePacked(
            lastTransferId,
            msg.sender,
            sourceToken,
            amount,
            timestamp,
            receiver));
        require(expectedTransferId == transferId, "check expected transferId failed");
        FillTransfer memory fillTransfer = fillTransfers[transferId];
        // Make sure this transfer was never filled before 
        require(fillTransfer.timestamp == 0, "transfer has been filled");

        fillTransfers[transferId].timestamp = uint64(block.timestamp);

        uint256 targetAmount = uint256(amount) * 10**tokenInfo.targetDecimals / 10**tokenInfo.sourceDecimals;
        if (tokenInfo.targetToken == address(0)) {
            require(msg.value >= targetAmount, "lnBridgeTarget:invalid amount");
            payable(receiver).transfer(targetAmount);
        } else {
            _safeTransferFrom(tokenInfo.targetToken, msg.sender, receiver, uint256(targetAmount));
        }
    }

    function _withdraw(
        bytes32 lastTransferId,
        uint64 withdrawNonce,
        address provider,
        address sourceToken,
        uint112 amount
    ) external {
        // ensure all transfer has finished
        FillTransfer memory lastFillTransfer = fillTransfers[lastTransferId];
        require(lastFillTransfer.timestamp > 0, "last transfer not exist");

        bytes32 providerKey = getProviderKey(provider, sourceToken);
        ProviderInfo memory providerInfo = lnProviderMargins[providerKey];
        // all the early withdraw info ignored
        require(providerInfo.withdrawNonce < withdrawNonce, "withdraw nonce expired");

        // transfer token
        TokenInfo memory tokenInfo = tokenInfos[sourceToken];
        require(tokenInfo.isRegistered, "token has not been registered");

        uint256 targetAmount = uint256(amount) * 10**tokenInfo.targetDecimals / 10**tokenInfo.sourceDecimals;

        require(providerInfo.margin >= targetAmount, "margin not enough");
        lnProviderMargins[providerKey] = ProviderInfo(providerInfo.margin - targetAmount, withdrawNonce);

        if (tokenInfo.targetToken == address(0)) {
            payable(provider).transfer(targetAmount);
        } else {
            _safeTransferFrom(tokenInfo.targetToken, address(this), provider, targetAmount);
        }
    }

    function _slash(
        bytes32 lastTransferId,
        address provider,
        address slasher,
        address sourceToken,
        uint112 amount,
        uint112 fee,
        uint112 penalty,
        uint64 timestamp,
        address receiver
    ) internal {
        FillTransfer memory lastFillTransfer = fillTransfers[lastTransferId];
        require(lastFillTransfer.timestamp > 0, "last transfer not exist");

        bytes32 transferId = keccak256(abi.encodePacked(
            lastTransferId,
            msg.sender,
            sourceToken,
            amount,
            timestamp,
            receiver));
        FillTransfer memory fillTransfer = fillTransfers[transferId];
        require(fillTransfer.slasher == address(0), "transfer has been slashed");
        // transfer is not filled
        TokenInfo memory tokenInfo = tokenInfos[sourceToken];
        require(tokenInfo.isRegistered, "token has not been registered");
        bytes32 providerKey = getProviderKey(provider, sourceToken);
        ProviderInfo memory providerInfo = lnProviderMargins[providerKey];
        if (fillTransfer.timestamp == 0) {
            require(timestamp < block.timestamp - MIN_SLASH_TIMESTAMP, "time not expired");
            fillTransfers[transferId] = FillTransfer(uint64(block.timestamp), slasher);

            // 1. transfer token to receiver
            // 2. trnasfer fee and penalty to slasher
            uint256 targetAmount = uint256(amount) * 10**tokenInfo.targetDecimals / 10**tokenInfo.sourceDecimals;
            // update margin
            uint256 marginCost = targetAmount + fee + penalty;
            require(providerInfo.margin >= marginCost, "margin not enough");
            lnProviderMargins[providerKey].margin = providerInfo.margin - marginCost;

            if (tokenInfo.targetToken == address(0)) {
                payable(receiver).transfer(targetAmount);
                payable(slasher).transfer(fee + penalty);
            } else {
                _safeTransferFrom(tokenInfo.targetToken, address(this), receiver, uint256(targetAmount));
                _safeTransferFrom(tokenInfo.targetToken, address(this), slasher, fee + penalty);
            }
        } else {
            require(fillTransfer.timestamp > timestamp + MIN_SLASH_TIMESTAMP, "time not expired");
            // If the transfer fills timeout and no slasher sends the slash message, the margin of this transfer will be locked forever.
            // We utilize this requirement to release the margin.
            // One scenario is when the margin is insufficient due to the execution of slashes after this particular slash transfer.
            // In this case, the slasher cannot cover the gas fee as a penalty.
            // We can acknowledge this situation as it is the slasher's responsibility and the execution should have occurred earlier.
            require(fillTransfer.timestamp > block.timestamp - 2 * MIN_SLASH_TIMESTAMP, "slash a too early transfer");
            fillTransfers[transferId].slasher = slasher;
            // transfer penalty to slasher
            require(providerInfo.margin >= penalty, "margin not enough");
            lnProviderMargins[providerKey].margin = providerInfo.margin - penalty;
            if (tokenInfo.targetToken == address(0)) {
                payable(slasher).transfer(penalty);
            } else {
                _safeTransferFrom(tokenInfo.targetToken, address(this), slasher, penalty);
            }
        }
    }
}

