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
 * 12/20/2023
 **/

pragma solidity ^0.8.17;

// File contracts/mapping-token/interfaces/IGuard.sol
// License-Identifier: MIT


interface IGuard {
  function deposit(uint256 id, address token, address recipient, uint256 amount) external;
}

// File contracts/mapping-token/interfaces/IWToken.sol
// License-Identifier: MIT


interface IWToken {
    function deposit() external payable;
    function withdraw(uint wad) external;
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
}

// File contracts/mapping-token/v3/interfaces/IxTokenIssuing.sol
// License-Identifier: MIT

interface IxTokenIssuing {
    function handleIssuingForUnlockFailureFromRemote(
        uint256 originalChainId,
        address originalToken,
        address originalSender,
        address recipient,
        uint256 amount,
        uint256 nonce
    ) external;

    function issuexToken(
        uint256 remoteChainId,
        address originalToken,
        address originalSender,
        address recipient,
        uint256 amount,
        uint256 nonce
    ) external;
}

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

interface IMessageId {
    function latestSentMessageId() external view returns(bytes32);
    function latestRecvMessageId() external view returns(bytes32);
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

// File contracts/utils/DailyLimit.sol
// License-Identifier: MIT


/// @title relay with daily limit - Allows the relay to mint token in a daily limit.
contract DailyLimit {

    event DailyLimitChange(address token, uint dailyLimit);

    mapping(address => uint) public dailyLimit;
    // deprecated, slot for upgrade
    mapping(address => uint) public _slotReserved;
    mapping(address => uint) public spentToday;

    uint constant public SPEND_BIT_LENGTH = 192;
    uint constant public LASTDAY_BIT_LENGTH = 64;

    /// ==== Internal functions ==== 

    /// @dev Contract constructor sets initial owners, required number of confirmations and daily mint limit.
    /// @param _token Token address.
    /// @param _dailyLimit Amount in wei, which can be mint without confirmations on a daily basis.
    function _setDailyLimit(address _token, uint _dailyLimit)
        internal
    {
        require(_dailyLimit < type(uint192).max, "DaliyLimit: overflow uint192");
        dailyLimit[_token] = _dailyLimit;
    }

    /// @dev Allows to change the daily limit.
    /// @param _token Token address.
    /// @param _dailyLimit Amount in wei.
    function _changeDailyLimit(address _token, uint _dailyLimit)
        internal
    {
        require(_dailyLimit < type(uint192).max, "DaliyLimit: overflow uint192");
        dailyLimit[_token] = _dailyLimit;
        emit DailyLimitChange(_token, _dailyLimit);
    }

    /// @dev Allows to change the daily limit.
    /// @param token Token address.
    /// @param amount Amount in wei.
    function expendDailyLimit(address token, uint amount)
        internal
    {
        uint spentInfo = spentToday[token];
        uint lastday = spentInfo >> SPEND_BIT_LENGTH;
        uint lastspent = spentInfo << LASTDAY_BIT_LENGTH >> LASTDAY_BIT_LENGTH;
        if (block.timestamp > lastday + 24 hours) {
            require(amount <= dailyLimit[token], "DailyLimit: amount exceed daily limit");
            spentToday[token] = (block.timestamp << SPEND_BIT_LENGTH) + amount;
            return;
        }
        require(lastspent + amount <= dailyLimit[token] && amount <= dailyLimit[token], "DailyLimit: exceed daily limit");
        spentToday[token] = spentInfo + amount;
    }

    /// ==== Web3 call functions ==== 

    /// @dev Returns maximum withdraw amount.
    /// @param token Token address.
    /// @return Returns amount.
    function calcMaxWithdraw(address token)
        public
        view
        returns (uint)
    {
        uint spentInfo = spentToday[token];
        uint lastday = spentInfo >> SPEND_BIT_LENGTH;
        uint lastspent = spentInfo << LASTDAY_BIT_LENGTH >> LASTDAY_BIT_LENGTH;
        if (block.timestamp > lastday + 24 hours) {
          return dailyLimit[token];
        }

        if (dailyLimit[token] < lastspent) {
          return 0;
        }

        return dailyLimit[token] - lastspent;
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

// File contracts/mapping-token/v3/base/xTokenBridgeBase.sol
// License-Identifier: MIT






// The Base contract for xToken protocol
// Backing or Issuing contract will inherit the contract.
// This contract define the access authorization, the message channel
contract xTokenBridgeBase is Initializable, Pausable, AccessController, DailyLimit {
    uint256 constant public TRANSFER_UNFILLED = 0x00;
    uint256 constant public TRANSFER_DELIVERED = 0x01;
    uint256 constant public TRANSFER_REFUNDED = 0x02;
    struct MessagerService {
        address sendService;
        address receiveService;
    }

    struct RequestInfo {
        bool isRequested;
        bool hasRefundForFailed;
    }

    // the version is to issue different xTokens for different version of bridge.
    string public version;
    // the protocol fee for each time user send transaction
    uint256 public protocolFee;
    // the reserved protocol fee in the contract
    uint256 public protocolFeeReserved;
    address public guard;
    // remoteChainId => info
    mapping(uint256 => MessagerService) public messagers;

    // transferId => RequestInfo
    mapping(bytes32 => RequestInfo) public requestInfos;

    // transferId => result
    // 1. 0x01: filled by receive message
    // 2. 0x02: filled by refund operation
    mapping(bytes32 => uint256) public filledTransfers;

    // must be called by message service configured
    modifier calledByMessager(uint256 _remoteChainId) {
        address receiveService = messagers[_remoteChainId].receiveService;
        require(receiveService == msg.sender, "invalid messager");
        _;
    }

    receive() external payable {}

    function initialize(address _dao, string calldata _version) public initializer {
        _initialize(_dao);
        version = _version;
    }

    function unpause() external onlyOperator {
        _unpause();
    }

    function pause() external onlyOperator {
        _pause();
    }

    function setProtocolFee(uint256 _protocolFee) external onlyOperator {
        protocolFee = _protocolFee;
    }

    function setSendService(uint256 _remoteChainId, address _remoteBridge, address _service) external onlyDao {
        messagers[_remoteChainId].sendService = _service;
        ILowLevelMessageSender(_service).registerRemoteReceiver(_remoteChainId, _remoteBridge);
    }

    function setReceiveService(uint256 _remoteChainId, address _remoteBridge, address _service) external onlyDao {
        messagers[_remoteChainId].receiveService = _service;
        ILowLevelMessageReceiver(_service).registerRemoteSender(_remoteChainId, _remoteBridge);
    }

    function withdrawProtocolFee(address _receiver, uint256 _amount) external onlyDao {
        require(_amount <= protocolFeeReserved, "not enough fee");
        protocolFeeReserved -= _amount;
        TokenTransferHelper.safeTransferNative(_receiver, _amount);
    }

    function _sendMessage(
        uint256 _remoteChainId,
        bytes memory _payload,
        uint256 _feePrepaid,
        bytes memory _extParams
    ) internal whenNotPaused returns(bytes32 messageId) {
        MessagerService memory service = messagers[_remoteChainId];
        require(service.sendService != address(0), "bridge not configured");
        uint256 _protocolFee = protocolFee;
        protocolFeeReserved += _protocolFee;
        ILowLevelMessageSender(service.sendService).sendMessage{value: _feePrepaid - _protocolFee}(
            _remoteChainId,
            _payload,
            _extParams
        );
        messageId = IMessageId(service.sendService).latestSentMessageId();
    }

    // request a cross-chain transfer
    // 1. lock and remote issue
    // 2. burn and remote unlock
    // save the transferId if not exist, else revert
    function _requestTransfer(bytes32 _transferId) internal {
        require(requestInfos[_transferId].isRequested == false, "request exist");
        requestInfos[_transferId].isRequested = true;
    }

    // receive a cross-chain refund request
    // 1. request must be exist
    // 2. can't repeat
    function _handleRefund(bytes32 _transferId) internal {
        RequestInfo memory requestInfo = requestInfos[_transferId];
        require(requestInfo.isRequested == true, "request not exist");
        require(requestInfo.hasRefundForFailed == false, "request has been refund");
        requestInfos[_transferId].hasRefundForFailed = true;
    }

    // receive a cross-chain request
    // must not filled
    // fill the transfer with delivered transfer type
    function _handleTransfer(bytes32 _transferId) internal {
        require(filledTransfers[_transferId] == TRANSFER_UNFILLED, "!conflict");
        filledTransfers[_transferId] = TRANSFER_DELIVERED;
    }

    // request a cross-chain refund
    // 1. can retry
    // 2. can't be filled by delivery
    function _requestRefund(bytes32 _transferId) internal {
        uint256 filledTransfer = filledTransfers[_transferId];
        // already fill by refund, retry request
        if (filledTransfer == TRANSFER_REFUNDED) {
            return;
        }
        require(filledTransfer == TRANSFER_UNFILLED, "!conflict");
        filledTransfers[_transferId] = TRANSFER_REFUNDED;
    }

    function getTransferId(
        uint256 _nonce,
        uint256 _targetChainId,
        address _originalToken,
        address _originalSender,
        address _recipient,
        uint256 _amount
    ) public pure returns(bytes32) {
        return keccak256(abi.encodePacked(_nonce, _targetChainId, _originalToken, _originalSender, _recipient, _amount));
    }

    // settings
    function updateGuard(address _guard) external onlyDao {
        guard = _guard;
    }

    function setDailyLimit(address _token, uint256 _dailyLimit) external onlyDao {
        _setDailyLimit(_token, _dailyLimit);
    }
}

// File contracts/mapping-token/v3/base/xTokenBacking.sol
// License-Identifier: MIT






// The contract implements the backing side of the Helix xToken protocol. 
// When sending cross-chain transactions, the user locks the Token in the contract, and when the message reaches the target chain, the corresponding mapped asset (xToken) will be issued;
// if the target chain fails to issue the xToken, the user can send a reverse message on the target chain to unlock the original asset.
contract xTokenBacking is xTokenBridgeBase {
    address public wToken;

    // save original token => xToken to prevent unregistered token lock
    mapping(bytes32 => address) public originalToken2xTokens;

    event TokenLocked(
        bytes32 transferId,
        bytes32 messageId,
        uint256 nonce,
        uint256 remoteChainId,
        address token,
        address sender,
        address recipient,
        uint256 amount,
        uint256 fee
    );
    event TokenUnlocked(bytes32 transferId, uint256 remoteChainId, address token, address recipient, uint256 amount);
    event RemoteIssuingFailure(bytes32 transferId, bytes32 messageId, address xToken, address originalSender, uint256 amount, uint256 fee);
    event TokenUnlockedForFailed(bytes32 transferId, uint256 remoteChainId, address token, address recipient, uint256 amount);

    // the wToken is the wrapped native token's address
    // this is used to unlock token to guard
    function setwToken(address _wtoken) external onlyDao {
        wToken = _wtoken;
    }

    // register token on source chain
    // this is used to prevent the unregistered token's transfer
    // and must be registered on the target chain before
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

    // We use nonce to ensure that messages are not duplicated
    // especially in reorg scenarios, the destination chain use nonce to filter out duplicate deliveries. 
    // nonce is user-defined, there is no requirement that it must not be repeated.
    // But the transferId generated must not be repeated.
    function lockAndRemoteIssuing(
        uint256 _remoteChainId,
        address _originalToken,
        address _recipient,
        uint256 _amount,
        uint256 _nonce,
        bytes memory _extParams
    ) external payable {
        bytes32 key = keccak256(abi.encodePacked(_remoteChainId, _originalToken));
        require(originalToken2xTokens[key] != address(0), "token not registered");

        bytes32 transferId = getTransferId(_nonce, _remoteChainId, _originalToken, msg.sender, _recipient, _amount);
        _requestTransfer(transferId);

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
            msg.sender,
            _recipient,
            _amount,
            _nonce
        );
        bytes32 messageId = _sendMessage(_remoteChainId, issuxToken, prepaid, _extParams);
        emit TokenLocked(transferId, messageId, _nonce, _remoteChainId, _originalToken, msg.sender, _recipient, _amount, prepaid);
    }

    function encodeIssuexToken(
        address _originalToken,
        address _originalSender,
        address _recipient,
        uint256 _amount,
        uint256 _nonce
    ) public view returns(bytes memory) {
        return abi.encodeWithSelector(
            IxTokenIssuing.issuexToken.selector,
            block.chainid,
            _originalToken,
            _originalSender,
            _recipient,
            _amount,
            _nonce
        );
    }

    // receive unlock original token message from remote issuing contract
    function unlockFromRemote(
        uint256 _remoteChainId,
        address _originalToken,
        address _originSender,
        address _recipient,
        uint256 _amount,
        uint256 _nonce
    ) external calledByMessager(_remoteChainId) whenNotPaused {
        expendDailyLimit(_originalToken, _amount);

        bytes32 transferId = getTransferId(_nonce, block.chainid, _originalToken, _originSender, _recipient, _amount);
        _handleTransfer(transferId);

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
            address _wToken = wToken;
            // when use guard, we deposit native token to the wToken contract
            IWToken(_wToken).deposit{value: _amount}();
            uint allowance = IERC20(_wToken).allowance(address(this), _guard);
            require(IERC20(_wToken).approve(_guard, allowance + _amount), "approve token transfer to guard failed");
            IGuard(_guard).deposit(uint256(_transferId), _wToken, _recipient, _amount);
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

    // send message to Issuing when unlock failed
    function requestRemoteIssuingForUnlockFailure(
        uint256 _remoteChainId,
        address _originalToken,
        address _originalSender,
        address _recipient,
        uint256 _amount,
        uint256 _nonce,
        bytes memory _extParams
    ) external payable {
        require(_originalSender == msg.sender || _recipient == msg.sender || dao == msg.sender, "invalid msgSender");
        bytes32 transferId = getTransferId(_nonce, _remoteChainId, _originalToken, _originalSender, _recipient, _amount);
        _requestRefund(transferId);
        bytes memory unlockForFailed = encodeIssuingForUnlockFailureFromRemote(
            _originalToken,
            _originalSender,
            _recipient,
            _amount,
            _nonce
        );
        bytes32 messageId = _sendMessage(_remoteChainId, unlockForFailed, msg.value, _extParams);
        emit RemoteIssuingFailure(transferId, messageId, _originalToken, _originalSender, _amount, msg.value);
    }

    function encodeIssuingForUnlockFailureFromRemote(
        address _originalToken,
        address _originalSender,
        address _recipient,
        uint256 _amount,
        uint256 _nonce
    ) public view returns(bytes memory) {
        return abi.encodeWithSelector(
            IxTokenIssuing.handleIssuingForUnlockFailureFromRemote.selector,
            block.chainid,
            _originalToken,
            _originalSender,
            _recipient,
            _amount,
            _nonce
        );
    }

    // when lock and issuing failed
    // receive unlock(refund) message from remote issuing contract
    // this will refund original token to original sender
    // 1. the message is not refunded before
    // 2. the locked message exist and the information(hash) matched
    function handleUnlockForIssuingFailureFromRemote(
        uint256 _remoteChainId,
        address _originalToken,
        address _originalSender,
        address _recipient,
        uint256 _amount,
        uint256 _nonce
    ) external calledByMessager(_remoteChainId) whenNotPaused {
        bytes32 transferId = keccak256(abi.encodePacked(_nonce, _remoteChainId, _originalToken, _originalSender, _recipient, _amount));
        _handleRefund(transferId);
        if (_originalToken == address(0)) {
            TokenTransferHelper.safeTransferNative(_originalSender, _amount);
        } else {
            TokenTransferHelper.safeTransfer(_originalToken, _originalSender, _amount);
        }
        emit TokenUnlockedForFailed(transferId, _remoteChainId, _originalToken, _originalSender, _amount);
    }
}