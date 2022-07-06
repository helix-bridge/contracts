// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@zeppelin-solidity-4.4.0/contracts/utils/math/SafeMath.sol";
import "@zeppelin-solidity-4.4.0/contracts/utils/structs/BitMaps.sol";
import "../Backing.sol";
import "../../interfaces/IBacking.sol";
import "../../interfaces/IERC20.sol";
import "../../interfaces/IGuard.sol";
import "../../interfaces/IHelixApp.sol";
import "../../interfaces/IHelixMessageHandle.sol";
import "../../interfaces/IHelixSub2SubMessageHandle.sol";
import "../../interfaces/IErc20MappingTokenFactory.sol";
import "../../../utils/DailyLimit.sol";

contract Erc20Sub2SubBacking is Backing, DailyLimit, IBacking {
    using SafeMath for uint256;

    struct LockedInfo {
        bytes32 hash;
        bool hasRefundForFailed;
    }

    uint32 public constant NATIVE_TOKEN_TYPE = 0;
    uint32 public constant ERC20_TOKEN_TYPE = 1;
    address public guard;
    string public chainName;
    uint256 public helixFee;

    // (messageId => LockedInfo)
    mapping(uint256 => LockedInfo) lockedMessages;
    BitMaps.BitMap unlockedMessages;

    event NewErc20TokenRegistered(uint256 messageId, address token);
    event TokenLocked(uint256 messageId, bytes32 hash, address token, address sender, address recipient, uint256 amount);
    event TokenUnlocked(address token, address recipient, uint256 amount);
    event TokenUnlockedForFailed(uint256 messageId, address token, address recipient, uint256 amount);

    function setMessageHandle(address _messageHandle) external onlyAdmin {
        _setMessageHandle(_messageHandle);
    }

    function setChainName(string memory _chainName) external onlyAdmin {
        chainName = _chainName;
    }

    function changeDailyLimit(address mappingToken, uint amount) public onlyAdmin  {
        _changeDailyLimit(mappingToken, amount);
    }

    function setHelixFee(uint256 _helixFee) external onlyAdmin {
        helixFee = _helixFee;
    }

    function updateGuard(address newGuard) external onlyAdmin {
        guard = newGuard;
    }

    function fee() external view returns(uint256) {
        return IHelixSub2SubMessageHandle(messageHandle).fee() + helixFee;
    }

    function _sendMessage(
        uint256 remoteReceiveGasLimit,
        uint32  remoteSpecVersion,
        uint64  remoteCallWeight,
        address receiver,
        bytes memory message
    ) internal nonReentrant returns(uint256) {
        uint256 bridgeFee = IHelixSub2SubMessageHandle(messageHandle).fee();
        uint256 totalFee = bridgeFee + helixFee;
        require(msg.value >= totalFee, "backing:the fee is not enough");
        if (msg.value > totalFee) {
            // refund fee to msgSender
            payable(msg.sender).transfer(msg.value - totalFee);
        }
        return IHelixSub2SubMessageHandle(messageHandle).sendMessage{value: bridgeFee}(
            remoteReceiveGasLimit,
            remoteSpecVersion,
            remoteCallWeight,
            remoteMappingTokenFactory,
            message);
    }

    /**
     * @notice reigister new erc20 token to the bridge. Only owner can do this.
     * @param token the original token address
     * @param name the name of the original token
     * @param symbol the symbol of the original token
     * @param decimals the decimals of the original token
     */
    function register(
        uint256 remoteReceiveGasLimit,
        uint32  remoteSpecVersion,
        uint64  remoteCallWeight,
        address token,
        string memory name,
        string memory symbol,
        uint8 decimals,
        uint256 dailyLimit
    ) external payable onlyOperator {
        bytes memory newErc20Contract = abi.encodeWithSelector(
            IErc20MappingTokenFactory.newErc20Contract.selector,
            ERC20_TOKEN_TYPE,
            token,
            chainName,
            name,
            symbol,
            decimals,
            dailyLimit
        );
        uint256 messageId = _sendMessage(
            remoteReceiveGasLimit,
            remoteSpecVersion,
            remoteCallWeight,
            remoteMappingTokenFactory,
            newErc20Contract
        );
        _changeDailyLimit(token, dailyLimit);
        emit NewErc20TokenRegistered(messageId, token);
    }

    /**
     * @notice lock original token and issuing mapping token from bridged chain
     * @dev maybe some tokens will take some fee when transfer
     * @param token the original token address
     * @param recipient the recipient who will receive the issued mapping token
     * @param amount amount of the locked token
     */
    function lockAndRemoteIssuing(
        uint256 remoteReceiveGasLimit,
        uint32  remoteSpecVersion,
        uint64  remoteCallWeight,
        address token,
        address recipient,
        uint256 amount
    ) external payable whenNotPaused {
        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        require(IERC20(token).transferFrom(msg.sender, address(this), amount), "Backing:transfer tokens failed");
        uint256 balanceAfter = IERC20(token).balanceOf(address(this));
        require(balanceBefore.add(amount) == balanceAfter, "Backing:Transfer amount is invalid");
        bytes memory issueMappingToken = abi.encodeWithSelector(
            IErc20MappingTokenFactory.issueMappingToken.selector,
            token,
            recipient,
            amount
        );
        uint256 messageId = _sendMessage(
            remoteReceiveGasLimit,
            remoteSpecVersion,
            remoteCallWeight,
            remoteMappingTokenFactory,
            issueMappingToken
        );
        require(lockedMessages[messageId].hash == bytes32(0), "backing: message exist");
        bytes32 lockMessageHash = hash(abi.encodePacked(messageId, token, msg.sender, amount));
        lockedMessages[messageId] = LockedInfo(lockMessageHash, false);
        emit TokenLocked(messageId, lockMessageHash, token, msg.sender, recipient, amount);
    }

    /**
     * @notice this will be called by inboundLane when the remote mapping token burned and want to unlock the original token
     * @param token the original token address
     * @param recipient the recipient who will receive the unlocked token
     * @param amount amount of the unlocked token
     */
    function unlockFromRemote(
        address token,
        address recipient,
        uint256 amount
    ) public onlyMessageHandle whenNotPaused {
        expendDailyLimit(token, amount);
        // current message id is last message id + 1
        uint256 messageId = IHelixSub2SubMessageHandle(messageHandle).latestRecvMessageId() + 1;
        BitMaps.set(unlockedMessages, messageId);
        if (guard != address(0)) {
            require(IERC20(token).approve(guard, amount), "Backing:approve token transfer to guard failed");
            IGuard(guard).deposit(messageId, token, recipient, amount);
        } else {
            require(IERC20(token).transfer(recipient, amount), "Backing:unlock transfer failed");
        }
        emit TokenUnlocked(token, recipient, amount);
    }

    /**
     * @notice this will be called by messageHandle when the remote issue failed and want to unlock the original token
     * @param token the original token address
     * @param origin_sender the origin_sender who will receive the unlocked token
     * @param amount amount of the unlocked token
     */
    function handleWithdrawFailedTransfer(
        uint256 messageId,
        address token,
        address origin_sender,
        uint256 amount
    ) external onlyMessageHandle whenNotPaused {
        LockedInfo memory lockedMessage = lockedMessages[messageId];
        require(lockedMessage.hasRefundForFailed == false, "Backing: the locked message has been refund");
        bytes32 messageHash = hash(abi.encodePacked(messageId, token, origin_sender, amount));
        require(lockedMessage.hash == messageHash, "Backing: message is not matched");
        lockedMessages[messageId].hasRefundForFailed = true;
        // send token
        require(IERC20(token).transfer(origin_sender, amount), "Backing:unlock transfer failed");
        emit TokenUnlockedForFailed(messageId, token, origin_sender, amount);
    }

    function withdrawFailedTransfer(
        uint256 remoteReceiveGasLimit,
        uint32  remoteSpecVersion,
        uint64  remoteCallWeight,
        uint256 messageId,
        address mappingToken,
        address originalSender,
        uint256 amount
    ) external payable whenNotPaused {
        // must not exist in successful issue list
        require(BitMaps.get(unlockedMessages, messageId) == false, "Backing:success message can't refund for failed");
        // must has been checked by message layer
        uint256 latestRecvMessageId = IHelixSub2SubMessageHandle(messageHandle).latestRecvMessageId();
        require(messageId <= latestRecvMessageId, "Backing:the message is not checked by message layer");
        bytes memory unlockForFailed = abi.encodeWithSelector(
            IHelixAppSupportWithdrawFailed.handleWithdrawFailedTransfer.selector,
            messageId,
            mappingToken,
            originalSender,
            amount
        );
        _sendMessage(
            remoteReceiveGasLimit,
            remoteSpecVersion,
            remoteCallWeight,
            remoteMappingTokenFactory,
            unlockForFailed
        );
    }

    /**
     * @notice this should not be used unless there is a non-recoverable error in the bridge or the target chain
     * we use this to protect user's asset from being locked up
     */
    function rescueFunds(
        address token,
        address recipient,
        uint256 amount
    ) external onlyAdmin {
        IERC20(token).transfer(recipient, amount);
    }

    function withdrawFee(
        address payable recipient,
        uint256 amount
    ) external onlyAdmin {
        recipient.transfer(amount);
    }

    function hash(bytes memory value) public pure returns (bytes32) {
        return sha256(value);
    }
}
