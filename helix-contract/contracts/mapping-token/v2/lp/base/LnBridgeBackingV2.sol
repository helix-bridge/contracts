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
    struct LnProviderInfo {
        address provider;
        uint112 margin;
        uint64 nonce;
        uint112 baseFee;
        // liquidityFeeRate / 100,000 * amount = liquidityFee
        uint8 liquidityFeeRate;
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
    uint32 lnProviderSize;
    mapping(uint256=>LnProviderInfo) lnProviders;
    // each time cross chain transfer, amount and fee can't be larger than type(uint112).max
    struct LockInfo {
        uint32 tokenIndex;
        uint32 providerIndex;
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
        address remoteToken,
        uint112 amount,
        uint112 fee,
        address receiver);
    event LiquidityWithdrawn(uint32 tokenIndex, uint32 providerIndex, uint112 amount);
    event Refund(bytes32 transferId, address receiver, address rewardReceiver);

    function _setFeeReceiver(address _feeReceiver) internal {
        require(_feeReceiver != address(this), "lnBridgeBacking:invalid helix fee receiver");
        feeReceiver = _feeReceiver;
    }

    function _updateHelixFee(uint32 _tokenIndex, uint112 _helixFee) internal {
        require(_tokenIndex < tokens.length, "lnBridgeBacking:invalid token index");
        tokens[_tokenIndex].helixFee = _helixFee;
    }

    function _lnProviderKey(uint32 tokenIndex, uint32 providerIndex) internal pure returns(uint256) {
        return tokenIndex << 32 + providerIndex;
    }

    function _lastBlockHash() internal view returns(bytes32) {
        return blockhash(block.number - 1);
    }

    function registerOrUpdateLnProvider(
        uint32 tokenIndex,
        uint32 providerIndex,
        uint112 margin,
        uint112 baseFee,
        uint8 liquidityFeeRate
    ) external payable {
        require(tokenIndex < tokens.length, "lnBridgeBacking:invalid token index");
        require(liquidityFeeRate < LIQUIDITY_FEE_RATE_BASE, "invalid liquidity fee rate");
        uint256 providerKey = _lnProviderKey(tokenIndex, providerIndex);
        LnProviderInfo memory oldProviderInfo = lnProviders[providerKey];

        if (providerIndex == lnProviderSize) {
            lnProviderSize += 1;
        } else {
            require(oldProviderInfo.provider == msg.sender, "provider slot exist");
        }

        lnProviders[providerKey] = LnProviderInfo(
            msg.sender,
            margin + oldProviderInfo.margin,
            oldProviderInfo.nonce,
            baseFee,
            liquidityFeeRate);
        // transfer margin
        TokenInfo memory tokenInfo = tokens[tokenIndex];

        if (tokenInfo.localToken == address(0)) {
            require(msg.value == margin, "invalid margin value");
        } else {
            _safeTransferFrom(tokenInfo.localToken, msg.sender, address(this), margin);
        }
    }

    function updateLnProviderFee(
        uint32 tokenIndex,
        uint32 providerIndex,
        uint112 baseFee,
        uint8 liquidityFeeRate
    ) external {
        uint256 providerKey = _lnProviderKey(tokenIndex, providerIndex);
        require(lnProviders[providerKey].provider == msg.sender, "lnBridgeBacking:Invalid Provider");
        require(liquidityFeeRate < LIQUIDITY_FEE_RATE_BASE, "invalid liquidity fee rate");
        lnProviders[providerKey].baseFee = baseFee;
        lnProviders[providerKey].liquidityFeeRate = liquidityFeeRate;
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

    function fee(
        uint32 tokenIndex,
        uint32 providerIndex,
        uint112 amount
    ) external view returns(uint256) {
        TokenInfo memory tokenInfo = tokens[tokenIndex];
        uint256 providerKey = _lnProviderKey(tokenIndex, providerIndex);
        LnProviderInfo memory providerInfo = lnProviders[providerKey];
        uint256 providerFee = uint256(providerInfo.baseFee) + uint256(providerInfo.liquidityFeeRate) * uint256(amount) / LIQUIDITY_FEE_RATE_BASE;
        return providerFee + tokenInfo.helixFee;
    }

    // here, nonce must be continuous increments
    function lockAndRemoteIssuing(
        bytes32 lastTransferId,
        uint64 nonce,
        uint32 tokenIndex,
        uint32 providerIndex,
        uint112 amount,
        uint112 expectedFee,
        address receiver
    ) external payable {
        require(tokens.length > tokenIndex, "lnBridgeBacking:token not registered");
        require(lockInfos[lastTransferId].nonce + 1 == nonce, "lnBridgeBacking:invalid last transferId");
        require(lnProviderSize > providerIndex, "lnBridgeBacking:provider not registered");
        require(amount > 0, "lnBridgeBacking:invalid amount");

        TokenInfo memory tokenInfo = tokens[tokenIndex];
        uint256 providerKey = _lnProviderKey(tokenIndex, providerIndex);
        LnProviderInfo memory providerInfo = lnProviders[providerKey];
        uint256 providerFee = uint256(providerInfo.baseFee) + uint256(providerInfo.liquidityFeeRate) * uint256(amount) / LIQUIDITY_FEE_RATE_BASE;
        
        require(providerInfo.margin >= amount + tokenInfo.fineFund + providerFee, "amount not valid");
        require(providerInfo.nonce + 1 == nonce, "nonce expired");
        require(expectedFee == tokenInfo.helixFee + providerFee, "fee is invalid");
        
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
        lockInfos[transferId] = LockInfo(tokenIndex, providerIndex, amount + uint112(providerFee), nonce, false);

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
            tokenInfo.remoteToken,
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
        require(lockInfo.amount > 0 && lockInfo.tokenIndex < tokens.length, "lnBridgeBacking:invalid transferId");
        require(!lockInfo.hasRefund, "transfer has been refund");
        uint256 providerKey = _lnProviderKey(lockInfo.tokenIndex, lockInfo.providerIndex);
        LnProviderInfo memory lnProvider = lnProviders[providerKey];
        TokenInfo memory tokenInfo = tokens[lockInfo.tokenIndex];
        lockInfos[transferId].hasRefund = true;
        // transfer back
        uint256 withdrawAmount = lockInfo.amount + tokenInfo.fineFund;
        require(lnProvider.margin >= withdrawAmount, "margin not enough");
        lnProviders[providerKey].margin = lnProvider.margin - uint112(withdrawAmount);
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
        uint32 tokenIndex = lastLockInfo.tokenIndex;
        uint32 providerIndex = lastLockInfo.providerIndex;
        uint256 providerKey = _lnProviderKey(tokenIndex, providerIndex);
        LnProviderInfo memory lnProvider = lnProviders[providerKey];
        require(provider == lnProvider.provider, "invalid provider");
        require(lnProvider.nonce == lastLockInfo.nonce, "invalid last transferid");
        TokenInfo memory tokenInfo = tokens[lastLockInfo.tokenIndex];
        require(lnProvider.margin >= amount, "margin not enough");
        lnProviders[providerKey].margin = lnProvider.margin - amount;
        if (tokenInfo.localToken == address(0)) {
            payable(provider).transfer(amount);
        } else {
            _safeTransfer(tokenInfo.localToken, provider, amount);
        }
        emit LiquidityWithdrawn(tokenIndex, providerIndex, amount);
    }

    function tokenLength() external view returns (uint) {
        return tokens.length;
    }
}
 
