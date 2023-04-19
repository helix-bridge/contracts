// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@zeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "./LnBridgeHelper.sol";
import "../../../interfaces/IWToken.sol";

/// @title LnBridgeBackingV2
/// @notice LnBridgeBackingV2 is a contract to help user transfer token to liquidity node and generate proof,
///         then the liquidity node must transfer the same amount of the token to the user on target chain.
///         Otherwise user can redeem the margin token from the backing contract.
/// @dev See https://github.com/helix-bridge/contracts/tree/master/helix-contract
contract LnBridgeBackingV2 is LnBridgeHelper {
    uint256 constant public MAX_TRANSFER_AMOUNT = type(uint112).max;
    uint32 constant public INVALID_TOKEN_INDEX = type(uint32).max;
    uint256 constant public LIQUIDITY_FEE_RATE_BASE = 100000;
    uint256 constant public MIN_WITHDRAW_TIMESTAMP = 30 * 60;
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
    // helixFee is charged by system, if it's bigger then half of user's fee, descrease it to the half
    // remoteChainId is the remote block.chainid
    // remoteIsNative is true when the remoteToken is the remote wrapped native token
    struct TokenInfo {
        address localToken;
        address remoteToken;
        uint112 helixFee;
        uint112 fineFund;
        uint64 remoteChainId;
        uint8 localDecimals;
        uint8 remoteDecimals;
        bool remoteIsNative;
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
        bool isNative;
        bool hasRefund;
    }
    // key: hash(lastKey, nonce, timestamp, providerKey, msg.sender, amount, tokenIndex)
    mapping(bytes32 => LockInfo) public lockInfos;

    struct TransferInfo {
        address localToken;
        address provider;
        uint112 providerFee;
        uint112 helixFee;
    }
    address public feeReceiver;
    uint32 public wTokenIndex = INVALID_TOKEN_INDEX;

    event TokenLocked(
        uint64 toChainId,
        bool isNative,
        bool issuingNative,
        uint256 nonce,
        bytes32 transferId,
        address token,
        uint112 amount,
        uint112 fee,
        address receiver);
    event LiquidityWithdrawn(bytes32 transferId, address receiver);

    function _setFeeReceiver(address _feeReceiver) internal {
        require(_feeReceiver != address(this), "lpBridgeBacking:invalid helix fee receiver");
        feeReceiver = _feeReceiver;
    }

    function _updateHelixFee(uint32 _tokenIndex, uint112 _helixFee) internal {
        require(_tokenIndex < tokens.length, "lpBridgeBacking:invalid token index");
        tokens[_tokenIndex].helixFee = _helixFee;
    }

    function _setwTokenIndex(uint32 _wTokenIndex) internal {
        wTokenIndex = _wTokenIndex;
    }

    function _lnProviderKey(uint32 tokenIndex, uint32 providerIndex) internal pure returns(uint256) {
        return tokenIndex << 32 + providerIndex;
    }

    function registerLnProvider(
        uint32 tokenIndex,
        uint112 margin,
        uint112 baseFee,
        uint8 liquidityFeeRate
    ) external {
        require(tokenIndex < tokens.length, "lpBridgeBacking:invalid token index");
        require(liquidityFeeRate < LIQUIDITY_FEE_RATE_BASE, "invalid liquidity fee rate");
        uint256 providerKey = _lnProviderKey(tokenIndex, lnProviderSize);
        lnProviders[providerKey] = LnProviderInfo(msg.sender, margin, 1, baseFee, liquidityFeeRate);
        lnProviderSize += 1;
        // transfer margin
        TokenInfo memory tokenInfo = tokens[tokenIndex];
        _safeTransferFrom(tokenInfo.localToken, msg.sender, address(this), margin);
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
        uint64 remoteChainId,
        uint8 localDecimals,
        uint8 remoteDecimals,
        bool remoteIsNative
    ) internal {
        tokens.push(TokenInfo(localToken, remoteToken, helixFee, fineFund, remoteChainId, localDecimals, remoteDecimals, remoteIsNative));
    }

    // here, nonce must be continuous increments
    function _lockAndRemoteIssuing(
        bytes32 lastTransferId,
        bool lockNative,
        uint64 nonce,
        uint32 tokenIndex,
        uint32 providerIndex,
        uint112 amount,
        uint112 maxFee,
        address receiver,
        bool issuingNative
    ) internal returns(TransferInfo memory transferInfo) {
        TokenInfo memory tokenInfo = tokens[tokenIndex];
        {
            require(!issuingNative || tokenInfo.remoteIsNative, "lpBridgeBacking:remote not native");
            require(lockInfos[lastTransferId].nonce == nonce - 1, "lpBridgeBacking:invalid last transferId");
        }
        uint256 providerKey = _lnProviderKey(tokenIndex, providerIndex);
        // check liquidity 
        {
            LnProviderInfo memory providerInfo = lnProviders[providerKey];
            uint256 providerFee = uint256(providerInfo.baseFee) + uint256(providerInfo.liquidityFeeRate) * uint256(amount) / LIQUIDITY_FEE_RATE_BASE;
            require(providerInfo.margin >= amount && amount > 0, "amount not valid");
            require(providerInfo.nonce == nonce, "nonce expired");
            require(maxFee >= tokenInfo.helixFee + providerFee, "fee is invalid");
            transferInfo.provider = providerInfo.provider;
            transferInfo.providerFee = uint112(providerFee);
            transferInfo.localToken = tokenInfo.localToken;
            transferInfo.helixFee = tokenInfo.helixFee;
        }
        uint256 remoteAmount = uint256(amount) * 10**tokenInfo.remoteDecimals / 10**tokenInfo.localDecimals;
        require(remoteAmount < MAX_TRANSFER_AMOUNT, "lpBridgeBacking:overflow amount");
        bytes32 transferId = keccak256(abi.encodePacked(
            lastTransferId,
            block.timestamp,
            nonce,
            issuingNative,
            tokenInfo.remoteToken,
            msg.sender,
            receiver,
            uint112(remoteAmount),
            uint64(block.chainid),
            tokenInfo.remoteChainId));
        require(lockInfos[transferId].amount == 0, "lpBridgeBacking:transferId exist");
        lockInfos[transferId] = LockInfo(tokenIndex, providerIndex, amount + transferInfo.providerFee, nonce, lockNative, false);
        // increase nonce
        lnProviders[providerKey].nonce = nonce + 1;
        emit TokenLocked(
            tokenInfo.remoteChainId,
            lockNative,
            issuingNative,
            nonce,
            transferId,
            tokenInfo.localToken,
            amount,
            transferInfo.providerFee,
            receiver);
    }

    function lockAndRemoteIssuing(
        uint64 nonce,
        bytes32 lastTransferId,
        address receiver,
        uint112 amount,
        uint112 maxFee,
        uint32 tokenIndex,
        uint32 providerIndex,
        bool issuingNative
    ) external {
        require(tokens.length > tokenIndex, "lpBridgeBacking:token not registered");
        TransferInfo memory transferInfo = _lockAndRemoteIssuing(lastTransferId, false, nonce, tokenIndex, providerIndex, amount, maxFee, receiver, issuingNative);
        _safeTransferFrom(
            transferInfo.localToken,
            msg.sender,
            transferInfo.provider,
            amount + transferInfo.providerFee
        );
        if (transferInfo.helixFee > 0) {
            _safeTransferFrom(
                transferInfo.localToken,
                msg.sender,
                feeReceiver,
                transferInfo.helixFee
            );
        }
    }

    function lockNativeAndRemoteIssuing(
        uint64 nonce,
        bytes32 lastTransferId,
        uint112 amount,
        uint112 maxFee,
        address receiver,
        uint32 providerIndex,
        bool issuingNative
    ) external payable {
        require(amount + maxFee <= msg.value, "lpBridgeBacking:amount unmatched");
        require(wTokenIndex != INVALID_TOKEN_INDEX, "lpBridgeBacking:not support");
        TransferInfo memory transferInfo = _lockAndRemoteIssuing(lastTransferId, true, nonce, wTokenIndex, providerIndex, amount, maxFee, receiver, issuingNative);
        payable(transferInfo.provider).transfer(amount + transferInfo.providerFee);
        if (transferInfo.helixFee > 0) {
            payable(feeReceiver).transfer(transferInfo.helixFee);
        }
        uint256 refund = msg.value - amount - transferInfo.helixFee - transferInfo.providerFee;
        if (refund > 0) {
            payable(msg.sender).transfer(refund);
        }
    }

    // the token should be sent back to the msg.sender
    // timestamp is the last transfer's time
    // lastTransfer is the latest refund transfer
    function _withdraw(
        bytes32 lastTransferId,
        bytes32 transferId,
        address receiver,
        address sourceSender,
        uint64 timestamp
    ) internal {
        require(timestamp <= block.timestamp + MIN_WITHDRAW_TIMESTAMP, "time is not expired");

        // check lastTransfer
        LockInfo memory lastLockInfo = lockInfos[lastTransferId];
        require(lastLockInfo.nonce == 0 || lastLockInfo.hasRefund, "last transfer invalid");

        LockInfo memory lockInfo = lockInfos[transferId];
        require(lockInfo.amount > 0 && lockInfo.tokenIndex < tokens.length, "lpBridgeBacking:invalid transferId");
        require(!lockInfo.hasRefund, "transfer has been refund");
        uint256 providerKey = _lnProviderKey(lockInfo.tokenIndex, lockInfo.providerIndex);
        LnProviderInfo memory lnProvider = lnProviders[providerKey];
        TokenInfo memory tokenInfo = tokens[lockInfo.tokenIndex];
        lockInfos[transferId].hasRefund = true;
        // transfer back
        uint256 withdrawAmount = lockInfo.amount + tokenInfo.fineFund;
        require(lnProvider.margin >= withdrawAmount, "margin not enough");
        lnProviders[providerKey].margin = lnProvider.margin - uint112(withdrawAmount);
        if (lockInfo.tokenIndex == wTokenIndex && lockInfo.isNative) {
            IWToken(tokenInfo.localToken).withdraw(withdrawAmount);
            payable(receiver).transfer(lockInfo.amount);
            payable(sourceSender).transfer(tokenInfo.fineFund);
        } else {
            _safeTransfer(tokenInfo.localToken, sourceSender, tokenInfo.fineFund);
            _safeTransfer(tokenInfo.localToken, receiver, lockInfo.amount);
        }

        emit LiquidityWithdrawn(transferId, receiver);
    }

    function tokenLength() external view returns (uint) {
        return tokens.length;
    }
}
 
