// SPDX-License-Identifier: MIT
// This is the Issuing Module(Mapping-token-factory) of the ethereum like bridge.
// We trust the inboundLane/outboundLane when we add them to the module.
// It means that each message from the inboundLane is verified correct and truthly from the sourceAccount.
// Only we need is to verify the sourceAccount is expected. And we add it to the Filter.
pragma solidity ^0.8.10;

import "@zeppelin-solidity-4.4.0/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "@zeppelin-solidity-4.4.0/contracts/utils/structs/BitMaps.sol";
import "../MappingTokenFactory.sol";
import "../../interfaces/IBacking.sol";
import "../../interfaces/IERC20.sol";
import "../../interfaces/IGuard.sol";
import "../../interfaces/IHelixApp.sol";
import "../../interfaces/IHelixMessageHandle.sol";
import "../../interfaces/IHelixSub2SubMessageHandle.sol";
import "../../interfaces/IErc20MappingTokenFactory.sol";
import "../../../utils/DailyLimit.sol";

contract Erc20Sub2SubMappingTokenFactory is DailyLimit, IErc20MappingTokenFactory, MappingTokenFactory {
    struct BurnInfo {
        bytes32 hash;
        bool hasRefundForFailed;
    }

    address public constant BLACK_HOLE_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    // guard
    address public guard;
    uint256 public helixFee;

    mapping(uint256 => BurnInfo) burnMessages;
    BitMaps.BitMap issueMessages;

    // tokenType=>Logic
    // tokenType comes from original token, the logic contract is used to create the mapping-token contract
    mapping(uint32 => address) public tokenType2Logic;

    event NewLogicSetted(uint32 tokenType, address addr);
    event IssuingERC20Created(address originalToken, address mappingToken);
    event BurnAndRemoteUnlocked(uint256 messageId, bytes32 messageHash, address sender, address recipient, address token, uint256 amount);
    event TokenRemintForFailed(uint256 messageId, address token, address recipient, uint256 amount);

    function setMessageHandle(address _messageHandle) external onlyAdmin {
        _setMessageHandle(_messageHandle);
    }

    receive() external payable {
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


    function setTokenContractLogic(uint32 tokenType, address logic) external onlyAdmin {
        tokenType2Logic[tokenType] = logic;
        emit NewLogicSetted(tokenType, logic);
    }

    function setHelixFee(uint256 _helixFee) external onlyAdmin {
        helixFee = _helixFee;
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
        require(msg.value >= totalFee, "MappingTokenFactory:the fee is not enough");
        if (msg.value > totalFee) {
            // refund fee to msgSender
            payable(msg.sender).transfer(msg.value - totalFee);
        }
        return IHelixSub2SubMessageHandle(messageHandle).sendMessage{value: bridgeFee}(
            remoteReceiveGasLimit,
            remoteSpecVersion,
            remoteCallWeight,
            remoteBacking,
            message);
    }

    /**
     * @notice create new erc20 mapping contract, this can only be called by inboundLane
     * @param tokenType the original token type
     * @param originalToken the original token address
     * @param name the name of the original erc20 token
     * @param symbol the symbol of the original erc20 token
     * @param decimals the decimals of the original erc20 token
     */
    function newErc20Contract(
        uint32 tokenType,
        address originalToken,
        string memory bridgedChainName,
        string memory name,
        string memory symbol,
        uint8 decimals,
        uint256 dailyLimit
    ) public onlyMessageHandle whenNotPaused returns (address mappingToken) {
        require(tokenType == 0 || tokenType == 1, "MappingTokenFactory:token type cannot mapping to erc20 token");
        bytes32 salt = keccak256(abi.encodePacked(remoteBacking, originalToken));
        require(salt2MappingToken[salt] == address(0), "MappingTokenFactory:contract has been deployed");
        mappingToken = deployErc20Contract(salt, tokenType);
        IMappingToken(mappingToken).initialize(
            string(abi.encodePacked(name, "[", bridgedChainName, ">")),
            string(abi.encodePacked("x", symbol)),
            decimals);

        _addMappingToken(salt, originalToken, mappingToken);
        _changeDailyLimit(mappingToken, dailyLimit);
        emit IssuingERC20Created(originalToken, mappingToken);
    }

    function deployErc20Contract(
        bytes32 salt,
        uint32 tokenType
    ) internal returns(address) {
        bytes memory bytecode = type(TransparentUpgradeableProxy).creationCode;
        bytes memory bytecodeWithInitdata = abi.encodePacked(bytecode, abi.encode(tokenType2Logic[tokenType], address(BLACK_HOLE_ADDRESS), ""));
        return _deploy(salt, bytecodeWithInitdata);
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
    ) public onlyMessageHandle whenNotPaused {
        address mappingToken = getMappingToken(remoteBacking, originalToken);
        require(mappingToken != address(0), "MappingTokenFactory:mapping token has not created");
        require(amount > 0, "MappingTokenFactory:can not receive amount zero");
        expendDailyLimit(mappingToken, amount);
        uint256 messageId = IHelixSub2SubMessageHandle(messageHandle).latestRecvMessageId() + 1;
        BitMaps.set(issueMessages, messageId);
        if (guard != address(0)) {
            IERC20(mappingToken).mint(address(this), amount);
            require(IERC20(mappingToken).approve(guard, amount), "MappingTokenFactory:approve token transfer to guard failed");
            IGuard(guard).deposit(messageId, mappingToken, recipient, amount);
        } else {
            IERC20(mappingToken).mint(recipient, amount);
        }
    }

    /**
     * @notice burn mapping token and unlock remote original token
     * @param mappingToken the burt mapping token address
     * @param recipient the recipient of the remote unlocked token
     * @param amount the amount of the burn and unlock
     */
    function burnAndRemoteUnlock(
        uint256 remoteReceiveGasLimit,
        uint32  remoteSpecVersion,
        uint64  remoteCallWeight,
        address mappingToken,
        address recipient,
        uint256 amount
    ) external payable whenNotPaused {
        require(amount > 0, "MappingTokenFactory:can not transfer amount zero");
        address originalToken = mappingToken2OriginalToken[mappingToken];
        require(originalToken != address(0), "MappingTokenFactory:token is not created by factory");
        // transfer to this and then burn
        require(IERC20(mappingToken).transferFrom(msg.sender, address(this), amount), "MappingTokenFactory:transfer token failed");
        IERC20(mappingToken).burn(address(this), amount);

        bytes memory unlockFromRemote = abi.encodeWithSelector(
            IBacking.unlockFromRemote.selector,
            originalToken,
            recipient,
            amount
        );

        uint256 messageId = _sendMessage(
            remoteReceiveGasLimit,
            remoteSpecVersion,
            remoteCallWeight,
            remoteBacking,
            unlockFromRemote
        );
        require(burnMessages[messageId].hash == bytes32(0), "MappingTokenFactory: message exist");
        bytes32 messageHash = hash(abi.encodePacked(messageId, mappingToken, msg.sender, amount));
        burnMessages[messageId] = BurnInfo(messageHash, false);
        emit BurnAndRemoteUnlocked(messageId, messageHash, msg.sender, recipient, mappingToken, amount);
    }

    /**
     * @notice send a unlock message to backing when issue mapping token faild to redeem original token.
     * @param originalToken the original token address
     * @param originalSender the originalSender of the remote unlocked token, must be the same as msg.send of the failed message.
     * @param amount the amount of the failed issue token.
     */
    function withdrawFailedTransfer(
        uint256 remoteReceiveGasLimit,
        uint32  remoteSpecVersion,
        uint64  remoteCallWeight,
        uint256 messageId,
        address originalToken,
        address originalSender,
        uint256 amount
    ) external payable whenNotPaused {
        // must not exist in successful issue list
        require(BitMaps.get(issueMessages, messageId) == false, "MappingTokenFactory:success message can't refund for failed");
        // must has been checked by message layer
        uint256 latestRecvMessageId = IHelixSub2SubMessageHandle(messageHandle).latestRecvMessageId();
        require(messageId <= latestRecvMessageId, "MappingTokenFactory:the message is not checked by message layer");
        bytes memory unlockForFailed = abi.encodeWithSelector(
            IHelixAppSupportWithdrawFailed.handleWithdrawFailedTransfer.selector,
            messageId,
            originalToken,
            originalSender,
            amount
        );
        _sendMessage(
            remoteReceiveGasLimit,
            remoteSpecVersion,
            remoteCallWeight,
            remoteBacking,
            unlockForFailed
        );
    }

    /**
     * @notice this will be called by messageHandle when the remote backing unlock failed and want to unlock the mapping token
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
        BurnInfo memory burnInfo = burnMessages[messageId];
        require(burnInfo.hasRefundForFailed == false, "Backing:the burn message has been refund");
        bytes32 messageHash = hash(abi.encodePacked(messageId, token, origin_sender, amount));
        require(burnInfo.hash == messageHash, "Backing:message is not matched");
        burnMessages[messageId].hasRefundForFailed = true;
        // remint token
        IERC20(token).mint(origin_sender, amount);
        emit TokenRemintForFailed(messageId, token, origin_sender, amount);
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

    function withdrawFee(
        address payable recipient,
        uint256 amount
    ) external onlyAdmin {
        recipient.transfer(amount);
    }
}

