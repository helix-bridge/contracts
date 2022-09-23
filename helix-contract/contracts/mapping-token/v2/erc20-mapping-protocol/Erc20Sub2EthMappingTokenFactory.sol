// SPDX-License-Identifier: MIT
// This is the Issuing Module(Mapping-token-factory) of the ethereum like bridge.
// We trust the inboundLane/outboundLane when we add them to the module.
// It means that each message from the inboundLane is verified correct and truthly from the sourceAccount.
// Only we need is to verify the sourceAccount is expected. And we add it to the Filter.
pragma solidity ^0.8.10;

import "@zeppelin-solidity-4.4.0/contracts/utils/structs/BitMaps.sol";
import "./Erc20.sol";
import "../MappingTokenFactory.sol";
import "../../interfaces/IBacking.sol";
import "../../interfaces/IGuard.sol";
import "../../interfaces/IHelixApp.sol";
import "../../interfaces/IHelixMessageEndpoint.sol";
import "../../interfaces/IHelixSub2EthMessageEndpoint.sol";
import "../../interfaces/IMessageCommitment.sol";
import "../../../utils/DailyLimit.sol";

contract Erc20Sub2EthMappingTokenFactory is DailyLimit, MappingTokenFactory {
    struct BurnInfo {
        bytes32 hash;
        bool hasRefundForFailed;
    }
    // guard
    address public guard;
    uint256 public helixFee;
    address xwToken;

    mapping(uint256 => BurnInfo) burnMessages;
    BitMaps.BitMap issueMessages;

    event IssuingERC20Created(address originalToken, address mappingToken);
    event BurnAndRemoteUnlocked(uint256 transferId, bool isNative, address sender, address recipient, address token, uint256 amount, uint256 fee);
    event TokenRemintForFailed(uint256 transferId, address token, address recipient, uint256 amount);
    event RemoteUnlockFailure(uint256 transferId, address originalToken, address originalSender, uint256 amount, uint256 fee);

    modifier verifyRemoteUnlockFailure(uint256 transferId) {
        // must not exist in successful issue list
        require(BitMaps.get(issueMessages, transferId) == false, "MappingTokenFactory:success message can't refund for failed");
        // must has been checked by message layer
        bool messageChecked = IHelixSub2EthMessageEndpoint(messageEndpoint).isMessageDelivered(transferId);
        require(messageChecked, "MappingTokenFactory:the message is not checked by message layer");
        _;
    }

    /**
     * @notice only admin can transfer the ownership of the mapping token from factory to other account
     * generally we should not do this. When we encounter a non-recoverable error, we temporarily transfer the privileges to a maintenance account.
     * @param mappingToken the address the mapping token
     * @param new_owner the new owner of the mapping token
     */
    function transferMappingTokenOwnership(address mappingToken, address new_owner) external onlyAdmin {
        _transferMappingTokenOwnership(mappingToken, new_owner);
    }

    function updateGuard(address newGuard) external onlyAdmin {
        guard = newGuard;
    }

    function changeDailyLimit(address mappingToken, uint amount) public onlyAdmin  {
        _changeDailyLimit(mappingToken, amount);
    }

    // !!! admin must check the nonce of the newEndpoint is larger than the old one
    function setMessageEndpoint(address _messageEndpoint) external onlyAdmin {
        _setMessageEndpoint(_messageEndpoint);
    }

    function setMappingNativeWrappedToken(address _xwToken) external onlyAdmin {
        xwToken = _xwToken;
    }

    function currentFee() external view returns(uint256) {
        return IHelixSub2EthMessageEndpoint(messageEndpoint).fee() + helixFee;
    }

    function _sendMessage(bytes memory message) internal nonReentrant returns(uint256, uint256) {
        uint256 bridgeFee = IHelixSub2EthMessageEndpoint(messageEndpoint).fee();
        uint256 totalFee = bridgeFee + helixFee;
        require(msg.value >= totalFee, "MappingTokenFactory:the fee is not enough");
        if (msg.value > totalFee) {
            payable(msg.sender).transfer(msg.value - totalFee);
        }
        uint256 transferId = IHelixSub2EthMessageEndpoint(messageEndpoint).sendMessage{value: bridgeFee}(
            remoteBacking,
            message);
        return (transferId, totalFee);
    }

    /**
     * @notice create new erc20 mapping contract, this can only be called by operator
     * @param originalToken the original token address
     * @param name the name of the original erc20 token
     * @param symbol the symbol of the original erc20 token
     * @param decimals the decimals of the original erc20 token
     */
    function register(
        address originalToken,
        string memory bridgedChainName,
        string memory name,
        string memory symbol,
        uint8 decimals,
        uint256 dailyLimit
    ) public onlyOperator whenNotPaused returns (address mappingToken) {
        bytes32 salt = keccak256(abi.encodePacked(remoteBacking, originalToken));
        require(salt2MappingToken[salt] == address(0), "MappingTokenFactory:contract has been deployed");
        bytes memory bytecode = type(Erc20).creationCode;
        bytes memory bytecodeWithInitdata = abi.encodePacked(
            bytecode,
            abi.encode(
                string(abi.encodePacked(name, "[", bridgedChainName, ">")),
                string(abi.encodePacked("x", symbol)),
                decimals
            ));
        mappingToken = _deploy(salt, bytecodeWithInitdata);
        _addMappingToken(salt, originalToken, mappingToken);
        _changeDailyLimit(mappingToken, dailyLimit);
        emit IssuingERC20Created(originalToken, mappingToken);
    }

    /**
     * @notice set erc20 mapping contract directly, this can be only called by admin
     * @param originalToken the original token address
     * @param mappingToken the mapping token address of the original erc20 token
     * @param dailyLimit the daily limit of the mapping erc20 token
     */
    function setMappingToken(
        address originalToken,
        address mappingToken,
        uint256 dailyLimit
    ) public onlyAdmin {
        bytes32 salt = keccak256(abi.encodePacked(remoteBacking, originalToken));
        require(salt2MappingToken[salt] == address(0), "MappingTokenFactory:contract has been deployed");
        _addMappingToken(salt, originalToken, mappingToken);
        _changeDailyLimit(mappingToken, dailyLimit);
        emit IssuingERC20Created(originalToken, mappingToken);
    }

    /**
     * @notice issue mapping token, only can be called by inboundLane
     * @param originalToken the original token address
     * @param recipient the recipient of the issued mapping token
     * @param amount the amount of the issued mapping token
     */
    function issueMappingToken(
        address originalToken,
        address recipient,
        uint256 amount
    ) public onlyMessageEndpoint whenNotPaused {
        address mappingToken = getMappingToken(remoteBacking, originalToken);
        require(mappingToken != address(0), "MappingTokenFactory:mapping token has not created");
        require(amount > 0, "MappingTokenFactory:can not receive amount zero");
        uint256 transferId = IHelixSub2EthMessageEndpoint(messageEndpoint).currentDeliveredMessageId();
        require(BitMaps.get(issueMessages, transferId) == false, "MappingTokenFactory:message has been accepted");
        BitMaps.set(issueMessages, transferId);
        if (guard != address(0)) {
            Erc20(mappingToken).mint(address(this), amount);
            require(Erc20(mappingToken).increaseAllowance(guard, amount), "Backing:approve token transfer to guard failed");
            IGuard(guard).deposit(transferId, mappingToken, recipient, amount);
        } else {
            expendDailyLimit(mappingToken, amount);
            Erc20(mappingToken).mint(recipient, amount);
        }
    }

    function _burnAndRemoteUnlock(
        address mappingToken,
        address recipient,
        uint256 amount,
        bytes memory remoteUnlockCall,
        bool isNative
    ) internal whenNotPaused {
        require(amount > 0, "MappingTokenFactory:can not transfer amount zero");
        // transfer to this and then burn
        require(IERC20(mappingToken).transferFrom(msg.sender, address(this), amount), "MappingTokenFactory:transfer token failed");
        Erc20(mappingToken).burn(address(this), amount);
        (uint256 transferId, uint256 fee) = _sendMessage(remoteUnlockCall);
        require(burnMessages[transferId].hash == bytes32(0), "MappingTokenFactory: message exist");
        bytes32 messageHash = hash(abi.encodePacked(transferId, mappingToken, msg.sender, amount));
        burnMessages[transferId] = BurnInfo(messageHash, false);
        emit BurnAndRemoteUnlocked(transferId, isNative, msg.sender, recipient, mappingToken, amount, fee);
    }

    /**
     * @notice burn mapping token and unlock remote original native token
     * @param recipient the recipient of the remote unlocked token
     * @param amount the amount of the burn and unlock
     */
    function burnAndRemoteUnlockNative(
        address recipient,
        uint256 amount
    ) external payable {
        require(amount > 0, "MappingTokenFactory:can not transfer amount zero");
        address originalToken = mappingToken2OriginalToken[xwToken];
        require(originalToken != address(0), "MappingTokenFactory:token is not created by factory");
        bytes memory unlockFromRemoteNative = abi.encodeWithSelector(
            IBackingSupportNative.unlockFromRemoteNative.selector,
            recipient,
            amount
        );

        _burnAndRemoteUnlock(xwToken, recipient, amount, unlockFromRemoteNative, true);
    }

    /**
     * @notice burn mapping token and unlock remote original token
     * @param mappingToken the burt mapping token address
     * @param recipient the recipient of the remote unlocked token
     * @param amount the amount of the burn and unlock
     */
    function burnAndRemoteUnlock(
        address mappingToken,
        address recipient,
        uint256 amount
    ) external payable {
        require(amount > 0, "MappingTokenFactory:can not transfer amount zero");
        address originalToken = mappingToken2OriginalToken[mappingToken];
        require(originalToken != address(0), "MappingTokenFactory:token is not created by factory");
        bytes memory unlockFromRemote = abi.encodeWithSelector(
            IBacking.unlockFromRemote.selector,
            originalToken,
            recipient,
            amount
        );

        _burnAndRemoteUnlock(mappingToken, recipient, amount, unlockFromRemote, false);
    }

    /**
     * @notice send a unlock message to backing when issue mapping token faild to redeem original token.
     * @param originalToken the original token address
     * @param originalSender the originalSender of the remote unlocked token, must be the same as msg.send of the failed message.
     * @param amount the amount of the failed issue token.
     */
    function remoteUnlockFailure(
        uint256 transferId,
        address originalToken,
        address originalSender,
        uint256 amount
    ) external payable verifyRemoteUnlockFailure(transferId) whenNotPaused {
        bytes memory handleUnlockForFailed = abi.encodeWithSelector(
            IHelixAppSupportWithdrawFailed.handleUnlockFailureFromRemote.selector,
            transferId,
            originalToken,
            originalSender,
            amount
        );
        (, uint256 fee) = _sendMessage(handleUnlockForFailed);
        emit RemoteUnlockFailure(transferId, originalToken, originalSender, amount, fee);
    }

    /**
     * @notice send a unlock message to backing when issue mapping token faild to redeem original token.
     * @param originalSender the originalSender of the remote unlocked token, must be the same as msg.send of the failed message.
     * @param amount the amount of the failed issue token.
     */
    function remoteUnlockFailureNative(
        uint256 transferId,
        address originalSender,
        uint256 amount
    ) external payable verifyRemoteUnlockFailure(transferId) whenNotPaused {
        bytes memory handleUnlockForFailedNative = abi.encodeWithSelector(
            IHelixAppSupportWithdrawFailed.handleUnlockFailureFromRemoteNative.selector,
            transferId,
            originalSender,
            amount
        );
        (, uint256 fee) = _sendMessage(handleUnlockForFailedNative);
        emit RemoteUnlockFailure(transferId, xwToken, originalSender, amount, fee);
    }

    /**
     * @notice this will be called by messageEndpoint when the remote backing unlock failed and want to unlock the mapping token
     * @param token the original token address
     * @param origin_sender the origin_sender who will receive the unlocked token
     * @param amount amount of the unlocked token
     */
    function handleIssuingFailureFromRemote(
        uint256 transferId,
        address token,
        address origin_sender,
        uint256 amount
    ) external onlyMessageEndpoint whenNotPaused {
        BurnInfo memory burnInfo = burnMessages[transferId];
        require(burnInfo.hasRefundForFailed == false, "Backing:the burn message has been refund");
        bytes32 messageHash = hash(abi.encodePacked(transferId, token, origin_sender, amount));
        require(burnInfo.hash == messageHash, "Backing:message is not matched");
        burnMessages[transferId].hasRefundForFailed = true;
        Erc20(token).mint(origin_sender, amount);
        emit TokenRemintForFailed(transferId, token, origin_sender, amount);
    }

    function hash(bytes memory value) public pure returns (bytes32) {
        return sha256(value);
    }

    function rescueFunds(
        address token,
        address recipient,
        uint256 amount
    ) external onlyAdmin {
        IERC20(token).transfer(recipient, amount);
    }
}

