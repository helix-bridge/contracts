// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@zeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "./LpBridgeHelper.sol";
import "../../../interfaces/IWToken.sol";

/// @title LpBridgeBacking
/// @notice LpBridgeBacking is a contract to help user lock token and then trigger remote chain issuing
/// @dev See https://github.com/helix-bridge/contracts/tree/master/helix-contract
contract LpBridgeBacking is LpBridgeHelper {
    uint256 constant public MAX_TRANSFER_AMOUNT = type(uint112).max;
    uint32 constant public INVALID_TOKEN_INDEX = type(uint32).max;
    // the registered token info
    // localToken and remoteToken is the pair of erc20 token addresses
    // helixFee is charged by system, if it's bigger then half of user's fee, descrease it to the half
    // remoteChainId is the remote block.chainid
    // remoteIsNative is true when the remoteToken is the remote wrapped native token
    struct TokenInfo {
        address localToken;
        address remoteToken;
        uint112 helixFee;
        uint64 remoteChainId;
        uint8 localDecimals;
        uint8 remoteDecimals;
        bool remoteIsNative;
    }
    // registered token info
    TokenInfo[] public tokens;
    // each time cross chain transfer, amount and fee can't be larger than type(uint112).max
    struct LockInfo {
        uint32 tokenIndex;
        uint112 amount;
        uint112 fee;
    }
    mapping(bytes32 => LockInfo) public lockInfos;
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
    event FeeUpdated(bytes32 transferId, uint256 fee);
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

    function _registerToken(
        address localToken,
        address remoteToken,
        uint112 helixFee,
        uint64 remoteChainId,
        uint8 localDecimals,
        uint8 remoteDecimals,
        bool remoteIsNative
    ) internal {
        tokens.push(TokenInfo(localToken, remoteToken, helixFee, remoteChainId, localDecimals, remoteDecimals, remoteIsNative));
    }

    function _lockAndRemoteIssuing(
        bool lockNative,
        uint256 nonce,
        uint32 tokenIndex,
        uint112 amount,
        uint112 fee,
        address receiver,
        bool issuingNative
    ) internal returns(TokenInfo memory tokenInfo) {
        tokenInfo = tokens[tokenIndex];
        require(fee > tokenInfo.helixFee && amount > 0, "lpBridgeBacking:fee or amount is not enough");
        require(!issuingNative || tokenInfo.remoteIsNative, "lpBridgeBacking:remote not native");
        uint256 remoteAmount = uint256(amount) * 10**tokenInfo.remoteDecimals / 10**tokenInfo.localDecimals;
        require(remoteAmount < MAX_TRANSFER_AMOUNT, "lpBridgeBacking:overflow amount");
        bytes32 transferId = keccak256(abi.encodePacked(
            nonce,
            issuingNative,
            tokenInfo.remoteToken,
            msg.sender,
            receiver,
            uint112(remoteAmount),
            uint64(block.chainid),
            tokenInfo.remoteChainId));
        require(lockInfos[transferId].amount == 0, "lpBridgeBacking:transferId exist");
        lockInfos[transferId] = LockInfo(tokenIndex, amount, fee);
        emit TokenLocked(tokenInfo.remoteChainId, lockNative, issuingNative, nonce, transferId, tokenInfo.localToken, amount, fee, receiver);
    }

    function lockAndRemoteIssuing(
        uint256 nonce,
        address receiver,
        uint112 amount,
        uint112 fee,
        uint32 tokenIndex,
        bool issuingNative
    ) external {
        require(tokens.length > tokenIndex, "lpBridgeBacking:token not registered");
        TokenInfo memory info = _lockAndRemoteIssuing(false, nonce, tokenIndex, amount, fee, receiver, issuingNative);
        _safeTransferFrom(info.localToken, msg.sender, address(this), amount + fee);
    }

    function lockNativeAndRemoteIssuing(
        uint112 amount,
        uint112 fee,
        address receiver,
        uint256 nonce,
        bool issuingNative
    ) external payable {
        require(amount + fee == msg.value, "lpBridgeBacking:amount unmatched");
        require(wTokenIndex != INVALID_TOKEN_INDEX, "lpBridgeBacking:not support");
        TokenInfo memory info = _lockAndRemoteIssuing(true, nonce, wTokenIndex, amount, fee, receiver, issuingNative);
        IWToken(info.localToken).deposit{value: amount + fee}();
    }

    function _increaseFee(bytes32 transferId, uint256 fee) internal returns(uint32 tokenIndex) {
        LockInfo memory lockInfo = lockInfos[transferId];
        require(lockInfo.amount > 0 && lockInfo.tokenIndex < tokens.length, "lpBridgeBacking:invalid transferId");
        uint256 newFee = lockInfo.fee + fee;
        require(newFee < MAX_TRANSFER_AMOUNT, "lpBridgeBacking:fee too large");
        lockInfos[transferId].fee = uint112(newFee);
        tokenIndex = lockInfo.tokenIndex;
        emit FeeUpdated(transferId, newFee);
    }

    function increaseFee(bytes32 transferId, uint256 fee) external {
        uint32 tokenIndex = _increaseFee(transferId, fee);
        TokenInfo memory tokenInfo = tokens[tokenIndex];
        _safeTransferFrom(tokenInfo.localToken, msg.sender, address(this), fee);
    }

    function increaseNativeFee(bytes32 transferId) external payable {
        uint32 tokenIndex = _increaseFee(transferId, msg.value);
        require(tokenIndex == wTokenIndex && wTokenIndex != INVALID_TOKEN_INDEX, "lpBridgeBacking:invalid token index");
        TokenInfo memory tokenInfo = tokens[tokenIndex];
        IWToken(tokenInfo.localToken).deposit{value: msg.value}();
    }

    // we require the same token to withdrawn
    function _withdrawLiquidity(
        bytes32[] memory transferIds,
        bool withdrawNative,
        address receiver 
    ) internal {
        require(transferIds.length > 0, "lpBridgeBacking:invalid transferIds size");
        uint32 tokenIndex = lockInfos[transferIds[0]].tokenIndex;
        require(tokenIndex < tokens.length, "lpBridgeBacking:out of token size");
        uint256 amount = 0;
        uint256 fee = 0;
        for (uint i = 0; i < transferIds.length; i++) {
            bytes32 transferId = transferIds[i];
            LockInfo memory lockInfo = lockInfos[transferId];
            require(lockInfo.amount > 0 && lockInfo.tokenIndex < tokens.length, "lpBridgeBacking:invalid transferId");
            require(lockInfo.tokenIndex == tokenIndex, "lpBridgeBacking:invalid tokenindex");
            //can't delete lockInfos directly
            lockInfos[transferId].tokenIndex = INVALID_TOKEN_INDEX;
            amount += lockInfo.amount;
            fee += lockInfo.fee;
            emit LiquidityWithdrawn(transferId, receiver);
        }
        TokenInfo memory tokenInfo = tokens[tokenIndex];
        uint256 helixFee = transferIds.length * tokenInfo.helixFee;
        if (helixFee > fee / 2) {
            helixFee = fee / 2;
        }
        uint256 lpAmount = amount + fee - helixFee;
        if (withdrawNative && tokenIndex == wTokenIndex) {
            IWToken(tokenInfo.localToken).withdraw(lpAmount);
            payable(receiver).transfer(lpAmount);
        } else {
            _safeTransfer(tokenInfo.localToken, receiver, lpAmount);
        }
        _safeTransfer(tokenInfo.localToken, feeReceiver, helixFee);
    }

    function tokenLength() external view returns (uint) {
        return tokens.length;
    }
}
 
