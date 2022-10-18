// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@zeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "@zeppelin-solidity/contracts/utils/structs/EnumerableSet.sol";
import "@darwinia/contracts-periphery/contracts/s2s/types/PalletHelixBridge.sol";
import "../Backing.sol";
import "../../interfaces/IHelix2ParaMessageEndpoint.sol";

contract NativeParachainBacking is Backing {
    struct LockedInfo {
        address payable sender;
        uint256 amount;
    }
    uint256 public helixFee;
    uint256 public kPrunSize;

    bytes2 public remoteIssuingIndex;
    bytes2 public remoteHandleIssuingForFailureIndex;

    // (nonce => lockedInfo)
    mapping(uint64 => LockedInfo) public lockedMessages;
    EnumerableSet.UintSet acceptedNonces;
    uint64 minReservedLockedMessageNonce;

    event TokenLocked(uint64 nonce, address sender, bytes32 recipient, uint256 amount, uint256 fee);
    event TokenUnlocked(uint64 nonce, address recipient, uint256 amount);
    event RemoteIssuingFailure(uint64 refundNonce, uint64 failureNonce, uint256 fee);
    event TokenUnlockedForFailed(uint64 nonce, address recipient, uint256 amount);

    receive() external payable {}

    // !!! admin must check the nonce of the newEndpoint is larger than the old one
    function setMessageEndpoint(address _messageEndpoint) external onlyAdmin {
        _setMessageEndpoint(_messageEndpoint);
    }

    function setHelixFee(uint256 _helixFee) external onlyAdmin {
        helixFee = _helixFee;
    }

    function currentFee() external view returns(uint256) {
        return IHelix2ParaMessageEndpoint(messageEndpoint).fee() + helixFee;
    }

    // we use message nonce as transferId
    function _sendMessage(
        uint32 remoteSpecVersion,
        uint64 remoteWeight,
        bytes memory message,
        uint256 prepaid
    ) internal nonReentrant returns(uint64, uint256) {
        uint256 bridgeFee = IHelix2ParaMessageEndpoint(messageEndpoint).fee();
        uint256 totalFee = bridgeFee + helixFee;
        require(prepaid >= totalFee, "backing:the fee is not enough");
        if (prepaid > totalFee) {
            // refund fee to msgSender
            payable(msg.sender).transfer(prepaid - totalFee);
        }
        uint64 nonce = IHelix2ParaMessageEndpoint(messageEndpoint).sendMessage{value: bridgeFee}(
            remoteSpecVersion,
            remoteWeight,
            message);
        return (nonce, totalFee);
    }

    /**
     * @notice lock original token and issuing mapping token from bridged chain
     * @dev maybe some tokens will take some fee when transfer
     * @param recipient the recipient who will receive the issued mapping token
     * @param amount amount of the locked token
     */
    function lockAndRemoteIssuing(
        uint32 remoteSpecVersion,
        uint64 remoteWeight,
        bytes32 recipient,
        uint256 amount
    ) external payable whenNotPaused {
        require(msg.value > amount, "Backing: invalid msg.value");
        uint64[] memory prunedNonces = new uint64[](kPrunSize);
        for (uint256 index = 0; index < kPrunSize; index++) {
            prunedNonces[index] = uint64(EnumerableSet.at(acceptedNonces, index));
        }
        PalletHelixBridge.IssueFromRemoteCall memory issueFromRemoteCall = PalletHelixBridge.IssueFromRemoteCall(
            remoteIssuingIndex,
            uint128(amount),
            recipient,
            prunedNonces,
            minReservedLockedMessageNonce
        );
        bytes memory issueMessage = PalletHelixBridge.encodeIssueFromRemoteCall(issueFromRemoteCall);
        (uint64 nonce, uint256 fee) = _sendMessage(remoteSpecVersion, remoteWeight, issueMessage, msg.value - amount);
        lockedMessages[nonce] = LockedInfo(payable(msg.sender), amount);
        emit TokenLocked(nonce, msg.sender, recipient, amount, fee);
    }

    /**
     * @notice this will be called by inboundLane when the remote mapping token burned and want to unlock the original token
     * @param recipient the recipient who will receive the unlocked token
     * @param amount amount of the unlocked token
     * @param prunNonces the prun nonces of the locked message delivered successfully
     * @param minReservedBurnNonce min reserved burn nonce on target chain
     */
    function unlockFromRemote(
        address recipient,
        uint256 amount,
        uint64[] memory prunNonces,
        uint64 minReservedBurnNonce
    ) public onlyMessageEndpoint whenNotPaused {
        uint64 nonce = IHelix2ParaMessageEndpoint(messageEndpoint).currentDeliveredMessageNonce();
        require(EnumerableSet.contains(acceptedNonces, nonce) == false, "Backing:message has been accepted");
        EnumerableSet.add(acceptedNonces, nonce);
        prunMessage(prunNonces, minReservedBurnNonce);
        payable(recipient).transfer(amount);
        emit TokenUnlocked(nonce, recipient, amount);
    }

    function remoteIssuingFailure(
        uint32 remoteSpecVersion,
        uint64 remoteWeight,
        uint64 failureTransferNonce
    ) external payable whenNotPaused {
        // must not exist in successful issue list
        require(EnumerableSet.contains(acceptedNonces, failureTransferNonce) == false, "Backing:success message can't refund for failed");
        bool messageChecked = IHelix2ParaMessageEndpoint(messageEndpoint).isMessageDeliveredByNonce(failureTransferNonce);
        require(messageChecked, "Backing:the message is not checked by message layer");
        uint64[] memory prunedNonces = new uint64[](kPrunSize);
        for (uint256 index = 0; index < kPrunSize; index++) {
            prunedNonces[index] = uint64(EnumerableSet.at(acceptedNonces, index));
        }

        PalletHelixBridge.HandleIssuingFailureFromRemoteCall memory handleIssuingFailureFromRemoteCall = PalletHelixBridge.HandleIssuingFailureFromRemoteCall(
            remoteHandleIssuingForFailureIndex,
            uint64(failureTransferNonce),
            prunedNonces,
            minReservedLockedMessageNonce
        );
        bytes memory message = PalletHelixBridge.encodeHandleIssuingFailureFromRemoteCall(handleIssuingFailureFromRemoteCall);
        (uint64 refundNonce, uint256 fee) = _sendMessage(remoteSpecVersion, remoteWeight, message, msg.value);
        emit RemoteIssuingFailure(refundNonce, failureTransferNonce, fee);
    }

    /**
     * @notice this will be called by messageEndpoint when the remote issue failed and want to unlock the original token
     * @param failureNonce the failure nonce to be unlocked
     * @param prunNonces the prun nonces of the locked message delivered successfully
     * @param minReservedBurnNonce min reserved burn nonce on target chain
     */
    function handleUnlockFailureFromRemote(
        uint64 failureNonce,
        uint64[] memory prunNonces,
        uint64 minReservedBurnNonce
    ) external onlyMessageEndpoint {
        LockedInfo memory lockedMessage = lockedMessages[failureNonce];
        require(lockedMessage.amount > 0 && lockedMessage.sender != address(0), "Backing: the locked message has been refund");
        delete(lockedMessages[failureNonce]);
        lockedMessage.sender.transfer(lockedMessage.amount);
        prunMessage(prunNonces, minReservedBurnNonce);
        emit TokenUnlockedForFailed(failureNonce, lockedMessage.sender, lockedMessage.amount);
    }

    function prunMessage(uint64[] memory prunNonces, uint64 minReservedBurnNonce) internal {
        uint64 minReservedNonce = 0;
        for (uint index = 0; index < prunNonces.length; index++) {
            uint64 nonce = prunNonces[index];
            if (lockedMessages[nonce].amount > 0) {
                delete lockedMessages[nonce];
                minReservedNonce = nonce;
            }
        }
        if (minReservedNonce > 0) {
            minReservedLockedMessageNonce = minReservedNonce + 1;
        }
        uint256 receivedSize = EnumerableSet.length(acceptedNonces);
        for (uint index = 0; index < receivedSize; index++) {
            uint256 receivedNonce = EnumerableSet.at(acceptedNonces, index);
            if (receivedNonce < minReservedBurnNonce) {
                EnumerableSet.remove(acceptedNonces, receivedNonce);
            } else {
                break;
            }
        }
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
        if (token == address(0)) {
            payable(recipient).transfer(amount);
        } else {
            IERC20(token).transfer(recipient, amount);
        }
    }

    function hash(bytes memory value) public pure returns (bytes32) {
        return sha256(value);
    }
}
 
