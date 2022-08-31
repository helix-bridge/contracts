// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@zeppelin-solidity-4.4.0/contracts/utils/math/SafeMath.sol";
import "@zeppelin-solidity-4.4.0/contracts/utils/structs/BitMaps.sol";
import "../Backing.sol";
import "../../interfaces/IBacking.sol";
import "../../interfaces/IERC20.sol";
import "../../interfaces/IGuard.sol";
import "../../interfaces/IHelixApp.sol";
import "../../interfaces/IHelixSub2EthMessageEndpoint.sol";
import "../../interfaces/IErc20MappingTokenFactory.sol";
import "../../../utils/DailyLimit.sol";

contract Erc20Sub2EthBacking is Backing, DailyLimit, IBacking {
    using SafeMath for uint256;
    struct LockedInfo {
        bytes32 hash;
        bool hasRefundForFailed;
    }
    address public guard;
    string public chainName;
    uint256 public lastUnlockedTransferId;

    uint256 public helixFee;

    // (transferId => lockedInfo)
    mapping(uint256 => LockedInfo) public lockedMessages;
    BitMaps.BitMap unlockedTransferIds;

    event TokenLocked(uint256 transferId, address token, address sender, address recipient, uint256 amount, uint256 fee);
    event TokenUnlocked(uint256 transferId, address token, address recipient, uint256 amount);
    event RemoteIssuingFailure(uint256 transferId, address mappingToken, address originalSender, uint256 amount, uint256 fee);
    event TokenUnlockedForFailed(uint256 transferId, address token, address recipient, uint256 amount);

    receive() external payable {
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

    // we use messageId as transferId directly here
    function _sendMessage(bytes memory message) internal nonReentrant returns(uint256, uint256) {
        uint256 bridgeFee = IHelixSub2EthMessageEndpoint(messageEndpoint).fee();
        uint256 totalFee = bridgeFee + helixFee;
        require(msg.value >= totalFee, "backing:the fee is not enough");
        if (msg.value > totalFee) {
            // refund fee to msgSender
            payable(msg.sender).transfer(msg.value - totalFee);
        }
        uint256 transferId = IHelixSub2EthMessageEndpoint(messageEndpoint).sendMessage{value: bridgeFee}(
            remoteMappingTokenFactory,
            message);
        return (transferId, totalFee);
    }

    /**
     * @notice lock original token and issuing mapping token from bridged chain
     * @dev maybe some tokens will take some fee when transfer
     * @param token the original token address
     * @param recipient the recipient who will receive the issued mapping token
     * @param amount amount of the locked token
     */
    function lockAndRemoteIssuing(
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
        (uint256 transferId, uint256 fee) = _sendMessage(issueMappingToken);
        bytes32 lockMessageHash = hash(abi.encodePacked(transferId, token, msg.sender, amount));
        lockedMessages[transferId] = LockedInfo(lockMessageHash, false);
        emit TokenLocked(transferId, token, msg.sender, recipient, amount, fee);
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
        uint256 transferId = IHelixSub2EthMessageEndpoint(messageEndpoint).lastDeliveredMessageId() + 1;
        require(BitMaps.get(unlockedTransferIds, transferId) == false, "Backing:message has been accepted");
        // save transferId to generate refund proof
        BitMaps.set(unlockedTransferIds, transferId);
        if (guard != address(0)) {
            require(IERC20(token).approve(guard, amount), "Backing:approve token transfer to guard failed");
            IGuard(guard).deposit(transferId, token, recipient, amount);
        } else {
            require(IERC20(token).transfer(recipient, amount), "Backing:unlock transfer failed");
        }
        emit TokenUnlocked(transferId, token, recipient, amount);
    }

    function remoteIssuingFailure(
        uint256 transferId,
        address mappingToken,
        address originalSender,
        uint256 amount
    ) external payable whenNotPaused {
        // must not exist in successful issue list
        require(BitMaps.get(unlockedTransferIds, transferId) == false, "Backing:success message can't refund for failed");
        bool messageChecked = IHelixSub2EthMessageEndpoint(messageEndpoint).isMessageDelivered(transferId);
        require(messageChecked, "Backing:the message is not checked by message layer");
        bytes memory unlockForFailed = abi.encodeWithSelector(
            IHelixAppSupportWithdrawFailed.handleIssuingFailureFromRemote.selector,
            transferId,
            mappingToken,
            originalSender,
            amount
        );
        (, uint256 fee) = _sendMessage(unlockForFailed);
        emit RemoteIssuingFailure(transferId, mappingToken, originalSender, amount, fee);
    }

    /**
     * @notice this will be called by messageEndpoint when the remote issue failed and want to unlock the original token
     * @param token the original token address
     * @param originSender the origin sender who will receive the unlocked token
     * @param amount amount of the unlocked token
     */
    function handleUnlockFailureFromRemote(
        uint256 transferId,
        address token,
        address originSender,
        uint256 amount
    ) external onlyMessageEndpoint whenNotPaused {
        LockedInfo memory lockedMessage = lockedMessages[transferId];
        require(lockedMessage.hasRefundForFailed == false, "Backing: the locked message has been refund");
        bytes32 messageHash = hash(abi.encodePacked(transferId, token, originSender, amount));
        require(lockedMessage.hash == messageHash, "Backing: message is not matched");
        lockedMessages[transferId].hasRefundForFailed = true;
        // send token
        require(IERC20(token).transfer(originSender, amount), "Backing:unlock transfer failed");
        emit TokenUnlockedForFailed(transferId, token, originSender, amount);
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


    function hash(bytes memory value) public pure returns (bytes32) {
        return sha256(value);
    }
}
 
