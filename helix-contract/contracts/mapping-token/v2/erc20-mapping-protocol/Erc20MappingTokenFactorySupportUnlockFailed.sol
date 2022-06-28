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
import "../../interfaces/IHelixMessageHandleSupportUnlockFailed.sol";
import "../../interfaces/IErc20MappingTokenFactory.sol";
import "../../../utils/DailyLimit.sol";
import "../../../utils/IncreaseMerkleTree.sol";

contract Erc20MappingTokenFactorySupportUnlockFailed is DailyLimit, IErc20MappingTokenFactory, MappingTokenFactory, IncreaseMerkleTree {
    address public constant BLACK_HOLE_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    // guard
    address public guard;
    BitMaps.BitMap issueMessages;
    BitMaps.BitMap unlockForFailedRemoteUnlockMapping;

    // tokenType=>Logic
    // tokenType comes from original token, the logic contract is used to create the mapping-token contract
    mapping(uint32 => address) public tokenType2Logic;

    event NewLogicSetted(uint32 tokenType, address addr);
    event IssuingERC20Created(address originalToken, address mappingToken);
    event BurnAndRemoteUnlocked(uint256 messageId, bytes32 messageHash, address sender, address recipient, address token, uint256 amount);
    event TokenRemintForFailed(address token, address recipient, uint256 amount);

    function setMessageHandle(address _messageHandle) external onlyAdmin {
        _setMessageHandle(_messageHandle);
    }

    receive() external payable {
    }

    function initStorage() external onlyAdmin {
        initTree();
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

    function indexHasBeenUnlocked(uint64 index) public view returns(bool) {
        return BitMaps.get(unlockForFailedRemoteUnlockMapping, index);
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
        uint8 decimals
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
        uint256 messageId = IHelixMessageHandleSupportUnlockFailed(messageHandle).latestRecvMessageId();
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
            address(this),
            originalToken,
            recipient,
            amount
        );

        uint256 messageId = IHelixMessageHandle(messageHandle).sendMessage{value: msg.value}(remoteBacking, unlockFromRemote);
        bytes32 messageHash = hash(abi.encodePacked(mappingToken, msg.sender, amount));
        append(messageHash);
        emit BurnAndRemoteUnlocked(messageId, messageHash, msg.sender, recipient, mappingToken, amount);
    }

    /**
     * @notice send a unlock message to backing when issue mapping token faild to redeem original token.
     * @param originalToken the original token address
     * @param originalSender the originalSender of the remote unlocked token, must be the same as msg.send of the failed message.
     * @param amount the amount of the failed issue token.
     * @param proof the merkle proof for the failed message on source backing
     * @param index the index of the failed message at the increased merkle tree on source backing
     */
    function handleFailedRemoteOperation(
        uint256 messageId,
        address originalToken,
        address originalSender,
        uint256 amount,
        bytes32[] memory proof,
        uint64 index
    ) external payable whenNotPaused {
        // must not exist in successful issue list
        require(BitMaps.get(issueMessages, messageId) == false, "MappingTokenFactory:the message is already success");
        // must has been checked by message layer
        uint256 latestRecvMessageId = IHelixMessageHandleSupportUnlockFailed(messageHandle).latestRecvMessageId();
        require(messageId <= latestRecvMessageId, "MappingTokenFactory:the message is not checked by message layer");
        bytes memory unlockForFailed = abi.encodeWithSelector(
            IHelixAppSupportUnlockFailed.unlockForFailedRemoteOperation.selector,
            originalToken,
            originalSender,
            amount,
            proof,
            index
        );
        IHelixMessageHandle(messageHandle).sendMessage{value: msg.value}(remoteBacking, unlockForFailed);
    }

    /**
     * @notice this will be called by messageHandle when the remote backing unlock failed and want to unlock the mapping token
     * @param token the original token address
     * @param origin_sender the origin_sender who will receive the unlocked token
     * @param amount amount of the unlocked token
     * @param proof the proof of the existence of the locked info
     * @param index the index of the locked info in the increase merkle proof
     */
    function unlockForFailedRemoteOperation(
        address token,
        address origin_sender,
        uint256 amount,
        bytes32[] memory proof,
        uint64 index
    ) external onlyMessageHandle whenNotPaused {
        require(indexHasBeenUnlocked(index) == false, "MappingTokenFactory:token has been unlocked");
        bytes32 leaf = hash(abi.encodePacked(token, origin_sender, amount));
        bool isValid = verifyProof(leaf, proof, index);
        require(isValid, "MappingTokenFactory:verify message proof failed");
        BitMaps.set(unlockForFailedRemoteUnlockMapping, index);
        // remint token
        IERC20(token).mint(origin_sender, amount);
        emit TokenRemintForFailed(token, origin_sender, amount);
    }
}
