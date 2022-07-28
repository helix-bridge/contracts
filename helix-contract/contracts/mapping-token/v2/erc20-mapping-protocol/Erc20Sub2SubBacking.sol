// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@zeppelin-solidity-4.4.0/contracts/utils/math/SafeMath.sol";
import "@zeppelin-solidity-4.4.0/contracts/utils/structs/BitMaps.sol";
import "../Backing.sol";
import "../../interfaces/IBacking.sol";
import "../../interfaces/IERC20.sol";
import "../../interfaces/IGuard.sol";
import "../../interfaces/IHelixApp.sol";
import "../../interfaces/IHelixMessageEndpoint.sol";
import "../../interfaces/IHelixSub2SubMessageEndpoint.sol";
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

    // (transferId => LockedInfo)
    mapping(uint256 => LockedInfo) lockedMessages;
    BitMaps.BitMap unlockedMessages;

    event NewErc20TokenRegistered(uint256 transferId, address token);
    event TokenLocked(uint256 transferId, bytes32 hash, address token, address sender, address recipient, uint256 amount, uint256 fee);
    event TokenUnlocked(uint256 transferId, address token, address recipient, uint256 amount);
    event RemoteIssuingFailure(uint256 transferId, address mappingToken, address originalSender, uint256 amount, uint256 fee);
    event TokenUnlockedForFailed(uint256 transferId, address token, address recipient, uint256 amount);

    function setMessageEndpoint(address _messageEndpoint) external onlyAdmin {
        _setMessageEndpoint(_messageEndpoint);
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
        return IHelixSub2SubMessageEndpoint(messageEndpoint).fee() + helixFee;
    }

    function _sendMessage(
        uint32  remoteSpecVersion,
        uint256 remoteReceiveGasLimit,
        bytes memory message
    ) internal nonReentrant returns(uint256, uint256) {
        uint256 bridgeFee = IHelixSub2SubMessageEndpoint(messageEndpoint).fee();
        uint256 totalFee = bridgeFee + helixFee;
        require(msg.value >= totalFee, "backing:the fee is not enough");
        if (msg.value > totalFee) {
            // refund fee to msgSender
            payable(msg.sender).transfer(msg.value - totalFee);
        }
        uint256 transferId = IHelixSub2SubMessageEndpoint(messageEndpoint).sendMessage{value: bridgeFee}(
            remoteSpecVersion,
            remoteReceiveGasLimit,
            remoteMappingTokenFactory,
            message);
        return (transferId, totalFee);
    }

    /**
     * @notice reigister new erc20 token to the bridge. Only owner can do this.
     * @param token the original token address
     * @param name the name of the original token
     * @param symbol the symbol of the original token
     * @param decimals the decimals of the original token
     */
    function register(
        uint32  remoteSpecVersion,
        uint256 remoteReceiveGasLimit,
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
        (uint256 transferId,) = _sendMessage(
            remoteSpecVersion,
            remoteReceiveGasLimit,
            newErc20Contract
        );
        _changeDailyLimit(token, dailyLimit);
        emit NewErc20TokenRegistered(transferId, token);
    }

    /**
     * @notice lock original token and issuing mapping token from bridged chain
     * @dev maybe some tokens will take some fee when transfer
     * @param token the original token address
     * @param recipient the recipient who will receive the issued mapping token
     * @param amount amount of the locked token
     */
    function lockAndRemoteIssuing(
        uint32  remoteSpecVersion,
        uint256 remoteReceiveGasLimit,
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
        (uint256 transferId, uint256 fee) = _sendMessage(
            remoteSpecVersion,
            remoteReceiveGasLimit,
            issueMappingToken
        );
        require(lockedMessages[transferId].hash == bytes32(0), "backing: message exist");
        bytes32 lockMessageHash = hash(abi.encodePacked(transferId, token, msg.sender, amount));
        lockedMessages[transferId] = LockedInfo(lockMessageHash, false);
        emit TokenLocked(transferId, lockMessageHash, token, msg.sender, recipient, amount, fee);
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
    ) public onlyMessageEndpoint whenNotPaused {
        expendDailyLimit(token, amount);
        // current message id is last message id + 1
        uint256 transferId = IHelixSub2SubMessageEndpoint(messageEndpoint).lastDeliveredMessageId() + 1;
        require(BitMaps.get(unlockedMessages, transferId) == false, "Backing:message has been accepted");
        BitMaps.set(unlockedMessages, transferId);
        if (guard != address(0)) {
            require(IERC20(token).approve(guard, amount), "Backing:approve token transfer to guard failed");
            IGuard(guard).deposit(transferId, token, recipient, amount);
        } else {
            require(IERC20(token).transfer(recipient, amount), "Backing:unlock transfer failed");
        }
        emit TokenUnlocked(transferId, token, recipient, amount);
    }

    /**
     * @notice this will be called by messageEndpoint when the remote issue failed and want to unlock the original token
     * @param token the original token address
     * @param origin_sender the origin_sender who will receive the unlocked token
     * @param amount amount of the unlocked token
     */
    function handleUnlockFailureFromRemote(
        uint256 transferId,
        address token,
        address origin_sender,
        uint256 amount
    ) external onlyMessageEndpoint whenNotPaused {
        LockedInfo memory lockedMessage = lockedMessages[transferId];
        require(lockedMessage.hasRefundForFailed == false, "Backing: the locked message has been refund");
        bytes32 messageHash = hash(abi.encodePacked(transferId, token, origin_sender, amount));
        require(lockedMessage.hash == messageHash, "Backing: message is not matched");
        lockedMessages[transferId].hasRefundForFailed = true;
        // send token
        require(IERC20(token).transfer(origin_sender, amount), "Backing:unlock transfer failed");
        emit TokenUnlockedForFailed(transferId, token, origin_sender, amount);
    }

    function remoteIssuingFailure(
        uint32  remoteSpecVersion,
        uint256 remoteReceiveGasLimit,
        uint256 transferId,
        address mappingToken,
        address originalSender,
        uint256 amount
    ) external payable whenNotPaused {
        // must not exist in successful issue list
        require(BitMaps.get(unlockedMessages, transferId) == false, "Backing:success message can't refund for failed");
        // must has been checked by message layer
        bool messageChecked = IHelixSub2SubMessageEndpoint(messageEndpoint).isMessageDelivered(transferId);
        require(messageChecked, "Backing:the message is not checked by message layer");
        bytes memory unlockForFailed = abi.encodeWithSelector(
            IHelixAppSupportWithdrawFailed.handleIssuingFailureFromRemote.selector,
            transferId,
            mappingToken,
            originalSender,
            amount
        );
        (, uint256 fee) = _sendMessage(
            remoteSpecVersion,
            remoteReceiveGasLimit,
            unlockForFailed
        );
        emit RemoteIssuingFailure(transferId, mappingToken, originalSender, amount, fee);
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
