// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@zeppelin-solidity/contracts/utils/introspection/ERC165.sol";
import "@zeppelin-solidity/contracts/access/Ownable.sol";
import "../../interfaces/IUniswapV3SwapCallback.sol";
import "../interfaces/IERC20.sol";

import "hardhat/console.sol";

interface IxTokenBacking {
    function lockAndRemoteIssuing(
        uint256 _remoteChainId,
        address _originalToken,
        address _recipient,
        uint256 _amount,
        uint256 _nonce,
        bytes calldata _extData,
        bytes memory _extParams
    ) external payable returns(bytes32 transferId);
}

// mint: xToken -> Token
// burn: Token -> xToken
contract MockxTokenSwap is ERC165 {
    address public backing;

    struct SendInfo {
        address sender;
        address token;
        uint256 amount;
    }

    mapping(address=>address) xToken2Tokens;
    mapping(address=>address) token2xTokens;

    mapping(bytes32=>SendInfo) senderInfos;

    bytes4 constant public CLAIM = bytes4(keccak256(bytes("claim(address,uint256,uint256,address,address,uint256,bytes,bytes[])")));
    bytes4 constant public CLAIM_NATIVE = bytes4(keccak256(bytes("claimNative(address,uint256,uint256,address,address,uint256,bytes,bytes[])")));
    bytes4 constant public CLAIM_BY_TIMEOUT = bytes4(keccak256(bytes("claimByTimeout(address,uint256,uint256,address,address,uint256,bool,bytes)")));
    bytes4 constant public ISSUE_XTOKEN = bytes4(keccak256(bytes("issuexToken(uint256,address,address,address,uint256,uint256,bytes)")));
    bytes4 constant public UNLOCK_FROM_REMOTE = bytes4(keccak256(bytes("unlockFromRemote(uint256,address,address,address,uint256,uint256,bytes)")));

    struct CallbackInfo {
        bytes4 sig;
        bytes32 transferId;
        address token;
        bytes extData;
    }

    constructor(address _xToken, address _token, address _backing) {
        backing = _backing;
        xToken2Tokens[_xToken] = _token;
        token2xTokens[_token] = _xToken;
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165) returns (bool) {
        return
            interfaceId == type(IUniswapV3SwapCallback).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    function uniswapV3SwapCallback(
        int256 _amount0Delta,
        int256 _amount1Delta,
        bytes calldata _data
    ) external {
        CallbackInfo memory callbackInfo = abi.decode(_data, (CallbackInfo));
        if (callbackInfo.sig == ISSUE_XTOKEN || callbackInfo.sig == CLAIM) {
            address recipient = address(bytes20(callbackInfo.extData));
            address token = xToken2Tokens[callbackInfo.token];
            require(token != address(0), "invalid xtoken");
            require(_amount0Delta == _amount1Delta, "invalid amount");
            IERC20(callbackInfo.token).burn(address(this), uint256(_amount0Delta));
            IERC20(token).mint(recipient, uint256(_amount1Delta));
        } else if (callbackInfo.sig == UNLOCK_FROM_REMOTE) {
            SendInfo memory senderInfo = senderInfos[callbackInfo.transferId];
            delete senderInfos[callbackInfo.transferId];
            (bool success, bytes memory data) = senderInfo.token.call(abi.encodeWithSelector(
                IERC20.transfer.selector,
                senderInfo.sender,
                senderInfo.amount
            ));
            require(success && (data.length == 0 || abi.decode(data, (bool))), "helix:transfer token failed");
        }
    }

    function swapLockAndRemoteIssuing(
        uint256 _remoteChainId,
        address _originalToken,
        address _recipient,
        uint256 _amount,
        uint256 _nonce,
        bytes calldata _extData,
        bytes memory _extParams
    ) external {
        if (_originalToken != address(0)) {
            IERC20(_originalToken).approve(backing, _amount);
        }
        bytes32 transferId = IxTokenBacking(backing).lockAndRemoteIssuing(
            _remoteChainId,
            _originalToken,
            _recipient,
            _amount,
            _nonce,
            _extData,
            _extParams
        );
        senderInfos[transferId] = SendInfo(msg.sender, _originalToken, _amount);
    }

    function transferOwnership(address token, address newOwner) external {
        Ownable(token).transferOwnership(newOwner);
    }
}

