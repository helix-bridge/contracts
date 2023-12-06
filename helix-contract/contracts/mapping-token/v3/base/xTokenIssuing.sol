// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./xTokenErc20.sol";
import "./xTokenBridgeBase.sol";
import "../interfaces/IxTokenBacking.sol";
import "../../interfaces/IGuard.sol";
import "../../../utils/TokenTransferHelper.sol";

contract xTokenIssuing is xTokenBridgeBase {
    struct BurnInfo {
        bytes32 hash;
        bool hasRefundForFailed;
    }

    struct OriginalTokenInfo {
        uint256 chainId;
        address token;
    }

    // transferId => BurnInfo
    mapping(bytes32 => BurnInfo) burnMessages;
    // transferId => bool
    mapping(bytes32 => bool) public issueTransferIds;

    // original Token => xToken mapping is saved in Issuing Contract
    // salt => xToken address
    mapping(bytes32 => address) xTokens;
    // xToken => Origin Token Info
    mapping(address => OriginalTokenInfo) originalTokens;

    event IssuingERC20Created(uint256 originalChainId, address originalToken, address xToken);
    event IssuingERC20Updated(uint256 originalChainId, address originalToken, address xToken, address oldxToken);
    event RemoteUnlockForIssuingFailureRequested(bytes32 refundId, bytes32 transferId, address originalToken, address originalSender, uint256 amount, uint256 fee);

    function registerxToken(
        uint256 _originalChainId,
        address _originalToken,
        string memory _originalChainName,
        string memory _name,
        string memory _symbol,
        uint8 _decimals,
        uint256 _dailyLimit
    ) external onlyDao returns (address xToken) {
        bytes32 salt = keccak256(abi.encodePacked(_originalChainId, _originalToken, version));
        require(xTokens[salt] == address(0), "contract has been deployed");
        bytes memory bytecode = type(xTokenErc20).creationCode;
        bytes memory bytecodeWithInitdata = abi.encodePacked(
            bytecode,
            abi.encode(
                string(abi.encodePacked(_name, "[", _originalChainName, ">")),
                string(abi.encodePacked("x", _symbol)),
                _decimals
            ));
        assembly {
            xToken := create2(0, add(bytecodeWithInitdata, 0x20), mload(bytecodeWithInitdata), salt)
            if iszero(extcodesize(xToken)) { revert(0, 0) }
        }
        xTokens[salt] = xToken;
        originalTokens[xToken] = OriginalTokenInfo(_originalChainId, _originalToken);
        _setDailyLimit(xToken, _dailyLimit);
        emit IssuingERC20Created(_originalChainId, _originalToken, xToken);
    }

    function updatexToken(
        uint256 _originalChainId,
        address _originalToken,
        address _xToken
    ) external onlyDao {
        bytes32 salt = keccak256(abi.encodePacked(_originalChainId, _originalToken, version));
        address oldxToken = xTokens[salt];
        if (oldxToken != address(0)) {
            require(xTokenErc20(oldxToken).totalSupply() == 0, "can't delete old xToken");
            delete originalTokens[oldxToken];
        }
        xTokens[salt] = _xToken;
        originalTokens[_xToken] = OriginalTokenInfo(_originalChainId, _originalToken);
        emit IssuingERC20Updated(_originalChainId, _originalToken, _xToken, oldxToken);
    }

    // receive issuing xToken message from remote backing contract
    function issuexToken(
        uint256 _remoteChainId,
        address _originalToken,
        address _recipient,
        uint256 _amount
    ) external calledByMessager(_remoteChainId) whenNotPaused {
        bytes32 transferId = _latestRecvMessageId(_remoteChainId);
        bytes32 salt = keccak256(abi.encodePacked(_remoteChainId, _originalToken, version));
        address xToken = xTokens[salt];
        require(xToken != address(0), "xToken not exist");
        require(_amount > 0, "can not receive amount zero");

        require(issueTransferIds[transferId] == false, "message has been accepted");
        issueTransferIds[transferId] = true;

        address _guard = guard;
        if (_guard != address(0)) {
            xTokenErc20(xToken).mint(address(this), _amount);
            uint allowance = xTokenErc20(xToken).allowance(address(this), _guard);
            require(xTokenErc20(xToken).approve(_guard, allowance + _amount), "approve token transfer to guard failed");
            IGuard(_guard).deposit(uint256(transferId), xToken, _recipient, _amount);
        } else {
            xTokenErc20(xToken).mint(_recipient, _amount);
        }
        // emit event
    }

    function burnAndRemoteUnlock(
        address _xToken,
        address _recipient,
        uint256 _amount,
        bytes memory _extParams
    ) external payable {
        require(_amount > 0, "can not transfer amount zero");
        OriginalTokenInfo memory originalInfo = originalTokens[_xToken];
        // transfer to this and then burn
        TokenTransferHelper.safeTransferFrom(_xToken, msg.sender, address(this), _amount);
        xTokenErc20(_xToken).burn(address(this), _amount);

        bytes memory remoteUnlockCall = abi.encodeWithSelector(
            IxTokenBacking.unlockFromRemote.selector,
            originalInfo.token,
            _recipient,
            _amount
        );
        bytes32 transferId = _sendMessage(originalInfo.chainId, remoteUnlockCall, msg.value, _extParams);

        require(burnMessages[transferId].hash == bytes32(0), "message exist");
        bytes32 messageHash = keccak256(abi.encodePacked(transferId, _xToken, msg.sender, _amount));
        burnMessages[transferId] = BurnInfo(messageHash, false);
        //emit BurnAndRemoteUnlocked(transferId, msg.sender, _recipient, _xToken, _amount, fee);
    }

    function requestRemoteUnlockForIssuingFailure(
        bytes32 _transferId,
        uint256 _originalChainId,
        address _originalToken,
        address _originalSender,
        uint256 _amount,
        bytes memory _extParams
    ) external payable {
        require(issueTransferIds[_transferId] == false, "success message can't refund for failed");
        _assertMessageIsDelivered(_originalChainId, _transferId);
        bytes memory handleUnlockForFailed = abi.encodeWithSelector(
            IxTokenBacking.handleUnlockForIssuingFailureFromRemote.selector,
            _transferId,
            _originalToken,
            _originalSender,
            _amount
        );
        bytes32 refundId = _sendMessage(_originalChainId, handleUnlockForFailed, msg.value, _extParams);
        emit RemoteUnlockForIssuingFailureRequested(refundId, _transferId, _originalToken, _originalSender, _amount, msg.value);
    }

    // when burn and unlock failed
    // receive reIssue(refund) message from remote backing contract
    // this will refund xToken to original sender
    function handleIssuingForUnlockFailureFromRemote(
        uint256 _originalChainId,
        bytes32 _transferId,
        address _originalToken,
        address _originalSender,
        uint256 _amount
    ) external calledByMessager(_originalChainId) whenNotPaused {
        BurnInfo memory burnInfo = burnMessages[_transferId];
        require(burnInfo.hasRefundForFailed == false, "Backing:the burn message has been refund");
        bytes32 messageHash = keccak256(abi.encodePacked(_transferId, _originalChainId, _originalSender, _originalToken, _amount));
        require(burnInfo.hash == messageHash, "message is not matched");
        burnMessages[_transferId].hasRefundForFailed = true;

        bytes32 salt = keccak256(abi.encodePacked(_originalChainId, _originalToken, version));
        address xToken = xTokens[salt];
        require(xToken != address(0), "xToken not exist");

        xTokenErc20(xToken).mint(_originalSender, _amount);
        //emit TokenRemintForFailed(_transferId, xToken, _originalSender, _amount);
    }
} 

