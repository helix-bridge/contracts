// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@zeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "./LnBridgeHelper.sol";

/// @title LnBridgeBackingV2
/// @notice LnBridgeBackingV2 is a contract to help user transfer token to liquidity node and generate proof,
///         then the liquidity node must transfer the same amount of the token to the user on target chain.
///         Otherwise user can redeem the margin token from the backing contract.
/// @dev See https://github.com/helix-bridge/contracts/tree/master/helix-contract
contract LnBridgeBackingV2 is LnBridgeHelper {
    uint256 constant public MAX_TRANSFER_AMOUNT = type(uint112).max;
    uint256 constant public LIQUIDITY_FEE_RATE_BASE = 100000;
    // the Liquidity Node provider info
    // Liquidity Node need register first
    struct LnProviderConfigure {
        uint112 margin;
        uint112 baseFee;
        // liquidityFeeRate / 100,000 * amount = liquidityFee
        uint8 liquidityFeeRate;
    }
    struct LnProviderInfo {
        address provider;
        uint64 nonce;
        LnProviderConfigure config;
    }
    // the registered token info
    // localToken and remoteToken is the pair of erc20 token addresses
    // if localToken == address(0), then it's native token
    // if remoteToken == address(0), then remote is native token
    struct TokenInfo {
        address localToken;
        address remoteToken;
        uint112 helixFee;
        uint112 fineFund;
        uint8 localDecimals;
        uint8 remoteDecimals;
    }
    // registered token info
    TokenInfo[] public tokens;
    // registered lnProviders
    // tokenIndex|32bit, providerIndex| 32bit
    uint32 public lnProviderSize;
    mapping(uint64=>LnProviderInfo) public lnProviders;
    // Use this store to limit the number of registered providers per address 
    mapping(uint256=>uint64) public lnProviderIndexes;
    // each time cross chain transfer, amount and fee can't be larger than type(uint112).max
    struct LockInfo {
        uint64 providerKey; // tokenIndex << 32 + providerIndex
        // amount + fee
        uint112 amount;
        uint64 nonce;
        bool hasRefund;
    }
    // key: hash(lastKey, nonce, timestamp, providerKey, msg.sender, amount, tokenIndex)
    mapping(bytes32 => LockInfo) public lockInfos;
    address public feeReceiver;

    event TokenLocked(
        uint64 nonce,
        bytes32 transferId,
        bytes32 lastBlockHash,
        address localToken,
        uint112 amount,
        uint112 fee,
        address receiver);
    event LiquidityWithdrawn(uint64 providerKey, uint112 amount);
    event Refund(bytes32 transferId, address receiver, address rewardReceiver);
    // relayer
    event LnProviderUpdated(address provider, uint64 providerKey, uint112 margin, uint112 baseFee, uint8 liquidityfeeRate);

    function _setFeeReceiver(address _feeReceiver) internal {
        require(_feeReceiver != address(this), "lnBridgeBacking:invalid helix fee receiver");
        feeReceiver = _feeReceiver;
    }

    function _updateHelixFee(uint32 _tokenIndex, uint112 _helixFee) internal {
        require(_tokenIndex < tokens.length, "lnBridgeBacking:invalid token index");
        tokens[_tokenIndex].helixFee = _helixFee;
    }

    function _lnProviderKey(uint32 tokenIndex, uint32 providerIndex) internal pure returns(uint64) {
        return tokenIndex << 32 + providerIndex;
    }

    function _lnProviderAddressKey(address addr, uint32 tokenIndex) internal pure returns(uint256) {
        return uint256(uint160(addr)) << 32 + tokenIndex;
    }

    function _lnProviderTokenIndex(uint64 providerKey) internal pure returns(uint32) {
        return uint32(providerKey >> 32);
    }

    function _lastBlockHash() internal view returns(bytes32) {
        return blockhash(block.number - 1);
    }

    function registerOrUpdateLnProvider(
        uint32 tokenIndex,
        uint112 margin,
        uint112 baseFee,
        uint8 liquidityFeeRate
    ) external payable {
        require(tokenIndex < tokens.length, "lnBridgeBacking:invalid token index");
        require(liquidityFeeRate < LIQUIDITY_FEE_RATE_BASE, "invalid liquidity fee rate");

        uint256 addressKey = _lnProviderAddressKey(msg.sender, tokenIndex);
        uint64 providerKey = lnProviderIndexes[addressKey];

        LnProviderConfigure memory config = LnProviderConfigure(
            margin,
            baseFee,
            liquidityFeeRate);

        if (providerKey == 0) {
            require(margin > 0, "invalid margin value");
            providerKey = _lnProviderKey(tokenIndex, lnProviderSize);
            lnProviderSize += 1;
            lnProviders[providerKey] = LnProviderInfo(msg.sender, 0, config);
            lnProviderIndexes[addressKey] = providerKey;
        } else {
            LnProviderInfo memory oldProviderInfo = lnProviders[providerKey];
            require(oldProviderInfo.provider == msg.sender, "provider slot exist");
            config.margin += oldProviderInfo.config.margin;
            lnProviders[providerKey].config = config;
        }

        // transfer margin
        TokenInfo memory tokenInfo = tokens[tokenIndex];

        if (tokenInfo.localToken == address(0)) {
            require(msg.value == margin, "invalid margin value");
        } else {
            if (margin > 0) {
                _safeTransferFrom(tokenInfo.localToken, msg.sender, address(this), margin);
            }
        }
        emit LnProviderUpdated(msg.sender, providerKey, config.margin, baseFee, liquidityFeeRate);
    }

    function _registerToken(
        address localToken,
        address remoteToken,
        uint112 helixFee,
        uint112 fineFund,
        uint8 localDecimals,
        uint8 remoteDecimals
    ) internal {
        tokens.push(TokenInfo(
            localToken,
            remoteToken,
            helixFee,
            fineFund,
            localDecimals,
            remoteDecimals));
    }

    function calculateProviderFee(LnProviderConfigure memory config, uint112 amount) internal pure returns(uint256) {
        return uint256(config.baseFee) + uint256(config.liquidityFeeRate) * uint256(amount) / LIQUIDITY_FEE_RATE_BASE;
    }

    function fee(
        uint64 providerKey,
        uint112 amount
    ) external view returns(uint256) {
        uint32 tokenIndex = _lnProviderTokenIndex(providerKey);
        TokenInfo memory tokenInfo = tokens[tokenIndex];
        LnProviderInfo memory providerInfo = lnProviders[providerKey];
        uint256 providerFee = calculateProviderFee(providerInfo.config, amount);
        return providerFee + tokenInfo.helixFee;
    }

    // here, nonce must be continuous increments
    function lockAndRemoteIssuing(
        bytes32 lastTransferId,
        uint64 nonce,
        uint64 providerKey,
        uint112 amount,
        uint112 expectedFee,
        uint112 expectedMargin,
        address receiver
    ) external payable {
        uint32 tokenIndex = _lnProviderTokenIndex(providerKey);
        
        require(tokens.length > tokenIndex, "lnBridgeBacking:token not registered");
        require(lockInfos[lastTransferId].nonce + 1 == nonce, "lnBridgeBacking:invalid last transferId");
        require(amount > 0, "lnBridgeBacking:invalid amount");

        TokenInfo memory tokenInfo = tokens[tokenIndex];
        LnProviderInfo memory providerInfo = lnProviders[providerKey];
        uint256 providerFee = calculateProviderFee(providerInfo.config, amount);
        
        require(providerInfo.config.margin >= amount + tokenInfo.fineFund + providerFee, "amount not valid");
        require(providerInfo.nonce + 1 == nonce, "nonce expired");
        require(expectedFee == tokenInfo.helixFee + providerFee, "fee is invalid");
        require(expectedMargin <= providerInfo.config.margin, "margin updated");
        
        uint256 remoteAmount = uint256(amount) * 10**tokenInfo.remoteDecimals / 10**tokenInfo.localDecimals;
        require(remoteAmount < MAX_TRANSFER_AMOUNT, "lnBridgeBacking:overflow amount");
        bytes32 lastBlockHash = _lastBlockHash();
        bytes32 transferId = keccak256(abi.encodePacked(
            lastTransferId,
            lastBlockHash,
            nonce,
            tokenInfo.remoteToken,
            receiver,
            uint112(remoteAmount)));
        require(lockInfos[transferId].nonce == 0, "lnBridgeBacking:transferId exist");
        lockInfos[transferId] = LockInfo(providerKey, amount + uint112(providerFee), nonce, false);

        // increase nonce
        lnProviders[providerKey].nonce = nonce;

        if (tokenInfo.localToken == address(0)) {
            require(amount + expectedFee == msg.value, "lnBridgeBacking:amount unmatched");
            payable(providerInfo.provider).transfer(amount + providerFee);
            if (tokenInfo.helixFee > 0) {
                payable(feeReceiver).transfer(tokenInfo.helixFee);
            }
        } else {
            _safeTransferFrom(
                tokenInfo.localToken,
                msg.sender,
                providerInfo.provider,
                amount + providerFee
            );
            if (tokenInfo.helixFee > 0) {
                _safeTransferFrom(
                    tokenInfo.localToken,
                    msg.sender,
                    feeReceiver,
                    tokenInfo.helixFee
                );
            }
        }
        emit TokenLocked(
            nonce,
            transferId,
            lastBlockHash,
            tokenInfo.localToken,
            amount,
            uint112(providerFee),
            receiver);
    }

    // the token should be sent back to the msg.sender
    // timestamp is the last transfer's time
    // lastTransfer is the latest refund transfer
    function _refund(
        bytes32 lastRefundTransferId,
        bytes32 transferId,
        address receiver,
        address rewardReceiver
    ) internal {
        // check lastTransfer
        LockInfo memory lastLockInfo = lockInfos[lastRefundTransferId];
        require(lastLockInfo.hasRefund || lastLockInfo.nonce == 0, "last transfer invalid");
        LockInfo memory lockInfo = lockInfos[transferId];
        require(!lockInfo.hasRefund, "transfer has been refund");
        uint32 tokenIndex = _lnProviderTokenIndex(lockInfo.providerKey);
        require(lockInfo.amount > 0 && tokenIndex < tokens.length, "lnBridgeBacking:invalid transferId");
        LnProviderInfo memory lnProvider = lnProviders[lockInfo.providerKey];
        TokenInfo memory tokenInfo = tokens[tokenIndex];
        lockInfos[transferId].hasRefund = true;
        // transfer back
        uint256 withdrawAmount = lockInfo.amount + tokenInfo.fineFund;
        require(lnProvider.config.margin >= withdrawAmount, "margin not enough");
        lnProviders[lockInfo.providerKey].config.margin = lnProvider.config.margin - uint112(withdrawAmount);
        uint256 fineFund = tokenInfo.fineFund/2;
        if (tokenInfo.localToken == address(0)) {
            payable(receiver).transfer(lockInfo.amount + fineFund);
            payable(rewardReceiver).transfer(fineFund);
        } else {
            _safeTransfer(tokenInfo.localToken, receiver, lockInfo.amount + fineFund);
            _safeTransfer(tokenInfo.localToken, rewardReceiver, fineFund);
        }

        emit Refund(transferId, receiver, rewardReceiver);
    }

    // lastTransfer is the latest refund transfer, all transfer must be relayed or refunded
    function _withdrawMargin(
        bytes32 lastRefundTransferId,
        bytes32 lastTransferId,
        address provider,
        uint112 amount
    ) internal {
        // check lastTransfer
        LockInfo memory lastRefundLockInfo = lockInfos[lastRefundTransferId];
        require(lastRefundLockInfo.hasRefund || lastRefundLockInfo.nonce == 0, "last transfer invalid");

        LockInfo memory lastLockInfo = lockInfos[lastTransferId];
        uint64 providerKey = lastLockInfo.providerKey;
        uint32 tokenIndex = _lnProviderTokenIndex(providerKey);
        LnProviderInfo memory lnProvider = lnProviders[providerKey];
        require(provider == lnProvider.provider, "invalid provider");
        require(lnProvider.nonce == lastLockInfo.nonce, "invalid last transferid");
        TokenInfo memory tokenInfo = tokens[tokenIndex];
        require(lnProvider.config.margin >= amount, "margin not enough");
        lnProviders[providerKey].config.margin = lnProvider.config.margin - amount;
        if (tokenInfo.localToken == address(0)) {
            payable(provider).transfer(amount);
        } else {
            _safeTransfer(tokenInfo.localToken, provider, amount);
        }
        emit LiquidityWithdrawn(providerKey, amount);
    }

    function tokenLength() external view returns (uint) {
        return tokens.length;
    }
}
 
