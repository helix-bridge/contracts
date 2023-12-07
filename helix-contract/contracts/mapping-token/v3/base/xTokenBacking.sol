// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@zeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "./xTokenBridgeBase.sol";
import "../interfaces/IxTokenIssuing.sol";
import "../../interfaces/IGuard.sol";
import "../../interfaces/IWToken.sol";
import "../../../utils/TokenTransferHelper.sol";

contract xTokenBacking is xTokenBridgeBase {
    struct LockedInfo {
        bytes32 hash;
        bool hasRefundForFailed;
    }
    
    address public wToken;

    // (transferId => lockedInfo)
    // Token => xToken
    mapping(bytes32 => LockedInfo) public lockedMessages;
    // (transferId => lockedInfo)
    // xToken => Token
    mapping(bytes32 => bool) public unlockedTransferIds;

    // save original token => xToken to prevent unregistered token lock
    mapping(bytes32 => address) public originalToken2xTokens;

    event TokenLocked(bytes32 transferId, uint256 remoteChainId, address token, address sender, address recipient, uint256 amount, uint256 fee);
    event TokenUnlocked(bytes32 transferId, uint256 remoteChainId, address token, address recipient, uint256 amount);
    event RemoteIssuingFailure(bytes32 refundId, bytes32 transferId, address mappingToken, address originalSender, uint256 amount, uint256 fee);
    event TokenUnlockedForFailed(bytes32 transferId, uint256 remoteChainId, address token, address recipient, uint256 amount);

    function setwToken(address _wtoken) external onlyDao {
        wToken = _wtoken;
    }

    function registerOriginalToken(
        uint256 _remoteChainId,
        address _originalToken,
        address _xToken,
        uint256 _dailyLimit
    ) external onlyDao {
        bytes32 key = keccak256(abi.encodePacked(_remoteChainId, _originalToken));
        originalToken2xTokens[key] = _xToken;
        _setDailyLimit(_originalToken, _dailyLimit);
    }

    function lockAndRemoteIssuing(
        uint256 _remoteChainId,
        address _originalToken,
        address _recipient,
        uint256 _amount,
        bytes memory _extParams
    ) external payable {
        bytes32 key = keccak256(abi.encodePacked(_remoteChainId, _originalToken));
        require(originalToken2xTokens[key] != address(0), "token not registered");

        uint256 prepaid = msg.value;
        // lock token
        if (address(0) == _originalToken) {
            // native token
            require(msg.value > _amount, "invalid value");
            prepaid -= _amount;
        } else {
            // erc20 token
            TokenTransferHelper.safeTransferFrom(
                _originalToken,
                msg.sender,
                address(this),
                _amount
            );
        }
        bytes memory issuxToken = encodeIssuexToken(
            _originalToken,
            _recipient,
            _amount
        );
        bytes32 transferId = _sendMessage(_remoteChainId, issuxToken, prepaid, _extParams);
        bytes32 lockMessageHash = keccak256(abi.encodePacked(transferId, _remoteChainId, _originalToken, msg.sender, _amount));
        lockedMessages[transferId] = LockedInfo(lockMessageHash, false);
        emit TokenLocked(transferId, _remoteChainId, _originalToken, msg.sender, _recipient, _amount, prepaid);
    }

    function encodeIssuexToken(
        address _originalToken,
        address _recipient,
        uint256 _amount
    ) public view returns(bytes memory) {
        return abi.encodeWithSelector(
            IxTokenIssuing.issuexToken.selector,
            block.chainid,
            _originalToken,
            _recipient,
            _amount
        );
    }

    // in backing contract, it only know the original token info
    // in issuing contract, it know the mapping relationship of original token and it's mapping token xToken
    // we use original token info in messages

    // method for backing
    // receive unlock original token message from remote issuing contract
    function unlockFromRemote(
        uint256 _remoteChainId,
        address _originalToken,
        address _recipient,
        uint256 _amount
    ) external calledByMessager(_remoteChainId) whenNotPaused {
        expendDailyLimit(_originalToken, _amount);

        bytes32 transferId = _latestRecvMessageId(_remoteChainId);
        require(unlockedTransferIds[transferId] == false, "message has been accepted");
        unlockedTransferIds[transferId] = true;

        // native token do not use guard
        if (address(0) == _originalToken) {
            _unlockNativeToken(transferId, _recipient, _amount);
        } else {
            _unlockErc20Token(transferId, _originalToken, _recipient, _amount);
        }
        emit TokenUnlocked(transferId, _remoteChainId, _originalToken, _recipient, _amount);
    }

    function _unlockNativeToken(
        bytes32 _transferId,
        address _recipient,
        uint256 _amount
    ) internal {
        address _guard = guard;
        if (_guard == address(0)) {
            TokenTransferHelper.safeTransferNative(_recipient, _amount);
        } else {
            IWToken(wToken).deposit{value: _amount}();
            // see https://github.com/helix-bridge/contracts/issues/18
            uint allowance = IERC20(wToken).allowance(address(this), _guard);
            require(IERC20(wToken).approve(_guard, allowance + _amount), "approve token transfer to guard failed");
            IGuard(_guard).deposit(uint256(_transferId), wToken, _recipient, _amount);
        }
    }

    function _unlockErc20Token(
        bytes32 _transferId,
        address _token,
        address _recipient,
        uint256 _amount
    ) internal {
        address _guard = guard;
        if (_guard == address(0)) {
            TokenTransferHelper.safeTransfer(_token, _recipient, _amount);
        } else {
            uint allowance = IERC20(_token).allowance(address(this), _guard);
            require(IERC20(_token).approve(_guard, allowance + _amount), "Backing:approve token transfer to guard failed");
            IGuard(_guard).deposit(uint256(_transferId), _token, _recipient, _amount);
        }
    }

    function requestRemoteIssuingForUnlockFailure(
        bytes32 _transferId,
        uint256 _remoteChainId,
        address _originalToken,
        address _originalSender,
        uint256 _amount,
        bytes memory _extParams
    ) external payable {
        // must not exist in successful issue list
        require(unlockedTransferIds[_transferId] == false, "success message can't refund for failed");
        _assertMessageIsDelivered(_remoteChainId, _transferId);
        bytes memory unlockForFailed = encodeIssuingForUnlockFailureFromRemote(
            _transferId,
            _originalToken,
            _originalSender,
            _amount
        );
        bytes32 refundId = _sendMessage(_remoteChainId, unlockForFailed, msg.value, _extParams);
        emit RemoteIssuingFailure(refundId, _transferId, _originalToken, _originalSender, _amount, msg.value);
    }

    function encodeIssuingForUnlockFailureFromRemote(
        bytes32 _transferId,
        address _originalToken,
        address _originalSender,
        uint256 _amount
    ) public view returns(bytes memory) {
        return abi.encodeWithSelector(
            IxTokenIssuing.handleIssuingForUnlockFailureFromRemote.selector,
            block.chainid,
            _transferId,
            _originalToken,
            _originalSender,
            _amount
        );
    }

    // when lock and issuing failed
    // receive unlock(refund) message from remote issuing contract
    // this will refund original token to original sender
    function handleUnlockForIssuingFailureFromRemote(
        uint256 _remoteChainId,
        bytes32 _transferId,
        address _originalToken,
        address _originSender,
        uint256 _amount
    ) external calledByMessager(_remoteChainId) whenNotPaused {
        LockedInfo memory lockedMessage = lockedMessages[_transferId];
        require(lockedMessage.hasRefundForFailed == false, "the locked message has been refund");
        bytes32 messageHash = keccak256(abi.encodePacked(_transferId, _remoteChainId, _originalToken, _originSender, _amount));
        require(lockedMessage.hash == messageHash, "message is not matched");
        lockedMessages[_transferId].hasRefundForFailed = true;
        if (_originalToken == address(0)) {
            TokenTransferHelper.safeTransferNative(_originSender, _amount);
        } else {
            TokenTransferHelper.safeTransfer(_originalToken, _originSender, _amount);
        }
        emit TokenUnlockedForFailed(_transferId, _remoteChainId, _originalToken, _originSender, _amount);
    }
}
 
