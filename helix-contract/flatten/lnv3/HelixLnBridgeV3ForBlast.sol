// SPDX-License-Identifier: MIT

/**
 * .----------------.  .----------------.  .----------------.  .----------------.  .----------------. 
 * | .--------------. || .--------------. || .--------------. || .--------------. || .--------------. |
 * | |  ____  ____  | || |  _________   | || |   _____      | || |     _____    | || |  ____  ____  | |
 * | | |_   ||   _| | || | |_   ___  |  | || |  |_   _|     | || |    |_   _|   | || | |_  _||_  _| | |
 * | |   | |__| |   | || |   | |_  \_|  | || |    | |       | || |      | |     | || |   \ \  / /   | |
 * | |   |  __  |   | || |   |  _|  _   | || |    | |   _   | || |      | |     | || |    > `' <    | |
 * | |  _| |  | |_  | || |  _| |___/ |  | || |   _| |__/ |  | || |     _| |_    | || |  _/ /'`\ \_  | |
 * | | |____||____| | || | |_________|  | || |  |________|  | || |    |_____|   | || | |____||____| | |
 * | |              | || |              | || |              | || |              | || |              | |
 * | '--------------' || '--------------' || '--------------' || '--------------' || '--------------' |
 *  '----------------'  '----------------'  '----------------'  '----------------'  '----------------' '
 * 
 *
 * 3/6/2024
 **/

pragma solidity ^0.8.17;

// File contracts/interfaces/IMessager.sol
// License-Identifier: MIT

interface ILowLevelMessageSender {
    function registerRemoteReceiver(uint256 remoteChainId, address remoteBridge) external;
    function sendMessage(uint256 remoteChainId, bytes memory message, bytes memory params) external payable;
}

interface ILowLevelMessageReceiver {
    function registerRemoteSender(uint256 remoteChainId, address remoteBridge) external;
    function recvMessage(address remoteSender, address localReceiver, bytes memory payload) external;
}

// File contracts/utils/AccessController.sol
// License-Identifier: MIT

/// @title AccessController
/// @notice AccessController is a contract to control the access permission 
/// @dev See https://github.com/helix-bridge/contracts/tree/master/helix-contract
contract AccessController {
    address public dao;
    address public operator;
    address public pendingDao;

    modifier onlyDao() {
        require(msg.sender == dao, "!dao");
        _;
    }

    modifier onlyOperator() {
        require(msg.sender == operator, "!operator");
        _;
    }

    function _initialize(address _dao) internal {
        dao = _dao;
        operator = _dao;
    }

    function setOperator(address _operator) onlyDao external {
        operator = _operator;
    }

    function transferOwnership(address _dao) onlyDao external {
        pendingDao = _dao;
    }

    function acceptOwnership() external {
        address newDao = msg.sender;
        require(pendingDao == newDao, "!pendingDao");
        delete pendingDao;
        dao = newDao;
    }
}

// File @zeppelin-solidity/contracts/token/ERC20/IERC20.sol@v4.7.3
// License-Identifier: MIT
// OpenZeppelin Contracts (last updated v4.6.0) (token/ERC20/IERC20.sol)


/**
 * @dev Interface of the ERC20 standard as defined in the EIP.
 */
interface IERC20 {
    /**
     * @dev Emitted when `value` tokens are moved from one account (`from`) to
     * another (`to`).
     *
     * Note that `value` may be zero.
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @dev Emitted when the allowance of a `spender` for an `owner` is set by
     * a call to {approve}. `value` is the new allowance.
     */
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /**
     * @dev Returns the amount of tokens in existence.
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns the amount of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev Moves `amount` tokens from the caller's account to `to`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address to, uint256 amount) external returns (bool);

    /**
     * @dev Returns the remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}. This is
     * zero by default.
     *
     * This value changes when {approve} or {transferFrom} are called.
     */
    function allowance(address owner, address spender) external view returns (uint256);

    /**
     * @dev Sets `amount` as the allowance of `spender` over the caller's tokens.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * IMPORTANT: Beware that changing an allowance with this method brings the risk
     * that someone may use both the old and the new allowance by unfortunate
     * transaction ordering. One possible solution to mitigate this race
     * condition is to first reduce the spender's allowance to 0 and set the
     * desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     *
     * Emits an {Approval} event.
     */
    function approve(address spender, uint256 amount) external returns (bool);

    /**
     * @dev Moves `amount` tokens from `from` to `to` using the
     * allowance mechanism. `amount` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool);
}

// File contracts/utils/TokenTransferHelper.sol
// License-Identifier: MIT

library TokenTransferHelper {
    function safeTransfer(
        address token,
        address receiver,
        uint256 amount
    ) internal {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(
            IERC20.transfer.selector,
            receiver,
            amount
        ));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "helix:transfer token failed");
    }

    function safeTransferFrom(
        address token,
        address sender,
        address receiver,
        uint256 amount
    ) internal {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(
            IERC20.transferFrom.selector,
            sender,
            receiver,
            amount
        ));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "helix:transferFrom token failed");
    }

    function safeTransferNative(
        address receiver,
        uint256 amount
    ) internal {
        (bool success,) = payable(receiver).call{value: amount}("");
        require(success, "helix:transfer native token failed");
    }

    function tryTransferNative(
        address receiver,
        uint256 amount
    ) internal returns(bool) {
        (bool success,) = payable(receiver).call{value: amount}("");
        return success;
    }
}

// File @zeppelin-solidity/contracts/utils/Context.sol@v4.7.3
// License-Identifier: MIT
// OpenZeppelin Contracts v4.4.1 (utils/Context.sol)


/**
 * @dev Provides information about the current execution context, including the
 * sender of the transaction and its data. While these are generally available
 * via msg.sender and msg.data, they should not be accessed in such a direct
 * manner, since when dealing with meta-transactions the account sending and
 * paying for execution may not be the actual sender (as far as an application
 * is concerned).
 *
 * This contract is only required for intermediate, library-like contracts.
 */
abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        return msg.data;
    }
}

// File @zeppelin-solidity/contracts/security/Pausable.sol@v4.7.3
// License-Identifier: MIT
// OpenZeppelin Contracts (last updated v4.7.0) (security/Pausable.sol)


/**
 * @dev Contract module which allows children to implement an emergency stop
 * mechanism that can be triggered by an authorized account.
 *
 * This module is used through inheritance. It will make available the
 * modifiers `whenNotPaused` and `whenPaused`, which can be applied to
 * the functions of your contract. Note that they will not be pausable by
 * simply including this module, only once the modifiers are put in place.
 */
abstract contract Pausable is Context {
    /**
     * @dev Emitted when the pause is triggered by `account`.
     */
    event Paused(address account);

    /**
     * @dev Emitted when the pause is lifted by `account`.
     */
    event Unpaused(address account);

    bool private _paused;

    /**
     * @dev Initializes the contract in unpaused state.
     */
    constructor() {
        _paused = false;
    }

    /**
     * @dev Modifier to make a function callable only when the contract is not paused.
     *
     * Requirements:
     *
     * - The contract must not be paused.
     */
    modifier whenNotPaused() {
        _requireNotPaused();
        _;
    }

    /**
     * @dev Modifier to make a function callable only when the contract is paused.
     *
     * Requirements:
     *
     * - The contract must be paused.
     */
    modifier whenPaused() {
        _requirePaused();
        _;
    }

    /**
     * @dev Returns true if the contract is paused, and false otherwise.
     */
    function paused() public view virtual returns (bool) {
        return _paused;
    }

    /**
     * @dev Throws if the contract is paused.
     */
    function _requireNotPaused() internal view virtual {
        require(!paused(), "Pausable: paused");
    }

    /**
     * @dev Throws if the contract is not paused.
     */
    function _requirePaused() internal view virtual {
        require(paused(), "Pausable: not paused");
    }

    /**
     * @dev Triggers stopped state.
     *
     * Requirements:
     *
     * - The contract must not be paused.
     */
    function _pause() internal virtual whenNotPaused {
        _paused = true;
        emit Paused(_msgSender());
    }

    /**
     * @dev Returns to normal state.
     *
     * Requirements:
     *
     * - The contract must be paused.
     */
    function _unpause() internal virtual whenPaused {
        _paused = false;
        emit Unpaused(_msgSender());
    }
}

// File contracts/ln/base/LnBridgeSourceV3.sol
// License-Identifier: MIT



/// @title LnBridgeSourceV3
/// @notice LnBridgeSourceV3 is a contract to help user lock token and then trigger remote chain relay
/// @dev See https://github.com/helix-bridge/contracts/tree/master/helix-contract
contract LnBridgeSourceV3 is Pausable, AccessController {
    uint256 constant public LOCK_TIME_DISTANCE = 15 minutes;
    uint256 constant public MAX_TRANSFER_AMOUNT = type(uint112).max;
    // liquidity fee base rate
    // liquidityFee = liquidityFeeRate / LIQUIDITY_FEE_RATE_BASE * sendAmount
    // totalProviderFee = baseFee + liquidityFee
    uint256 constant public LIQUIDITY_FEE_RATE_BASE = 100000;
    uint8 constant public LOCK_STATUS_LOCKED = 1;
    uint8 constant public LOCK_STATUS_WITHDRAWN = 2;
    uint8 constant public LOCK_STATUS_SLASHED = 3;
    // the configure information can be updated
    struct TokenConfigure {
        // pay to system for each tx
        uint112 protocolFee;
        // Used to penalise relayer for each slashed transaction
        uint112 penalty;
        uint8 sourceDecimals;
        uint8 targetDecimals;
    }
    // registered token info
    struct TokenInfo {
        TokenConfigure config;
        // zero index is invalid
        // use this index to indict the token info to save gas
        uint32 index;
        address sourceToken;
        address targetToken;
        // accumulated system revenues
        uint256 protocolFeeIncome;
    }
    struct TransferParams {
        uint256 remoteChainId;
        address provider;
        address sourceToken;
        address targetToken;
        uint112 totalFee;
        uint112 amount;
        address receiver;
        // use this timestamp as the lock time
        // can't be too far from the block that the transaction confirmed
        // This timestamp can also be adjusted to produce different transferId
        uint256 timestamp;
    }
    // hash(remoteChainId, sourceToken, targetToken) => TokenInfo
    mapping(bytes32=>TokenInfo) public tokenInfos;
    // the token index is used to be stored in lockInfo to save gas
    mapping(uint32=>bytes32) public tokenIndexer;
    // amountWithFeeAndPenalty = transferAmount + providerFee + penalty < type(uint112).max
    // the status only has the following 4 values
    // status == 0: lockInfo not exist -> can update to status 1
    // status == 1: lockInfo confirmed on source chain(has not been withdrawn or slashed) -> can update to status 2 or 3
    // status == 2: lockInfo has been withdrawn -> can't update anymore
    // status == 3: lockInfo has been slashed -> can't update anymore
    // we don't clean lockInfo after withdraw or slash to avoid the hash collision(generate the same transferId)
    // when we wan't to get tokenInfo from lockInfo, we should get the key(bytes32) from tokenIndex, then get tokenInfo from key
    struct LockInfo {
        uint112 amountWithFeeAndPenalty;
        uint32 tokenIndex;
        uint8 status;
    }
    // transferId => LockInfo
    mapping(bytes32 => LockInfo) public lockInfos;

    struct SourceProviderInfo {
        uint112 baseFee;
        uint16 liquidityFeeRate;
        uint112 transferLimit;
        bool pause;
    }

    // hash(remoteChainId, provider, sourceToken, targetToken) => SourceProviderInfo
    mapping(bytes32=>SourceProviderInfo) public srcProviders;
    // for a special source token, all the path start from this chain use the same panaltyReserve
    // 1. when a lock tx sent, the penaltyReserves decrease and the penalty move to lockInfo.amountWithFeeAndPenalty
    // 2. when withdraw liquidity, it tries to move this penalty lockInfo.amountWithFeeAndPenalty back to penaltyReserves
    // 3. when the penaltyReserves is not enough to support one lock tx, the provider is paused to work
    // hash(sourceToken, provider) => penalty reserve
    mapping(bytes32=>uint256) public penaltyReserves;

    event TokenRegistered(
        bytes32 key,
        uint256 remoteChainId,
        address sourceToken,
        address targetToken,
        uint112 protocolFee,
        uint112 penalty,
        uint32 index
    );
    event TokenInfoUpdated(bytes32 tokenInfoKey, uint112 protocolFee, uint112 penalty, uint112 sourceDecimals, uint112 targetDecimals);
    event FeeIncomeClaimed(bytes32 tokenInfoKey, uint256 amount, address receiver);
    event TokenLocked(
        TransferParams params,
        bytes32 transferId,
        uint112 targetAmount,
        uint112 fee
    );
    event LnProviderUpdated(
        uint256 remoteChainId,
        address provider,
        address sourceToken,
        address targetToken,
        uint112 baseFee,
        uint16 liquidityfeeRate,
        uint112 transferLimit
    );
    event PenaltyReserveUpdated(address provider, address sourceToken, uint256 updatedPanaltyReserve);
    event LiquidityWithdrawn(bytes32[] transferIds, address provider, uint256 amount);
    event TransferSlashed(bytes32 transferId, address provider, address slasher, uint112 slashAmount);
    event LnProviderPaused(address provider, uint256 remoteChainId, address sourceToken, address targetToken, bool paused);

    modifier allowRemoteCall(uint256 _remoteChainId) {
        _verifyRemote(_remoteChainId);
        _;
    }

    function _verifyRemote(uint256 _remoteChainId) internal virtual {}

    function unpause() external onlyOperator {
        _unpause();
    }

    function pause() external onlyOperator {
        _pause();
    }

    // register a new token pair by Helix Dao
    // if the token pair has been registered, it will revert
    // select an unused _index to save the tokenInfo, it's not required that the _index is continous or increased
    function registerTokenInfo(
        uint256 _remoteChainId,
        address _sourceToken,
        address _targetToken,
        uint112 _protocolFee,
        uint112 _penalty,
        uint8 _sourceDecimals,
        uint8 _targetDecimals,
        uint32 _index
    ) onlyDao external {
        require(_index > 0, "invalid index");
        bytes32 key = getTokenKey(_remoteChainId, _sourceToken, _targetToken);
        TokenInfo memory oldInfo = tokenInfos[key];
        require(oldInfo.index == 0, "token info exist");
        require(tokenIndexer[_index] == bytes32(0), "the index exist");
        TokenConfigure memory tokenConfig = TokenConfigure(
            _protocolFee,
            _penalty,
            _sourceDecimals,
            _targetDecimals
        );
        tokenInfos[key] = TokenInfo(
            tokenConfig,
            _index,
            _sourceToken,
            _targetToken,
            0
        );
        tokenIndexer[_index] = key;
        emit TokenRegistered(key, _remoteChainId, _sourceToken, _targetToken, _protocolFee, _penalty, _index);
    }

    // update a registered token pair
    // the key or index cannot be updated
    // Attention! source decimals and target decimals
    function updateTokenInfo(
        uint256 _remoteChainId,
        address _sourceToken,
        address _targetToken,
        uint112 _protocolFee,
        uint112 _penalty,
        uint8 _sourceDecimals,
        uint8 _targetDecimals
    ) onlyDao external {
        bytes32 key = getTokenKey(_remoteChainId, _sourceToken, _targetToken);
        TokenInfo memory tokenInfo = tokenInfos[key];
        require(tokenInfo.index > 0, "token not registered");
        tokenInfos[key].config = TokenConfigure(
            _protocolFee,
            _penalty,
            _sourceDecimals,
            _targetDecimals
        );
        emit TokenInfoUpdated(key, _protocolFee, _penalty, _sourceDecimals, _targetDecimals);
    }

    // delete a token pair by Helix Dao
    // This interface should be called with exceptional caution, only when correcting registration errors, to conserve index resources.
    // Attention! DON'T delete a used token pair
    function deleteTokenInfo(bytes32 key) onlyDao external {
        TokenInfo memory tokenInfo = tokenInfos[key];
        require(tokenInfo.index > 0, "token not registered");
        require(tokenIndexer[tokenInfo.index] == key, "indexer exception");
        delete tokenInfos[key];
        delete tokenIndexer[tokenInfo.index];
    }

    // claim the protocol fee
    function claimProtocolFeeIncome(
        bytes32 _tokenInfoKey,
        uint256 _amount,
        address _receiver
    ) onlyDao external {
        TokenInfo memory tokenInfo = tokenInfos[_tokenInfoKey];
        require(tokenInfo.protocolFeeIncome > _amount, "not enough income");
        tokenInfos[_tokenInfoKey].protocolFeeIncome = tokenInfo.protocolFeeIncome - _amount;
        
        if (tokenInfo.sourceToken == address(0)) {
            TokenTransferHelper.safeTransferNative(_receiver, _amount);
        } else {
            TokenTransferHelper.safeTransfer(tokenInfo.sourceToken, _receiver, _amount);
        }
        emit FeeIncomeClaimed(_tokenInfoKey, _amount, _receiver);
    }

    // called by lnProvider
    // this func can be called to register a new or update an exist LnProvider info
    function registerLnProvider(
        uint256 _remoteChainId,
        address _sourceToken,
        address _targetToken,
        uint112 _baseFee,
        uint16 _liquidityFeeRate,
        uint112 _transferLimit
    ) external {
        bytes32 key = getTokenKey(_remoteChainId, _sourceToken, _targetToken);
        TokenInfo memory tokenInfo = tokenInfos[key];
        require(tokenInfo.index > 0, "token not registered");
        bytes32 providerKey = getProviderKey(_remoteChainId, msg.sender, _sourceToken, _targetToken);

        require(_liquidityFeeRate < LIQUIDITY_FEE_RATE_BASE, "liquidity fee too large");

        // we only update the field fee of the provider info
        // if the provider has not been registered, then this line will register, otherwise update fee
        SourceProviderInfo storage providerInfo = srcProviders[providerKey];
        providerInfo.baseFee = _baseFee;
        providerInfo.liquidityFeeRate = _liquidityFeeRate;
        providerInfo.transferLimit = _transferLimit;

        emit LnProviderUpdated(_remoteChainId, msg.sender, _sourceToken, _targetToken, _baseFee, _liquidityFeeRate, _transferLimit);
    }

    function depositPenaltyReserve(
        address _sourceToken,
        uint256 _amount
    ) external payable {
        bytes32 key = getProviderStateKey(_sourceToken, msg.sender);
        uint256 updatedPanaltyReserve = penaltyReserves[key] + _amount;
        penaltyReserves[key] = updatedPanaltyReserve;

        if (_sourceToken == address(0)) {
            require(msg.value == _amount, "invalid penaltyReserve value");
        } else {
            require(msg.value == 0, "value not need");
            TokenTransferHelper.safeTransferFrom(
                _sourceToken,
                msg.sender,
                address(this),
                _amount
            );
        }
        emit PenaltyReserveUpdated(msg.sender, _sourceToken, updatedPanaltyReserve);
    }

    function withdrawPenaltyReserve(
        address _sourceToken,
        uint256 _amount
    ) external {
        bytes32 key = getProviderStateKey(_sourceToken, msg.sender);
        uint256 updatedPanaltyReserve = penaltyReserves[key] - _amount;
        penaltyReserves[key] = updatedPanaltyReserve;

        if (_sourceToken == address(0)) {
            TokenTransferHelper.safeTransferNative(msg.sender, _amount);
        } else {
            TokenTransferHelper.safeTransfer(_sourceToken, msg.sender, _amount);
        }
        emit PenaltyReserveUpdated(msg.sender, _sourceToken, updatedPanaltyReserve);
    }

    function providerPause(
        uint256 _remoteChainId,
        address _sourceToken,
        address _targetToken
    ) external {
        bytes32 providerKey = getProviderKey(_remoteChainId, msg.sender, _sourceToken, _targetToken);
        srcProviders[providerKey].pause = true;
        emit LnProviderPaused(msg.sender, _remoteChainId, _sourceToken, _targetToken, true);
    }

    function providerUnpause(
        uint256 _remoteChainId,
        address _sourceToken,
        address _targetToken
    ) external {
        bytes32 providerKey = getProviderKey(_remoteChainId, msg.sender, _sourceToken, _targetToken);
        srcProviders[providerKey].pause = false;
        emit LnProviderPaused(msg.sender, _remoteChainId, _sourceToken, _targetToken, false);
    }

    function totalFee(
        uint256 _remoteChainId,
        address _provider,
        address _sourceToken,
        address _targetToken,
        uint112 _amount
    ) external view returns(uint112) {
        TokenInfo memory tokenInfo = getTokenInfo(_remoteChainId, _sourceToken, _targetToken);
        SourceProviderInfo memory providerInfo = getProviderInfo(_remoteChainId, _provider, _sourceToken, _targetToken);
        uint256 providerFee = uint256(providerInfo.baseFee) +  uint256(providerInfo.liquidityFeeRate) * uint256(_amount) / LIQUIDITY_FEE_RATE_BASE;
        require(providerFee < type(uint112).max, "overflow fee");
        return uint112(providerFee) + tokenInfo.config.protocolFee;
    }

    function lockAndRemoteRelease(TransferParams calldata _params) whenNotPaused external payable {
        // timestamp must be close to the block time
        require(
            _params.timestamp >= block.timestamp - LOCK_TIME_DISTANCE && _params.timestamp <= block.timestamp + LOCK_TIME_DISTANCE,
            "timestamp is too far from block time"
        );

        // check transfer info
        bytes32 tokenKey = getTokenKey(_params.remoteChainId, _params.sourceToken, _params.targetToken);
        TokenInfo memory tokenInfo = tokenInfos[tokenKey];
        SourceProviderInfo memory providerInfo = getProviderInfo(_params.remoteChainId, _params.provider, _params.sourceToken, _params.targetToken);
        require(providerInfo.transferLimit >= _params.amount && _params.amount > 0, "invalid transfer amount");
        uint256 providerFee = uint256(providerInfo.baseFee) +  uint256(providerInfo.liquidityFeeRate) * uint256(_params.amount) / LIQUIDITY_FEE_RATE_BASE;
        require(providerFee < type(uint112).max, "overflow fee");
        uint112 amountWithFeeAndPenalty = _params.amount + uint112(providerFee) + tokenInfo.config.penalty;
        require(_params.totalFee >= providerFee + tokenInfo.config.protocolFee, "fee not matched");
        require(!providerInfo.pause, "provider paused");

        // update provider state
        bytes32 stateKey = getProviderStateKey(_params.sourceToken, _params.provider);
        uint256 penaltyReserved = penaltyReserves[stateKey];
        require(penaltyReserved >= tokenInfo.config.penalty, "penalty reserve not enough");
        penaltyReserved -= tokenInfo.config.penalty;
        penaltyReserves[stateKey] = penaltyReserved;
        emit PenaltyReserveUpdated(_params.provider, _params.sourceToken, penaltyReserved);

        // save lock info
        uint256 remoteAmount = uint256(_params.amount) * 10**tokenInfo.config.targetDecimals / 10**tokenInfo.config.sourceDecimals;
        require(remoteAmount < MAX_TRANSFER_AMOUNT && remoteAmount > 0, "overflow amount");
        bytes32 transferId = getTransferId(_params, uint112(remoteAmount));
        require(lockInfos[transferId].status == 0, "transferId exist");
        lockInfos[transferId] = LockInfo(amountWithFeeAndPenalty, tokenInfo.index, LOCK_STATUS_LOCKED);
        emit TokenLocked(_params, transferId, uint112(remoteAmount), uint112(providerFee));

        // update protocol fee income
        // leave the protocol fee into contract, and admin can withdraw this fee anytime
        tokenInfos[tokenKey].protocolFeeIncome = tokenInfo.protocolFeeIncome + tokenInfo.config.protocolFee;

        // transfer token
        uint112 totalPayAmount = _params.amount + uint112(providerFee) + tokenInfo.config.protocolFee;
        if (_params.sourceToken == address(0)) {
            require(msg.value >= totalPayAmount, "value not enough");
            if (msg.value > totalPayAmount) {
                // refund
                TokenTransferHelper.safeTransferNative(msg.sender, msg.value - totalPayAmount);
            }
        } else {
            require(msg.value == 0, "no value need");
            TokenTransferHelper.safeTransferFrom(_params.sourceToken, msg.sender, address(this), totalPayAmount);
        }
    }

    // we require the same token to withdrawn
    function withdrawLiquidity(
        bytes32[] calldata _transferIds,
        uint256 _remoteChainId,
        // provider is verified on the target chain
        address _provider
    ) external allowRemoteCall(_remoteChainId) {
        require(_transferIds.length > 0, "invalid transferIds size");
        uint32 tokenIndex = lockInfos[_transferIds[0]].tokenIndex;
        uint256 totalAmount = 0;
        for (uint i = 0; i < _transferIds.length; i++) {
            bytes32 transferId = _transferIds[i];
            LockInfo memory lockInfo = lockInfos[transferId];
            require(lockInfo.amountWithFeeAndPenalty > 0, "invalid transferId");
            require(lockInfo.tokenIndex == tokenIndex, "token index not matched");
            require(lockInfo.status == LOCK_STATUS_LOCKED, "token has been withdrawn");

            totalAmount += lockInfo.amountWithFeeAndPenalty;
            lockInfos[transferId].status = LOCK_STATUS_WITHDRAWN;
        }
        emit LiquidityWithdrawn(_transferIds, _provider, totalAmount);
        bytes32 key = tokenIndexer[tokenIndex];
        TokenInfo memory tokenInfo = tokenInfos[key];
        require(tokenInfo.index == tokenIndex, "invalid token info");

        uint256 withdrawAmount = totalAmount;
        // if penalty updated, the relayer may not redeposit
        if (tokenInfo.config.penalty * _transferIds.length < withdrawAmount) {
            // restore the penalty reserve
            uint112 redepositPenalty = tokenInfo.config.penalty * uint112(_transferIds.length);
            bytes32 stateKey = getProviderStateKey(tokenInfo.sourceToken, _provider);
            uint256 penaltyReserved = penaltyReserves[stateKey] + uint256(redepositPenalty);
            penaltyReserves[stateKey] = penaltyReserved;
            withdrawAmount -= redepositPenalty;
            emit PenaltyReserveUpdated(_provider, tokenInfo.sourceToken, penaltyReserved);
        }

        if (tokenInfo.sourceToken == address(0)) {
            TokenTransferHelper.safeTransferNative(_provider, withdrawAmount);
        } else {
            TokenTransferHelper.safeTransfer(tokenInfo.sourceToken, _provider, withdrawAmount);
        }
    }

    function slash(
        uint256 _remoteChainId,
        bytes32 _transferId,
        // slasher, amount and lnProvider is verified on the target chain
        address _lnProvider,
        address _slasher
    ) external allowRemoteCall(_remoteChainId) {
        LockInfo memory lockInfo = lockInfos[_transferId];
        require(lockInfo.status == LOCK_STATUS_LOCKED, "invalid lock status");
        bytes32 tokenKey = tokenIndexer[lockInfo.tokenIndex];
        TokenInfo memory tokenInfo = tokenInfos[tokenKey];
        lockInfos[_transferId].status = LOCK_STATUS_SLASHED;

        // pause this provider if slashed
        bytes32 providerKey = getProviderKey(_remoteChainId, _lnProvider, tokenInfo.sourceToken, tokenInfo.targetToken);
        srcProviders[providerKey].pause = true;
        emit LnProviderPaused(_lnProvider, _remoteChainId, tokenInfo.sourceToken, tokenInfo.targetToken, true);

        // transfer token to slasher
        if (tokenInfo.sourceToken == address(0)) {
            TokenTransferHelper.safeTransferNative(_slasher, lockInfo.amountWithFeeAndPenalty);
        } else {
            TokenTransferHelper.safeTransfer(tokenInfo.sourceToken, _slasher, lockInfo.amountWithFeeAndPenalty);
        }
        emit TransferSlashed(_transferId, _lnProvider, _slasher, lockInfo.amountWithFeeAndPenalty);
    }

    function getProviderKey(uint256 _remoteChainId, address _provider, address _sourceToken, address _targetToken) pure public returns(bytes32) {
        return keccak256(abi.encodePacked(_remoteChainId, _provider, _sourceToken, _targetToken));
    }

    function getTokenKey(uint256 _remoteChainId, address _sourceToken, address _targetToken) pure public returns(bytes32) {
        return keccak256(abi.encodePacked(_remoteChainId, _sourceToken, _targetToken));
    }

    function getProviderStateKey(address _sourceToken, address provider) pure public returns(bytes32) {
        return keccak256(abi.encodePacked(_sourceToken, provider));
    }

    function getTransferId(
        TransferParams memory _params,
        uint112 _remoteAmount
    ) public view returns(bytes32) {
        return keccak256(abi.encodePacked(
            block.chainid,
            _params.remoteChainId,
            _params.provider,
            _params.sourceToken,
            _params.targetToken,
            _params.receiver,
            _params.amount,
            _remoteAmount,
            _params.timestamp
        ));
    }

    function getTokenInfo(uint256 _remoteChainId, address _sourceToken, address _targetToken) view internal returns(TokenInfo memory) {
        bytes32 key = keccak256(abi.encodePacked(_remoteChainId, _sourceToken, _targetToken));
        return tokenInfos[key];
    }

    function getProviderInfo(
        uint256 _remoteChainId,
        address _provider,
        address _sourceToken,
        address _targetToken
    ) view internal returns(SourceProviderInfo memory) {
        bytes32 key = keccak256(abi.encodePacked(_remoteChainId, _provider, _sourceToken, _targetToken));
        return srcProviders[key];
    }
}

// File contracts/ln/interface/ILnBridgeSourceV3.sol
// License-Identifier: MIT

interface ILnBridgeSourceV3 {
    function slash(
        uint256 _remoteChainId,
        bytes32 _transferId,
        address _lnProvider,
        address _slasher
    ) external;
    function withdrawLiquidity(
        bytes32[] calldata _transferIds,
        uint256 _remoteChainId,
        address _provider
    ) external;
}

// File contracts/ln/base/LnBridgeTargetV3.sol
// License-Identifier: MIT


contract LnBridgeTargetV3 {
    uint256 constant public SLASH_EXPIRE_TIME = 60 * 60;
    // timestamp: the time when transfer filled, this is also the flag that the transfer is filled(relayed or slashed)
    // provider: the transfer lnProvider
    struct FillTransfer {
        uint64 timestamp;
        address provider;
    }

    // lockTimestamp: the time when the transfer start from source chain
    // the lockTimestamp is verified on source chain
    // 1. lockTimestamp verified successed: slasher get the transfer amount, fee and penalty on source chain
    // 2. lockTimestamp verified failed:    slasher get the transfer amount, but the fee and penalty back to the provider
    // sourceAmount: the send amount on source chain
    struct SlashInfo {
        uint256 remoteChainId;
        address slasher;
    }

    struct RelayParams {
        uint256 remoteChainId;
        address provider;
        address sourceToken;
        address targetToken;
        uint112 sourceAmount;
        uint112 targetAmount;
        address receiver;
        uint256 timestamp;
    }

    // transferId => FillTransfer
    mapping(bytes32 => FillTransfer) public fillTransfers;
    // transferId => SlashInfo
    mapping(bytes32 => SlashInfo) public slashInfos;

    event TransferFilled(bytes32 transferId, address provider);
    event SlashRequest(bytes32 transferId, uint256 remoteChainId, address provider, address sourceToken, address targetToken, address slasher);
    event LiquidityWithdrawRequested(bytes32[] transferIds, uint256 remoteChainId);
    event UnreachableNativeTokenReceived(bytes32 transferId, address receiver, uint256 amount);

    function _sendMessageToSource(uint256 _remoteChainId, bytes memory _payload, uint256 feePrepaid, bytes memory _extParams) internal virtual {}

    function _unreachableNativeTokenReceiver() internal view virtual returns(address) {}

    // relay a tx, usually called by lnProvider
    // 1. update the fillTransfers storage to save the relay proof
    // 2. transfer token from lnProvider to the receiver
    function relay(
        RelayParams calldata _params,
        bytes32 _expectedTransferId,
        bool _relayBySelf
    ) external payable {
        // _relayBySelf = true to protect that the msg.sender don't relay for others
        // _relayBySelf = false to allow that lnProvider can use different account between source chain and target chain
        require(!_relayBySelf || _params.provider == msg.sender, "invalid provider");
        bytes32 transferId = keccak256(abi.encodePacked(
           _params.remoteChainId,
           block.chainid,
           _params.provider,
           _params.sourceToken,
           _params.targetToken,
           _params.receiver,
           _params.sourceAmount,
           _params.targetAmount,
           _params.timestamp
        ));
        require(_expectedTransferId == transferId, "check expected transferId failed");
        FillTransfer memory fillTransfer = fillTransfers[transferId];
        // Make sure this transfer was never filled before 
        require(fillTransfer.timestamp == 0, "transfer has been filled");
        fillTransfers[transferId] = FillTransfer(uint64(block.timestamp), _params.provider);

        if (_params.targetToken == address(0)) {
            require(msg.value == _params.targetAmount, "invalid amount");
            bool success = TokenTransferHelper.tryTransferNative(_params.receiver, _params.targetAmount);
            if (!success) {
                TokenTransferHelper.safeTransferNative(_unreachableNativeTokenReceiver(), _params.targetAmount);
                emit UnreachableNativeTokenReceived(transferId, _params.receiver, _params.targetAmount);
            }
        } else {
            require(msg.value == 0, "value not need");
            TokenTransferHelper.safeTransferFrom(_params.targetToken, msg.sender, _params.receiver, uint256(_params.targetAmount));
        }
        emit TransferFilled(transferId, _params.provider);
    }

    // slash a tx when timeout
    // 1. update fillTransfers and slashInfos storage to save slash proof
    // 2. transfer tokens from slasher to receiver for this tx
    // 3. send a cross-chain message to source chain to withdraw the amount, fee and penalty from lnProvider
    function requestSlashAndRemoteRelease(
        RelayParams calldata _params,
        bytes32 _expectedTransferId,
        uint256 _feePrepaid,
        bytes memory _extParams
    ) external payable {
        bytes32 transferId = keccak256(abi.encodePacked(
           _params.remoteChainId,
           block.chainid,
           _params.provider,
           _params.sourceToken,
           _params.targetToken,
           _params.receiver,
           _params.sourceAmount,
           _params.targetAmount,
           _params.timestamp
        ));
        require(_expectedTransferId == transferId, "check expected transferId failed");

        FillTransfer memory fillTransfer = fillTransfers[transferId];
        require(fillTransfer.timestamp == 0, "transfer has been filled");

        // suppose source chain and target chain has the same block timestamp
        // event the timestamp is not sync exactly, this TIMEOUT is also verified on source chain
        require(_params.timestamp < block.timestamp - SLASH_EXPIRE_TIME, "time not expired");
        fillTransfers[transferId] = FillTransfer(uint64(block.timestamp), _params.provider);
        slashInfos[transferId] = SlashInfo(_params.remoteChainId, msg.sender);

        if (_params.targetToken == address(0)) {
            require(msg.value == _params.targetAmount + _feePrepaid, "invalid value");
            bool success = TokenTransferHelper.tryTransferNative(_params.receiver, _params.targetAmount);
            if (!success) {
                TokenTransferHelper.safeTransferNative(_unreachableNativeTokenReceiver(), _params.targetAmount);
                emit UnreachableNativeTokenReceived(transferId, _params.receiver, _params.targetAmount);
            }
        } else {
            require(msg.value == _feePrepaid, "value too large");
            TokenTransferHelper.safeTransferFrom(_params.targetToken, msg.sender, _params.receiver, uint256(_params.targetAmount));
        }
        bytes memory message = encodeSlashRequest(transferId, _params.provider, msg.sender);
        _sendMessageToSource(_params.remoteChainId, message, _feePrepaid, _extParams);
        emit SlashRequest(transferId, _params.remoteChainId, _params.provider, _params.sourceToken, _params.targetToken, msg.sender);
    }

    // it's allowed to retry a slash tx because the cross-chain message may fail on source chain
    // But it's required that the params must not be modified, it read from the storage saved
    function retrySlash(bytes32 transferId, bytes memory _extParams) external payable {
        FillTransfer memory fillTransfer = fillTransfers[transferId];
        require(fillTransfer.timestamp > 0, "transfer not filled");
        SlashInfo memory slashInfo = slashInfos[transferId];
        require(slashInfo.slasher == msg.sender, "invalid slasher");
        // send message
        bytes memory message = encodeSlashRequest(transferId, fillTransfer.provider, slashInfo.slasher);
        _sendMessageToSource(slashInfo.remoteChainId, message, msg.value, _extParams);
    }

    // can't withdraw for different providers each time
    // the size of the _transferIds should not be too large to be processed outof gas on source chain
    function requestWithdrawLiquidity(
        uint256 _remoteChainId,
        bytes32[] calldata _transferIds,
        address _provider,
        bytes memory _extParams
    ) external payable {
        for (uint i = 0; i < _transferIds.length; i++) {
            bytes32 transferId = _transferIds[i];
            FillTransfer memory fillTransfer = fillTransfers[transferId];
            // make sure that each transfer has the same provider
            require(fillTransfer.provider == _provider, "provider invalid");
        }
        bytes memory message = encodeWithdrawLiquidityRequest(_transferIds, _provider);
        _sendMessageToSource(_remoteChainId, message, msg.value, _extParams);
        emit LiquidityWithdrawRequested(_transferIds, _remoteChainId);
    }

    function encodeWithdrawLiquidityRequest(
        bytes32[] calldata _transferIds,
        address _provider
    ) public view returns(bytes memory message) {
        message = abi.encodeWithSelector(
           ILnBridgeSourceV3.withdrawLiquidity.selector,
           _transferIds,
           block.chainid,
           _provider
        );
    }

    function encodeSlashRequest(
        bytes32 _transferId,
        address _provider,
        address _slasher
    ) public view returns(bytes memory message) {
        message = abi.encodeWithSelector(
           ILnBridgeSourceV3.slash.selector,
           block.chainid,
           _transferId,
           _provider,
           _slasher
        );
    }
}

// File @zeppelin-solidity/contracts/utils/Address.sol@v4.7.3
// License-Identifier: MIT
// OpenZeppelin Contracts (last updated v4.7.0) (utils/Address.sol)


/**
 * @dev Collection of functions related to the address type
 */
library Address {
    /**
     * @dev Returns true if `account` is a contract.
     *
     * [IMPORTANT]
     * ====
     * It is unsafe to assume that an address for which this function returns
     * false is an externally-owned account (EOA) and not a contract.
     *
     * Among others, `isContract` will return false for the following
     * types of addresses:
     *
     *  - an externally-owned account
     *  - a contract in construction
     *  - an address where a contract will be created
     *  - an address where a contract lived, but was destroyed
     * ====
     *
     * [IMPORTANT]
     * ====
     * You shouldn't rely on `isContract` to protect against flash loan attacks!
     *
     * Preventing calls from contracts is highly discouraged. It breaks composability, breaks support for smart wallets
     * like Gnosis Safe, and does not provide security since it can be circumvented by calling from a contract
     * constructor.
     * ====
     */
    function isContract(address account) internal view returns (bool) {
        // This method relies on extcodesize/address.code.length, which returns 0
        // for contracts in construction, since the code is only stored at the end
        // of the constructor execution.

        return account.code.length > 0;
    }

    /**
     * @dev Replacement for Solidity's `transfer`: sends `amount` wei to
     * `recipient`, forwarding all available gas and reverting on errors.
     *
     * https://eips.ethereum.org/EIPS/eip-1884[EIP1884] increases the gas cost
     * of certain opcodes, possibly making contracts go over the 2300 gas limit
     * imposed by `transfer`, making them unable to receive funds via
     * `transfer`. {sendValue} removes this limitation.
     *
     * https://diligence.consensys.net/posts/2019/09/stop-using-soliditys-transfer-now/[Learn more].
     *
     * IMPORTANT: because control is transferred to `recipient`, care must be
     * taken to not create reentrancy vulnerabilities. Consider using
     * {ReentrancyGuard} or the
     * https://solidity.readthedocs.io/en/v0.5.11/security-considerations.html#use-the-checks-effects-interactions-pattern[checks-effects-interactions pattern].
     */
    function sendValue(address payable recipient, uint256 amount) internal {
        require(address(this).balance >= amount, "Address: insufficient balance");

        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Address: unable to send value, recipient may have reverted");
    }

    /**
     * @dev Performs a Solidity function call using a low level `call`. A
     * plain `call` is an unsafe replacement for a function call: use this
     * function instead.
     *
     * If `target` reverts with a revert reason, it is bubbled up by this
     * function (like regular Solidity function calls).
     *
     * Returns the raw returned data. To convert to the expected return value,
     * use https://solidity.readthedocs.io/en/latest/units-and-global-variables.html?highlight=abi.decode#abi-encoding-and-decoding-functions[`abi.decode`].
     *
     * Requirements:
     *
     * - `target` must be a contract.
     * - calling `target` with `data` must not revert.
     *
     * _Available since v3.1._
     */
    function functionCall(address target, bytes memory data) internal returns (bytes memory) {
        return functionCall(target, data, "Address: low-level call failed");
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-}[`functionCall`], but with
     * `errorMessage` as a fallback revert reason when `target` reverts.
     *
     * _Available since v3.1._
     */
    function functionCall(
        address target,
        bytes memory data,
        string memory errorMessage
    ) internal returns (bytes memory) {
        return functionCallWithValue(target, data, 0, errorMessage);
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-}[`functionCall`],
     * but also transferring `value` wei to `target`.
     *
     * Requirements:
     *
     * - the calling contract must have an ETH balance of at least `value`.
     * - the called Solidity function must be `payable`.
     *
     * _Available since v3.1._
     */
    function functionCallWithValue(
        address target,
        bytes memory data,
        uint256 value
    ) internal returns (bytes memory) {
        return functionCallWithValue(target, data, value, "Address: low-level call with value failed");
    }

    /**
     * @dev Same as {xref-Address-functionCallWithValue-address-bytes-uint256-}[`functionCallWithValue`], but
     * with `errorMessage` as a fallback revert reason when `target` reverts.
     *
     * _Available since v3.1._
     */
    function functionCallWithValue(
        address target,
        bytes memory data,
        uint256 value,
        string memory errorMessage
    ) internal returns (bytes memory) {
        require(address(this).balance >= value, "Address: insufficient balance for call");
        require(isContract(target), "Address: call to non-contract");

        (bool success, bytes memory returndata) = target.call{value: value}(data);
        return verifyCallResult(success, returndata, errorMessage);
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-}[`functionCall`],
     * but performing a static call.
     *
     * _Available since v3.3._
     */
    function functionStaticCall(address target, bytes memory data) internal view returns (bytes memory) {
        return functionStaticCall(target, data, "Address: low-level static call failed");
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-string-}[`functionCall`],
     * but performing a static call.
     *
     * _Available since v3.3._
     */
    function functionStaticCall(
        address target,
        bytes memory data,
        string memory errorMessage
    ) internal view returns (bytes memory) {
        require(isContract(target), "Address: static call to non-contract");

        (bool success, bytes memory returndata) = target.staticcall(data);
        return verifyCallResult(success, returndata, errorMessage);
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-}[`functionCall`],
     * but performing a delegate call.
     *
     * _Available since v3.4._
     */
    function functionDelegateCall(address target, bytes memory data) internal returns (bytes memory) {
        return functionDelegateCall(target, data, "Address: low-level delegate call failed");
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-string-}[`functionCall`],
     * but performing a delegate call.
     *
     * _Available since v3.4._
     */
    function functionDelegateCall(
        address target,
        bytes memory data,
        string memory errorMessage
    ) internal returns (bytes memory) {
        require(isContract(target), "Address: delegate call to non-contract");

        (bool success, bytes memory returndata) = target.delegatecall(data);
        return verifyCallResult(success, returndata, errorMessage);
    }

    /**
     * @dev Tool to verifies that a low level call was successful, and revert if it wasn't, either by bubbling the
     * revert reason using the provided one.
     *
     * _Available since v4.3._
     */
    function verifyCallResult(
        bool success,
        bytes memory returndata,
        string memory errorMessage
    ) internal pure returns (bytes memory) {
        if (success) {
            return returndata;
        } else {
            // Look for revert reason and bubble it up if present
            if (returndata.length > 0) {
                // The easiest way to bubble the revert reason is using memory via assembly
                /// @solidity memory-safe-assembly
                assembly {
                    let returndata_size := mload(returndata)
                    revert(add(32, returndata), returndata_size)
                }
            } else {
                revert(errorMessage);
            }
        }
    }
}

// File @zeppelin-solidity/contracts/proxy/utils/Initializable.sol@v4.7.3
// License-Identifier: MIT
// OpenZeppelin Contracts (last updated v4.7.0) (proxy/utils/Initializable.sol)


/**
 * @dev This is a base contract to aid in writing upgradeable contracts, or any kind of contract that will be deployed
 * behind a proxy. Since proxied contracts do not make use of a constructor, it's common to move constructor logic to an
 * external initializer function, usually called `initialize`. It then becomes necessary to protect this initializer
 * function so it can only be called once. The {initializer} modifier provided by this contract will have this effect.
 *
 * The initialization functions use a version number. Once a version number is used, it is consumed and cannot be
 * reused. This mechanism prevents re-execution of each "step" but allows the creation of new initialization steps in
 * case an upgrade adds a module that needs to be initialized.
 *
 * For example:
 *
 * [.hljs-theme-light.nopadding]
 * ```
 * contract MyToken is ERC20Upgradeable {
 *     function initialize() initializer public {
 *         __ERC20_init("MyToken", "MTK");
 *     }
 * }
 * contract MyTokenV2 is MyToken, ERC20PermitUpgradeable {
 *     function initializeV2() reinitializer(2) public {
 *         __ERC20Permit_init("MyToken");
 *     }
 * }
 * ```
 *
 * TIP: To avoid leaving the proxy in an uninitialized state, the initializer function should be called as early as
 * possible by providing the encoded function call as the `_data` argument to {ERC1967Proxy-constructor}.
 *
 * CAUTION: When used with inheritance, manual care must be taken to not invoke a parent initializer twice, or to ensure
 * that all initializers are idempotent. This is not verified automatically as constructors are by Solidity.
 *
 * [CAUTION]
 * ====
 * Avoid leaving a contract uninitialized.
 *
 * An uninitialized contract can be taken over by an attacker. This applies to both a proxy and its implementation
 * contract, which may impact the proxy. To prevent the implementation contract from being used, you should invoke
 * the {_disableInitializers} function in the constructor to automatically lock it when it is deployed:
 *
 * [.hljs-theme-light.nopadding]
 * ```
 * /// @custom:oz-upgrades-unsafe-allow constructor
 * constructor() {
 *     _disableInitializers();
 * }
 * ```
 * ====
 */
abstract contract Initializable {
    /**
     * @dev Indicates that the contract has been initialized.
     * @custom:oz-retyped-from bool
     */
    uint8 private _initialized;

    /**
     * @dev Indicates that the contract is in the process of being initialized.
     */
    bool private _initializing;

    /**
     * @dev Triggered when the contract has been initialized or reinitialized.
     */
    event Initialized(uint8 version);

    /**
     * @dev A modifier that defines a protected initializer function that can be invoked at most once. In its scope,
     * `onlyInitializing` functions can be used to initialize parent contracts. Equivalent to `reinitializer(1)`.
     */
    modifier initializer() {
        bool isTopLevelCall = !_initializing;
        require(
            (isTopLevelCall && _initialized < 1) || (!Address.isContract(address(this)) && _initialized == 1),
            "Initializable: contract is already initialized"
        );
        _initialized = 1;
        if (isTopLevelCall) {
            _initializing = true;
        }
        _;
        if (isTopLevelCall) {
            _initializing = false;
            emit Initialized(1);
        }
    }

    /**
     * @dev A modifier that defines a protected reinitializer function that can be invoked at most once, and only if the
     * contract hasn't been initialized to a greater version before. In its scope, `onlyInitializing` functions can be
     * used to initialize parent contracts.
     *
     * `initializer` is equivalent to `reinitializer(1)`, so a reinitializer may be used after the original
     * initialization step. This is essential to configure modules that are added through upgrades and that require
     * initialization.
     *
     * Note that versions can jump in increments greater than 1; this implies that if multiple reinitializers coexist in
     * a contract, executing them in the right order is up to the developer or operator.
     */
    modifier reinitializer(uint8 version) {
        require(!_initializing && _initialized < version, "Initializable: contract is already initialized");
        _initialized = version;
        _initializing = true;
        _;
        _initializing = false;
        emit Initialized(version);
    }

    /**
     * @dev Modifier to protect an initialization function so that it can only be invoked by functions with the
     * {initializer} and {reinitializer} modifiers, directly or indirectly.
     */
    modifier onlyInitializing() {
        require(_initializing, "Initializable: contract is not initializing");
        _;
    }

    /**
     * @dev Locks the contract, preventing any future reinitialization. This cannot be part of an initializer call.
     * Calling this in the constructor of a contract will prevent that contract from being initialized or reinitialized
     * to any version. It is recommended to use this to lock implementation contracts that are designed to be called
     * through proxies.
     */
    function _disableInitializers() internal virtual {
        require(!_initializing, "Initializable: contract is initializing");
        if (_initialized < type(uint8).max) {
            _initialized = type(uint8).max;
            emit Initialized(type(uint8).max);
        }
    }
}

// File contracts/ln/HelixLnBridgeV3.sol
// License-Identifier: MIT




contract HelixLnBridgeV3 is Initializable, LnBridgeSourceV3, LnBridgeTargetV3 {
    struct MessagerService {
        address sendService;
        address receiveService;
    }

    // remoteChainId => messager
    mapping(uint256=>MessagerService) public messagers;

    receive() external payable {}

    function initialize(address _dao, bytes calldata) public virtual initializer {
        _initialize(_dao);
    }

    // the remote endpoint is unique, if we want multi-path to remote endpoint, then the messager should support multi-path
    function setSendService(uint256 _remoteChainId, address _remoteBridge, address _service) external onlyDao {
        messagers[_remoteChainId].sendService = _service;
        ILowLevelMessageSender(_service).registerRemoteReceiver(_remoteChainId, _remoteBridge);
    }

    function setReceiveService(uint256 _remoteChainId, address _remoteBridge, address _service) external onlyDao {
        messagers[_remoteChainId].receiveService = _service;
        ILowLevelMessageReceiver(_service).registerRemoteSender(_remoteChainId, _remoteBridge);
    }

    function _sendMessageToSource(uint256 _remoteChainId, bytes memory _payload, uint256 feePrepaid, bytes memory _extParams) whenNotPaused internal override {
        address sendService = messagers[_remoteChainId].sendService;
        require(sendService != address(0), "invalid messager");
        ILowLevelMessageSender(sendService).sendMessage{value: feePrepaid}(_remoteChainId, _payload, _extParams);
    }

    function _verifyRemote(uint256 _remoteChainId) whenNotPaused internal view override {
        address receiveService = messagers[_remoteChainId].receiveService;
        require(receiveService == msg.sender, "invalid messager");
    }

    function _unreachableNativeTokenReceiver() internal view override returns(address) {
        return dao;
    }
}

// File contracts/interfaces/IBlast.sol
// License-Identifier: MIT

enum YieldMode {
    AUTOMATIC,
    VOID,
    CLAIMABLE
}

enum GasMode {
    VOID,
    CLAIMABLE
}

interface IBlast {
    function YIELD_CONTRACT() external view returns (address);
    function GAS_CONTRACT() external view returns (address);

    // configure
    function configureContract(address contractAddress, YieldMode _yield, GasMode gasMode, address governor) external;
    function configure(YieldMode _yield, GasMode gasMode, address governor) external;

    // base configuration options
    function configureClaimableYield() external;
    function configureClaimableYieldOnBehalf(address contractAddress) external;
    function configureAutomaticYield() external;
    function configureAutomaticYieldOnBehalf(address contractAddress) external;
    function configureVoidYield() external;
    function configureVoidYieldOnBehalf(address contractAddress) external;
    function configureClaimableGas() external;
    function configureClaimableGasOnBehalf(address contractAddress) external;
    function configureVoidGas() external;
    function configureVoidGasOnBehalf(address contractAddress) external;
    function configureGovernor(address _governor) external;
    function configureGovernorOnBehalf(address _newGovernor, address contractAddress) external;

    // claim yield
    function claimYield(address contractAddress, address recipientOfYield, uint256 amount) external returns (uint256);
    function claimAllYield(address contractAddress, address recipientOfYield) external returns (uint256);

    // claim gas
    function claimAllGas(address contractAddress, address recipientOfGas) external returns (uint256);
    function claimGasAtMinClaimRate(
        address contractAddress,
        address recipientOfGas,
        uint256 minClaimRateBips
    )
        external
        returns (uint256);
    function claimMaxGas(address contractAddress, address recipientOfGas) external returns (uint256);
    function claimGas(
        address contractAddress,
        address recipientOfGas,
        uint256 gasToClaim,
        uint256 gasSecondsToConsume
    )
        external
        returns (uint256);

    // read functions
    function readClaimableYield(address contractAddress) external view returns (uint256);
    function readYieldConfiguration(address contractAddress) external view returns (uint8);
    function readGasParams(address contractAddress)
        external
        view
        returns (uint256 etherSeconds, uint256 etherBalance, uint256 lastUpdated, GasMode);
}

// File contracts/interfaces/IBlastPoints.sol
// License-Identifier: MIT

interface IBlastPoints {
    function configurePointsOperator(address operator) external;
}

// File contracts/ln/HelixLnBridgeV3ForBlast.sol
// License-Identifier: MIT



// when register some token that support yield, don't forget to configure claimable yield
contract HelixLnBridgeV3ForBlast is HelixLnBridgeV3 {
    function initialize(address _dao, bytes calldata _data) public override initializer {
        _initialize(_dao);
        (address _blast, address _blastPoints) = abi.decode(_data, (address, address));
        IBlast blast = IBlast(_blast);
        blast.configureClaimableGas();
        blast.configureClaimableYield();
        blast.configureGovernor(_dao);
        IBlastPoints blastPoints = IBlastPoints(_blastPoints);
        blastPoints.configurePointsOperator(_dao);
    }
}