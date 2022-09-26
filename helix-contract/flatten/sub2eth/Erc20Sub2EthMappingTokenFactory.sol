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
 * https://helixbridge.app/
 *
 * 9/24/2022
 **/

pragma solidity ^0.8.10;

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

// File contracts/mapping-token/interfaces/IBacking.sol
// License-Identifier: MIT


interface IBacking {
    function unlockFromRemote(
        address originalToken,
        address recipient,
        uint256 amount) external;
}

interface IBackingSupportNative {
    function unlockFromRemoteNative(
        address recipient,
        uint256 amount) external;
}

// File contracts/mapping-token/interfaces/IGuard.sol
// License-Identifier: MIT


interface IGuard {
  function deposit(uint256 id, address token, address recipient, uint256 amount) external;
}

// File contracts/mapping-token/interfaces/IHelixApp.sol
// License-Identifier: MIT


interface IHelixAppSupportWithdrawFailed {
    function handleUnlockFailureFromRemote(
        uint256 messageId,
        address token,
        address sender,
        uint256 amount
    ) external;
    function handleUnlockFailureFromRemoteNative(
        uint256 messageId,
        address sender,
        uint256 amount
    ) external;
    function handleIssuingFailureFromRemote(
        uint256 messageId,
        address token,
        address sender,
        uint256 amount
    ) external;
}

// File contracts/mapping-token/interfaces/IHelixMessageEndpoint.sol
// License-Identifier: MIT


interface IHelixMessageEndpoint {
    function sendMessage(address receiver, bytes calldata encoded) external payable returns (uint256);
}

// File contracts/mapping-token/interfaces/IHelixSub2EthMessageEndpoint.sol
// License-Identifier: MIT


interface IHelixSub2EthMessageEndpoint is IHelixMessageEndpoint {
    function fee() external view returns (uint256);
    function currentDeliveredMessageId() external view returns (uint256);
    function isMessageDelivered(uint256 messageId) external view returns (bool);
}

// File @zeppelin-solidity-4.4.0/contracts/access/IAccessControl.sol@v4.4.0-rc.0
// License-Identifier: MIT
// OpenZeppelin Contracts v4.4.0-rc.0 (access/IAccessControl.sol)


/**
 * @dev External interface of AccessControl declared to support ERC165 detection.
 */
interface IAccessControl {
    /**
     * @dev Emitted when `newAdminRole` is set as ``role``'s admin role, replacing `previousAdminRole`
     *
     * `DEFAULT_ADMIN_ROLE` is the starting admin for all roles, despite
     * {RoleAdminChanged} not being emitted signaling this.
     *
     * _Available since v3.1._
     */
    event RoleAdminChanged(bytes32 indexed role, bytes32 indexed previousAdminRole, bytes32 indexed newAdminRole);

    /**
     * @dev Emitted when `account` is granted `role`.
     *
     * `sender` is the account that originated the contract call, an admin role
     * bearer except when using {AccessControl-_setupRole}.
     */
    event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender);

    /**
     * @dev Emitted when `account` is revoked `role`.
     *
     * `sender` is the account that originated the contract call:
     *   - if using `revokeRole`, it is the admin role bearer
     *   - if using `renounceRole`, it is the role bearer (i.e. `account`)
     */
    event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender);

    /**
     * @dev Returns `true` if `account` has been granted `role`.
     */
    function hasRole(bytes32 role, address account) external view returns (bool);

    /**
     * @dev Returns the admin role that controls `role`. See {grantRole} and
     * {revokeRole}.
     *
     * To change a role's admin, use {AccessControl-_setRoleAdmin}.
     */
    function getRoleAdmin(bytes32 role) external view returns (bytes32);

    /**
     * @dev Grants `role` to `account`.
     *
     * If `account` had not been already granted `role`, emits a {RoleGranted}
     * event.
     *
     * Requirements:
     *
     * - the caller must have ``role``'s admin role.
     */
    function grantRole(bytes32 role, address account) external;

    /**
     * @dev Revokes `role` from `account`.
     *
     * If `account` had been granted `role`, emits a {RoleRevoked} event.
     *
     * Requirements:
     *
     * - the caller must have ``role``'s admin role.
     */
    function revokeRole(bytes32 role, address account) external;

    /**
     * @dev Revokes `role` from the calling account.
     *
     * Roles are often managed via {grantRole} and {revokeRole}: this function's
     * purpose is to provide a mechanism for accounts to lose their privileges
     * if they are compromised (such as when a trusted device is misplaced).
     *
     * If the calling account had been granted `role`, emits a {RoleRevoked}
     * event.
     *
     * Requirements:
     *
     * - the caller must be `account`.
     */
    function renounceRole(bytes32 role, address account) external;
}

// File @zeppelin-solidity-4.4.0/contracts/access/IAccessControlEnumerable.sol@v4.4.0-rc.0
// License-Identifier: MIT
// OpenZeppelin Contracts v4.4.0-rc.0 (access/IAccessControlEnumerable.sol)


/**
 * @dev External interface of AccessControlEnumerable declared to support ERC165 detection.
 */
interface IAccessControlEnumerable is IAccessControl {
    /**
     * @dev Returns one of the accounts that have `role`. `index` must be a
     * value between 0 and {getRoleMemberCount}, non-inclusive.
     *
     * Role bearers are not sorted in any particular way, and their ordering may
     * change at any point.
     *
     * WARNING: When using {getRoleMember} and {getRoleMemberCount}, make sure
     * you perform all queries on the same block. See the following
     * https://forum.openzeppelin.com/t/iterating-over-elements-on-enumerableset-in-openzeppelin-contracts/2296[forum post]
     * for more information.
     */
    function getRoleMember(bytes32 role, uint256 index) external view returns (address);

    /**
     * @dev Returns the number of accounts that have `role`. Can be used
     * together with {getRoleMember} to enumerate all bearers of a role.
     */
    function getRoleMemberCount(bytes32 role) external view returns (uint256);
}

// File @zeppelin-solidity-4.4.0/contracts/utils/structs/EnumerableSet.sol@v4.4.0-rc.0
// License-Identifier: MIT
// OpenZeppelin Contracts v4.4.0-rc.0 (utils/structs/EnumerableSet.sol)


/**
 * @dev Library for managing
 * https://en.wikipedia.org/wiki/Set_(abstract_data_type)[sets] of primitive
 * types.
 *
 * Sets have the following properties:
 *
 * - Elements are added, removed, and checked for existence in constant time
 * (O(1)).
 * - Elements are enumerated in O(n). No guarantees are made on the ordering.
 *
 * ```
 * contract Example {
 *     // Add the library methods
 *     using EnumerableSet for EnumerableSet.AddressSet;
 *
 *     // Declare a set state variable
 *     EnumerableSet.AddressSet private mySet;
 * }
 * ```
 *
 * As of v3.3.0, sets of type `bytes32` (`Bytes32Set`), `address` (`AddressSet`)
 * and `uint256` (`UintSet`) are supported.
 */
library EnumerableSet {
    // To implement this library for multiple types with as little code
    // repetition as possible, we write it in terms of a generic Set type with
    // bytes32 values.
    // The Set implementation uses private functions, and user-facing
    // implementations (such as AddressSet) are just wrappers around the
    // underlying Set.
    // This means that we can only create new EnumerableSets for types that fit
    // in bytes32.

    struct Set {
        // Storage of set values
        bytes32[] _values;
        // Position of the value in the `values` array, plus 1 because index 0
        // means a value is not in the set.
        mapping(bytes32 => uint256) _indexes;
    }

    /**
     * @dev Add a value to a set. O(1).
     *
     * Returns true if the value was added to the set, that is if it was not
     * already present.
     */
    function _add(Set storage set, bytes32 value) private returns (bool) {
        if (!_contains(set, value)) {
            set._values.push(value);
            // The value is stored at length-1, but we add 1 to all indexes
            // and use 0 as a sentinel value
            set._indexes[value] = set._values.length;
            return true;
        } else {
            return false;
        }
    }

    /**
     * @dev Removes a value from a set. O(1).
     *
     * Returns true if the value was removed from the set, that is if it was
     * present.
     */
    function _remove(Set storage set, bytes32 value) private returns (bool) {
        // We read and store the value's index to prevent multiple reads from the same storage slot
        uint256 valueIndex = set._indexes[value];

        if (valueIndex != 0) {
            // Equivalent to contains(set, value)
            // To delete an element from the _values array in O(1), we swap the element to delete with the last one in
            // the array, and then remove the last element (sometimes called as 'swap and pop').
            // This modifies the order of the array, as noted in {at}.

            uint256 toDeleteIndex = valueIndex - 1;
            uint256 lastIndex = set._values.length - 1;

            if (lastIndex != toDeleteIndex) {
                bytes32 lastvalue = set._values[lastIndex];

                // Move the last value to the index where the value to delete is
                set._values[toDeleteIndex] = lastvalue;
                // Update the index for the moved value
                set._indexes[lastvalue] = valueIndex; // Replace lastvalue's index to valueIndex
            }

            // Delete the slot where the moved value was stored
            set._values.pop();

            // Delete the index for the deleted slot
            delete set._indexes[value];

            return true;
        } else {
            return false;
        }
    }

    /**
     * @dev Returns true if the value is in the set. O(1).
     */
    function _contains(Set storage set, bytes32 value) private view returns (bool) {
        return set._indexes[value] != 0;
    }

    /**
     * @dev Returns the number of values on the set. O(1).
     */
    function _length(Set storage set) private view returns (uint256) {
        return set._values.length;
    }

    /**
     * @dev Returns the value stored at position `index` in the set. O(1).
     *
     * Note that there are no guarantees on the ordering of values inside the
     * array, and it may change when more values are added or removed.
     *
     * Requirements:
     *
     * - `index` must be strictly less than {length}.
     */
    function _at(Set storage set, uint256 index) private view returns (bytes32) {
        return set._values[index];
    }

    /**
     * @dev Return the entire set in an array
     *
     * WARNING: This operation will copy the entire storage to memory, which can be quite expensive. This is designed
     * to mostly be used by view accessors that are queried without any gas fees. Developers should keep in mind that
     * this function has an unbounded cost, and using it as part of a state-changing function may render the function
     * uncallable if the set grows to a point where copying to memory consumes too much gas to fit in a block.
     */
    function _values(Set storage set) private view returns (bytes32[] memory) {
        return set._values;
    }

    // Bytes32Set

    struct Bytes32Set {
        Set _inner;
    }

    /**
     * @dev Add a value to a set. O(1).
     *
     * Returns true if the value was added to the set, that is if it was not
     * already present.
     */
    function add(Bytes32Set storage set, bytes32 value) internal returns (bool) {
        return _add(set._inner, value);
    }

    /**
     * @dev Removes a value from a set. O(1).
     *
     * Returns true if the value was removed from the set, that is if it was
     * present.
     */
    function remove(Bytes32Set storage set, bytes32 value) internal returns (bool) {
        return _remove(set._inner, value);
    }

    /**
     * @dev Returns true if the value is in the set. O(1).
     */
    function contains(Bytes32Set storage set, bytes32 value) internal view returns (bool) {
        return _contains(set._inner, value);
    }

    /**
     * @dev Returns the number of values in the set. O(1).
     */
    function length(Bytes32Set storage set) internal view returns (uint256) {
        return _length(set._inner);
    }

    /**
     * @dev Returns the value stored at position `index` in the set. O(1).
     *
     * Note that there are no guarantees on the ordering of values inside the
     * array, and it may change when more values are added or removed.
     *
     * Requirements:
     *
     * - `index` must be strictly less than {length}.
     */
    function at(Bytes32Set storage set, uint256 index) internal view returns (bytes32) {
        return _at(set._inner, index);
    }

    /**
     * @dev Return the entire set in an array
     *
     * WARNING: This operation will copy the entire storage to memory, which can be quite expensive. This is designed
     * to mostly be used by view accessors that are queried without any gas fees. Developers should keep in mind that
     * this function has an unbounded cost, and using it as part of a state-changing function may render the function
     * uncallable if the set grows to a point where copying to memory consumes too much gas to fit in a block.
     */
    function values(Bytes32Set storage set) internal view returns (bytes32[] memory) {
        return _values(set._inner);
    }

    // AddressSet

    struct AddressSet {
        Set _inner;
    }

    /**
     * @dev Add a value to a set. O(1).
     *
     * Returns true if the value was added to the set, that is if it was not
     * already present.
     */
    function add(AddressSet storage set, address value) internal returns (bool) {
        return _add(set._inner, bytes32(uint256(uint160(value))));
    }

    /**
     * @dev Removes a value from a set. O(1).
     *
     * Returns true if the value was removed from the set, that is if it was
     * present.
     */
    function remove(AddressSet storage set, address value) internal returns (bool) {
        return _remove(set._inner, bytes32(uint256(uint160(value))));
    }

    /**
     * @dev Returns true if the value is in the set. O(1).
     */
    function contains(AddressSet storage set, address value) internal view returns (bool) {
        return _contains(set._inner, bytes32(uint256(uint160(value))));
    }

    /**
     * @dev Returns the number of values in the set. O(1).
     */
    function length(AddressSet storage set) internal view returns (uint256) {
        return _length(set._inner);
    }

    /**
     * @dev Returns the value stored at position `index` in the set. O(1).
     *
     * Note that there are no guarantees on the ordering of values inside the
     * array, and it may change when more values are added or removed.
     *
     * Requirements:
     *
     * - `index` must be strictly less than {length}.
     */
    function at(AddressSet storage set, uint256 index) internal view returns (address) {
        return address(uint160(uint256(_at(set._inner, index))));
    }

    /**
     * @dev Return the entire set in an array
     *
     * WARNING: This operation will copy the entire storage to memory, which can be quite expensive. This is designed
     * to mostly be used by view accessors that are queried without any gas fees. Developers should keep in mind that
     * this function has an unbounded cost, and using it as part of a state-changing function may render the function
     * uncallable if the set grows to a point where copying to memory consumes too much gas to fit in a block.
     */
    function values(AddressSet storage set) internal view returns (address[] memory) {
        bytes32[] memory store = _values(set._inner);
        address[] memory result;

        assembly {
            result := store
        }

        return result;
    }

    // UintSet

    struct UintSet {
        Set _inner;
    }

    /**
     * @dev Add a value to a set. O(1).
     *
     * Returns true if the value was added to the set, that is if it was not
     * already present.
     */
    function add(UintSet storage set, uint256 value) internal returns (bool) {
        return _add(set._inner, bytes32(value));
    }

    /**
     * @dev Removes a value from a set. O(1).
     *
     * Returns true if the value was removed from the set, that is if it was
     * present.
     */
    function remove(UintSet storage set, uint256 value) internal returns (bool) {
        return _remove(set._inner, bytes32(value));
    }

    /**
     * @dev Returns true if the value is in the set. O(1).
     */
    function contains(UintSet storage set, uint256 value) internal view returns (bool) {
        return _contains(set._inner, bytes32(value));
    }

    /**
     * @dev Returns the number of values on the set. O(1).
     */
    function length(UintSet storage set) internal view returns (uint256) {
        return _length(set._inner);
    }

    /**
     * @dev Returns the value stored at position `index` in the set. O(1).
     *
     * Note that there are no guarantees on the ordering of values inside the
     * array, and it may change when more values are added or removed.
     *
     * Requirements:
     *
     * - `index` must be strictly less than {length}.
     */
    function at(UintSet storage set, uint256 index) internal view returns (uint256) {
        return uint256(_at(set._inner, index));
    }

    /**
     * @dev Return the entire set in an array
     *
     * WARNING: This operation will copy the entire storage to memory, which can be quite expensive. This is designed
     * to mostly be used by view accessors that are queried without any gas fees. Developers should keep in mind that
     * this function has an unbounded cost, and using it as part of a state-changing function may render the function
     * uncallable if the set grows to a point where copying to memory consumes too much gas to fit in a block.
     */
    function values(UintSet storage set) internal view returns (uint256[] memory) {
        bytes32[] memory store = _values(set._inner);
        uint256[] memory result;

        assembly {
            result := store
        }

        return result;
    }
}

// File @zeppelin-solidity-4.4.0/contracts/utils/Context.sol@v4.4.0-rc.0
// License-Identifier: MIT
// OpenZeppelin Contracts v4.4.0-rc.0 (utils/Context.sol)


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

// File @zeppelin-solidity-4.4.0/contracts/utils/Strings.sol@v4.4.0-rc.0
// License-Identifier: MIT
// OpenZeppelin Contracts v4.4.0-rc.0 (utils/Strings.sol)


/**
 * @dev String operations.
 */
library Strings {
    bytes16 private constant _HEX_SYMBOLS = "0123456789abcdef";

    /**
     * @dev Converts a `uint256` to its ASCII `string` decimal representation.
     */
    function toString(uint256 value) internal pure returns (string memory) {
        // Inspired by OraclizeAPI's implementation - MIT licence
        // https://github.com/oraclize/ethereum-api/blob/b42146b063c7d6ee1358846c198246239e9360e8/oraclizeAPI_0.4.25.sol

        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    /**
     * @dev Converts a `uint256` to its ASCII `string` hexadecimal representation.
     */
    function toHexString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0x00";
        }
        uint256 temp = value;
        uint256 length = 0;
        while (temp != 0) {
            length++;
            temp >>= 8;
        }
        return toHexString(value, length);
    }

    /**
     * @dev Converts a `uint256` to its ASCII `string` hexadecimal representation with fixed length.
     */
    function toHexString(uint256 value, uint256 length) internal pure returns (string memory) {
        bytes memory buffer = new bytes(2 * length + 2);
        buffer[0] = "0";
        buffer[1] = "x";
        for (uint256 i = 2 * length + 1; i > 1; --i) {
            buffer[i] = _HEX_SYMBOLS[value & 0xf];
            value >>= 4;
        }
        require(value == 0, "Strings: hex length insufficient");
        return string(buffer);
    }
}

// File @zeppelin-solidity-4.4.0/contracts/utils/introspection/IERC165.sol@v4.4.0-rc.0
// License-Identifier: MIT
// OpenZeppelin Contracts v4.4.0-rc.0 (utils/introspection/IERC165.sol)


/**
 * @dev Interface of the ERC165 standard, as defined in the
 * https://eips.ethereum.org/EIPS/eip-165[EIP].
 *
 * Implementers can declare support of contract interfaces, which can then be
 * queried by others ({ERC165Checker}).
 *
 * For an implementation, see {ERC165}.
 */
interface IERC165 {
    /**
     * @dev Returns true if this contract implements the interface defined by
     * `interfaceId`. See the corresponding
     * https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified[EIP section]
     * to learn more about how these ids are created.
     *
     * This function call must use less than 30 000 gas.
     */
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

// File @zeppelin-solidity-4.4.0/contracts/utils/introspection/ERC165.sol@v4.4.0-rc.0
// License-Identifier: MIT
// OpenZeppelin Contracts v4.4.0-rc.0 (utils/introspection/ERC165.sol)


/**
 * @dev Implementation of the {IERC165} interface.
 *
 * Contracts that want to implement ERC165 should inherit from this contract and override {supportsInterface} to check
 * for the additional interface id that will be supported. For example:
 *
 * ```solidity
 * function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
 *     return interfaceId == type(MyInterface).interfaceId || super.supportsInterface(interfaceId);
 * }
 * ```
 *
 * Alternatively, {ERC165Storage} provides an easier to use but more expensive implementation.
 */
abstract contract ERC165 is IERC165 {
    /**
     * @dev See {IERC165-supportsInterface}.
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IERC165).interfaceId;
    }
}

// File @zeppelin-solidity-4.4.0/contracts/access/AccessControl.sol@v4.4.0-rc.0
// License-Identifier: MIT
// OpenZeppelin Contracts v4.4.0-rc.0 (access/AccessControl.sol)





/**
 * @dev Contract module that allows children to implement role-based access
 * control mechanisms. This is a lightweight version that doesn't allow enumerating role
 * members except through off-chain means by accessing the contract event logs. Some
 * applications may benefit from on-chain enumerability, for those cases see
 * {AccessControlEnumerable}.
 *
 * Roles are referred to by their `bytes32` identifier. These should be exposed
 * in the external API and be unique. The best way to achieve this is by
 * using `public constant` hash digests:
 *
 * ```
 * bytes32 public constant MY_ROLE = keccak256("MY_ROLE");
 * ```
 *
 * Roles can be used to represent a set of permissions. To restrict access to a
 * function call, use {hasRole}:
 *
 * ```
 * function foo() public {
 *     require(hasRole(MY_ROLE, msg.sender));
 *     ...
 * }
 * ```
 *
 * Roles can be granted and revoked dynamically via the {grantRole} and
 * {revokeRole} functions. Each role has an associated admin role, and only
 * accounts that have a role's admin role can call {grantRole} and {revokeRole}.
 *
 * By default, the admin role for all roles is `DEFAULT_ADMIN_ROLE`, which means
 * that only accounts with this role will be able to grant or revoke other
 * roles. More complex role relationships can be created by using
 * {_setRoleAdmin}.
 *
 * WARNING: The `DEFAULT_ADMIN_ROLE` is also its own admin: it has permission to
 * grant and revoke this role. Extra precautions should be taken to secure
 * accounts that have been granted it.
 */
abstract contract AccessControl is Context, IAccessControl, ERC165 {
    struct RoleData {
        mapping(address => bool) members;
        bytes32 adminRole;
    }

    mapping(bytes32 => RoleData) private _roles;

    bytes32 public constant DEFAULT_ADMIN_ROLE = 0x00;

    /**
     * @dev Modifier that checks that an account has a specific role. Reverts
     * with a standardized message including the required role.
     *
     * The format of the revert reason is given by the following regular expression:
     *
     *  /^AccessControl: account (0x[0-9a-f]{40}) is missing role (0x[0-9a-f]{64})$/
     *
     * _Available since v4.1._
     */
    modifier onlyRole(bytes32 role) {
        _checkRole(role, _msgSender());
        _;
    }

    /**
     * @dev See {IERC165-supportsInterface}.
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IAccessControl).interfaceId || super.supportsInterface(interfaceId);
    }

    /**
     * @dev Returns `true` if `account` has been granted `role`.
     */
    function hasRole(bytes32 role, address account) public view override returns (bool) {
        return _roles[role].members[account];
    }

    /**
     * @dev Revert with a standard message if `account` is missing `role`.
     *
     * The format of the revert reason is given by the following regular expression:
     *
     *  /^AccessControl: account (0x[0-9a-f]{40}) is missing role (0x[0-9a-f]{64})$/
     */
    function _checkRole(bytes32 role, address account) internal view {
        if (!hasRole(role, account)) {
            revert(
                string(
                    abi.encodePacked(
                        "AccessControl: account ",
                        Strings.toHexString(uint160(account), 20),
                        " is missing role ",
                        Strings.toHexString(uint256(role), 32)
                    )
                )
            );
        }
    }

    /**
     * @dev Returns the admin role that controls `role`. See {grantRole} and
     * {revokeRole}.
     *
     * To change a role's admin, use {_setRoleAdmin}.
     */
    function getRoleAdmin(bytes32 role) public view override returns (bytes32) {
        return _roles[role].adminRole;
    }

    /**
     * @dev Grants `role` to `account`.
     *
     * If `account` had not been already granted `role`, emits a {RoleGranted}
     * event.
     *
     * Requirements:
     *
     * - the caller must have ``role``'s admin role.
     */
    function grantRole(bytes32 role, address account) public virtual override onlyRole(getRoleAdmin(role)) {
        _grantRole(role, account);
    }

    /**
     * @dev Revokes `role` from `account`.
     *
     * If `account` had been granted `role`, emits a {RoleRevoked} event.
     *
     * Requirements:
     *
     * - the caller must have ``role``'s admin role.
     */
    function revokeRole(bytes32 role, address account) public virtual override onlyRole(getRoleAdmin(role)) {
        _revokeRole(role, account);
    }

    /**
     * @dev Revokes `role` from the calling account.
     *
     * Roles are often managed via {grantRole} and {revokeRole}: this function's
     * purpose is to provide a mechanism for accounts to lose their privileges
     * if they are compromised (such as when a trusted device is misplaced).
     *
     * If the calling account had been revoked `role`, emits a {RoleRevoked}
     * event.
     *
     * Requirements:
     *
     * - the caller must be `account`.
     */
    function renounceRole(bytes32 role, address account) public virtual override {
        require(account == _msgSender(), "AccessControl: can only renounce roles for self");

        _revokeRole(role, account);
    }

    /**
     * @dev Grants `role` to `account`.
     *
     * If `account` had not been already granted `role`, emits a {RoleGranted}
     * event. Note that unlike {grantRole}, this function doesn't perform any
     * checks on the calling account.
     *
     * [WARNING]
     * ====
     * This function should only be called from the constructor when setting
     * up the initial roles for the system.
     *
     * Using this function in any other way is effectively circumventing the admin
     * system imposed by {AccessControl}.
     * ====
     *
     * NOTE: This function is deprecated in favor of {_grantRole}.
     */
    function _setupRole(bytes32 role, address account) internal virtual {
        _grantRole(role, account);
    }

    /**
     * @dev Sets `adminRole` as ``role``'s admin role.
     *
     * Emits a {RoleAdminChanged} event.
     */
    function _setRoleAdmin(bytes32 role, bytes32 adminRole) internal virtual {
        bytes32 previousAdminRole = getRoleAdmin(role);
        _roles[role].adminRole = adminRole;
        emit RoleAdminChanged(role, previousAdminRole, adminRole);
    }

    /**
     * @dev Grants `role` to `account`.
     *
     * Internal function without access restriction.
     */
    function _grantRole(bytes32 role, address account) internal virtual {
        if (!hasRole(role, account)) {
            _roles[role].members[account] = true;
            emit RoleGranted(role, account, _msgSender());
        }
    }

    /**
     * @dev Revokes `role` from `account`.
     *
     * Internal function without access restriction.
     */
    function _revokeRole(bytes32 role, address account) internal virtual {
        if (hasRole(role, account)) {
            _roles[role].members[account] = false;
            emit RoleRevoked(role, account, _msgSender());
        }
    }
}

// File @zeppelin-solidity-4.4.0/contracts/access/AccessControlEnumerable.sol@v4.4.0-rc.0
// License-Identifier: MIT
// OpenZeppelin Contracts v4.4.0-rc.0 (access/AccessControlEnumerable.sol)




/**
 * @dev Extension of {AccessControl} that allows enumerating the members of each role.
 */
abstract contract AccessControlEnumerable is IAccessControlEnumerable, AccessControl {
    using EnumerableSet for EnumerableSet.AddressSet;

    mapping(bytes32 => EnumerableSet.AddressSet) private _roleMembers;

    /**
     * @dev See {IERC165-supportsInterface}.
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IAccessControlEnumerable).interfaceId || super.supportsInterface(interfaceId);
    }

    /**
     * @dev Returns one of the accounts that have `role`. `index` must be a
     * value between 0 and {getRoleMemberCount}, non-inclusive.
     *
     * Role bearers are not sorted in any particular way, and their ordering may
     * change at any point.
     *
     * WARNING: When using {getRoleMember} and {getRoleMemberCount}, make sure
     * you perform all queries on the same block. See the following
     * https://forum.openzeppelin.com/t/iterating-over-elements-on-enumerableset-in-openzeppelin-contracts/2296[forum post]
     * for more information.
     */
    function getRoleMember(bytes32 role, uint256 index) public view override returns (address) {
        return _roleMembers[role].at(index);
    }

    /**
     * @dev Returns the number of accounts that have `role`. Can be used
     * together with {getRoleMember} to enumerate all bearers of a role.
     */
    function getRoleMemberCount(bytes32 role) public view override returns (uint256) {
        return _roleMembers[role].length();
    }

    /**
     * @dev Overload {grantRole} to track enumerable memberships
     */
    function grantRole(bytes32 role, address account) public virtual override(AccessControl, IAccessControl) {
        super.grantRole(role, account);
        _roleMembers[role].add(account);
    }

    /**
     * @dev Overload {revokeRole} to track enumerable memberships
     */
    function revokeRole(bytes32 role, address account) public virtual override(AccessControl, IAccessControl) {
        super.revokeRole(role, account);
        _roleMembers[role].remove(account);
    }

    /**
     * @dev Overload {renounceRole} to track enumerable memberships
     */
    function renounceRole(bytes32 role, address account) public virtual override(AccessControl, IAccessControl) {
        super.renounceRole(role, account);
        _roleMembers[role].remove(account);
    }

    /**
     * @dev Overload {_setupRole} to track enumerable memberships
     */
    function _setupRole(bytes32 role, address account) internal virtual override {
        super._setupRole(role, account);
        _roleMembers[role].add(account);
    }
}

// File @zeppelin-solidity-4.4.0/contracts/security/Pausable.sol@v4.4.0-rc.0
// License-Identifier: MIT
// OpenZeppelin Contracts v4.4.0-rc.0 (security/Pausable.sol)


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
     * @dev Returns true if the contract is paused, and false otherwise.
     */
    function paused() public view virtual returns (bool) {
        return _paused;
    }

    /**
     * @dev Modifier to make a function callable only when the contract is not paused.
     *
     * Requirements:
     *
     * - The contract must not be paused.
     */
    modifier whenNotPaused() {
        require(!paused(), "Pausable: paused");
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
        require(paused(), "Pausable: not paused");
        _;
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

// File contracts/mapping-token/v2/AccessController.sol
// License-Identifier: MIT


contract AccessController is AccessControlEnumerable, Pausable {
    bytes32 public constant DAO_ADMIN_ROLE = keccak256("DAO_ADMIN_ROLE");
    bytes32 public constant OPERATOR_ROLE  = keccak256("OPERATOR_ROLE");
    bytes32 public constant CALLER_ROLE    = keccak256("CALLER_ROLE");
    bytes32 public constant CALLEE_ROLE  = keccak256("CALLEE_ROLE");

    // access controller
    // admin is helix Dao
    modifier onlyAdmin() {
        require(hasRole(DAO_ADMIN_ROLE, msg.sender), "AccessController:Bad admin role");
        _;
    }

    // operator
    modifier onlyOperator() {
        require(hasRole(OPERATOR_ROLE, msg.sender), "AccessController:Bad operator role");
        _;
    }

    modifier onlyCaller() {
        require(hasRole(CALLER_ROLE, msg.sender), "AccessController:Bad caller role");
        _;
    }

    modifier onlyCallee() {
        require(hasRole(CALLEE_ROLE, msg.sender), "AccessController:Bad callee role");
        _;
    }

    function _initialize(address admin) internal {
        _setRoleAdmin(CALLER_ROLE, DAO_ADMIN_ROLE);
        _setRoleAdmin(CALLEE_ROLE, DAO_ADMIN_ROLE);
        _setRoleAdmin(OPERATOR_ROLE, DAO_ADMIN_ROLE);
        _setRoleAdmin(DAO_ADMIN_ROLE, DAO_ADMIN_ROLE);
        _setupRole(DAO_ADMIN_ROLE, admin);
    }

    function unpause() external onlyOperator {
        _unpause();
    }

    function pause() external onlyOperator {
        _pause();
    }
}

// File @zeppelin-solidity-4.4.0/contracts/proxy/utils/Initializable.sol@v4.4.0-rc.0
// License-Identifier: MIT
// OpenZeppelin Contracts v4.4.0-rc.0 (proxy/utils/Initializable.sol)


/**
 * @dev This is a base contract to aid in writing upgradeable contracts, or any kind of contract that will be deployed
 * behind a proxy. Since a proxied contract can't have a constructor, it's common to move constructor logic to an
 * external initializer function, usually called `initialize`. It then becomes necessary to protect this initializer
 * function so it can only be called once. The {initializer} modifier provided by this contract will have this effect.
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
 * contract, which may impact the proxy. To initialize the implementation contract, you can either invoke the
 * initializer manually, or you can include a constructor to automatically mark it as initialized when it is deployed:
 *
 * [.hljs-theme-light.nopadding]
 * ```
 * /// @custom:oz-upgrades-unsafe-allow constructor
 * constructor() initializer {}
 * ```
 * ====
 */
abstract contract Initializable {
    /**
     * @dev Indicates that the contract has been initialized.
     */
    bool private _initialized;

    /**
     * @dev Indicates that the contract is in the process of being initialized.
     */
    bool private _initializing;

    /**
     * @dev Modifier to protect an initializer function from being invoked twice.
     */
    modifier initializer() {
        require(_initializing || !_initialized, "Initializable: contract is already initialized");

        bool isTopLevelCall = !_initializing;
        if (isTopLevelCall) {
            _initializing = true;
            _initialized = true;
        }

        _;

        if (isTopLevelCall) {
            _initializing = false;
        }
    }
}

// File @zeppelin-solidity-4.4.0/contracts/access/Ownable.sol@v4.4.0-rc.0
// License-Identifier: MIT
// OpenZeppelin Contracts v4.4.0-rc.0 (access/Ownable.sol)


/**
 * @dev Contract module which provides a basic access control mechanism, where
 * there is an account (an owner) that can be granted exclusive access to
 * specific functions.
 *
 * By default, the owner account will be the one that deploys the contract. This
 * can later be changed with {transferOwnership}.
 *
 * This module is used through inheritance. It will make available the modifier
 * `onlyOwner`, which can be applied to your functions to restrict their use to
 * the owner.
 */
abstract contract Ownable is Context {
    address private _owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /**
     * @dev Initializes the contract setting the deployer as the initial owner.
     */
    constructor() {
        _transferOwnership(_msgSender());
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view virtual returns (address) {
        return _owner;
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        require(owner() == _msgSender(), "Ownable: caller is not the owner");
        _;
    }

    /**
     * @dev Leaves the contract without owner. It will not be possible to call
     * `onlyOwner` functions anymore. Can only be called by the current owner.
     *
     * NOTE: Renouncing ownership will leave the contract without an owner,
     * thereby removing any functionality that is only available to the owner.
     */
    function renounceOwnership() public virtual onlyOwner {
        _transferOwnership(address(0));
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public virtual onlyOwner {
        require(newOwner != address(0), "Ownable: new owner is the zero address");
        _transferOwnership(newOwner);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Internal function without access restriction.
     */
    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}

// File contracts/mapping-token/v2/MappingTokenFactory.sol
// License-Identifier: MIT
// This is the Issuing Module(Mapping-token-factory) of the ethereum like bridge.
// We trust the inboundLane/outboundLane when we add them to the module.
// It means that each message from the inboundLane is verified correct and truthly from the sourceAccount.
// Only we need is to verify the sourceAccount is expected. And we add it to the Filter.



contract MappingTokenFactory is AccessController, Initializable {
    address[] public allMappingTokens;
    // salt=>mappingToken, the salt is derived from origin token on backing chain
    // so this is a mapping from origin to mapping token
    mapping(bytes32 => address) public salt2MappingToken;
    // mappingToken=>info the info is the original token info
    // so this is a mapping from mappingToken to original token
    mapping(address => address) public mappingToken2OriginalToken;

    address public messageEndpoint;
    address public remoteBacking;

    uint256 internal locked;
    modifier nonReentrant {
        require(locked == 0, "MappingTokenFactory: locked");
        locked = 1;
        _;
        locked = 0;
    }

    modifier onlyMessageEndpoint() {
        require(messageEndpoint == msg.sender, "MappingTokenFactory:Bad message handle");
        _;
    }

    function initialize(address _messageEndpoint) public initializer {
        _setMessageEndpoint(_messageEndpoint);
        _initialize(msg.sender);
    }

    function _setMessageEndpoint(address _messageEndpoint) internal {
        messageEndpoint = _messageEndpoint;
    }

    function setRemoteBacking(address _remoteBacking) external onlyAdmin {
        remoteBacking = _remoteBacking;
    }

    function _transferMappingTokenOwnership(address mappingToken, address new_owner) internal {
        Ownable(mappingToken).transferOwnership(new_owner);
    }

    /**
     * @notice add mapping-token address by owner
     * @param salt the salt of the mapping token deployed
     * @param originalToken the original token address
     * @param mappingToken the mapping token address
     */
    function _addMappingToken(
        bytes32 salt,
        address originalToken,
        address mappingToken
    ) internal {
        // save the mapping tokens in an array so it can be listed
        allMappingTokens.push(mappingToken);
        // map the originToken to mappingInfo
        salt2MappingToken[salt] = mappingToken;
        // map the mappingToken to origin info
        mappingToken2OriginalToken[mappingToken] = originalToken;
    }

    // internal
    function _deploy(bytes32 salt, bytes memory bytecodeWithInitdata) internal returns (address addr) {
        assembly {
            addr := create2(0, add(bytecodeWithInitdata, 0x20), mload(bytecodeWithInitdata), salt)
            if iszero(extcodesize(addr)) { revert(0, 0) }
        }
    }

    function tokenLength() public view returns (uint) {
        return allMappingTokens.length;
    }

    function getMappingToken(address backingAddress, address originalToken) public view returns (address) {
        bytes32 salt = keccak256(abi.encodePacked(backingAddress, originalToken));
        return salt2MappingToken[salt];
    }
}

// File @zeppelin-solidity-4.4.0/contracts/token/ERC20/IERC20.sol@v4.4.0-rc.0
// License-Identifier: MIT
// OpenZeppelin Contracts v4.4.0-rc.0 (token/ERC20/IERC20.sol)


/**
 * @dev Interface of the ERC20 standard as defined in the EIP.
 */
interface IERC20 {
    /**
     * @dev Returns the amount of tokens in existence.
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns the amount of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev Moves `amount` tokens from the caller's account to `recipient`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address recipient, uint256 amount) external returns (bool);

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
     * @dev Moves `amount` tokens from `sender` to `recipient` using the
     * allowance mechanism. `amount` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool);

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
}

// File @zeppelin-solidity-4.4.0/contracts/utils/math/SafeMath.sol@v4.4.0-rc.0
// License-Identifier: MIT
// OpenZeppelin Contracts v4.4.0-rc.0 (utils/math/SafeMath.sol)


// CAUTION
// This version of SafeMath should only be used with Solidity 0.8 or later,
// because it relies on the compiler's built in overflow checks.

/**
 * @dev Wrappers over Solidity's arithmetic operations.
 *
 * NOTE: `SafeMath` is generally not needed starting with Solidity 0.8, since the compiler
 * now has built in overflow checking.
 */
library SafeMath {
    /**
     * @dev Returns the addition of two unsigned integers, with an overflow flag.
     *
     * _Available since v3.4._
     */
    function tryAdd(uint256 a, uint256 b) internal pure returns (bool, uint256) {
        unchecked {
            uint256 c = a + b;
            if (c < a) return (false, 0);
            return (true, c);
        }
    }

    /**
     * @dev Returns the substraction of two unsigned integers, with an overflow flag.
     *
     * _Available since v3.4._
     */
    function trySub(uint256 a, uint256 b) internal pure returns (bool, uint256) {
        unchecked {
            if (b > a) return (false, 0);
            return (true, a - b);
        }
    }

    /**
     * @dev Returns the multiplication of two unsigned integers, with an overflow flag.
     *
     * _Available since v3.4._
     */
    function tryMul(uint256 a, uint256 b) internal pure returns (bool, uint256) {
        unchecked {
            // Gas optimization: this is cheaper than requiring 'a' not being zero, but the
            // benefit is lost if 'b' is also tested.
            // See: https://github.com/OpenZeppelin/openzeppelin-contracts/pull/522
            if (a == 0) return (true, 0);
            uint256 c = a * b;
            if (c / a != b) return (false, 0);
            return (true, c);
        }
    }

    /**
     * @dev Returns the division of two unsigned integers, with a division by zero flag.
     *
     * _Available since v3.4._
     */
    function tryDiv(uint256 a, uint256 b) internal pure returns (bool, uint256) {
        unchecked {
            if (b == 0) return (false, 0);
            return (true, a / b);
        }
    }

    /**
     * @dev Returns the remainder of dividing two unsigned integers, with a division by zero flag.
     *
     * _Available since v3.4._
     */
    function tryMod(uint256 a, uint256 b) internal pure returns (bool, uint256) {
        unchecked {
            if (b == 0) return (false, 0);
            return (true, a % b);
        }
    }

    /**
     * @dev Returns the addition of two unsigned integers, reverting on
     * overflow.
     *
     * Counterpart to Solidity's `+` operator.
     *
     * Requirements:
     *
     * - Addition cannot overflow.
     */
    function add(uint256 a, uint256 b) internal pure returns (uint256) {
        return a + b;
    }

    /**
     * @dev Returns the subtraction of two unsigned integers, reverting on
     * overflow (when the result is negative).
     *
     * Counterpart to Solidity's `-` operator.
     *
     * Requirements:
     *
     * - Subtraction cannot overflow.
     */
    function sub(uint256 a, uint256 b) internal pure returns (uint256) {
        return a - b;
    }

    /**
     * @dev Returns the multiplication of two unsigned integers, reverting on
     * overflow.
     *
     * Counterpart to Solidity's `*` operator.
     *
     * Requirements:
     *
     * - Multiplication cannot overflow.
     */
    function mul(uint256 a, uint256 b) internal pure returns (uint256) {
        return a * b;
    }

    /**
     * @dev Returns the integer division of two unsigned integers, reverting on
     * division by zero. The result is rounded towards zero.
     *
     * Counterpart to Solidity's `/` operator.
     *
     * Requirements:
     *
     * - The divisor cannot be zero.
     */
    function div(uint256 a, uint256 b) internal pure returns (uint256) {
        return a / b;
    }

    /**
     * @dev Returns the remainder of dividing two unsigned integers. (unsigned integer modulo),
     * reverting when dividing by zero.
     *
     * Counterpart to Solidity's `%` operator. This function uses a `revert`
     * opcode (which leaves remaining gas untouched) while Solidity uses an
     * invalid opcode to revert (consuming all remaining gas).
     *
     * Requirements:
     *
     * - The divisor cannot be zero.
     */
    function mod(uint256 a, uint256 b) internal pure returns (uint256) {
        return a % b;
    }

    /**
     * @dev Returns the subtraction of two unsigned integers, reverting with custom message on
     * overflow (when the result is negative).
     *
     * CAUTION: This function is deprecated because it requires allocating memory for the error
     * message unnecessarily. For custom revert reasons use {trySub}.
     *
     * Counterpart to Solidity's `-` operator.
     *
     * Requirements:
     *
     * - Subtraction cannot overflow.
     */
    function sub(
        uint256 a,
        uint256 b,
        string memory errorMessage
    ) internal pure returns (uint256) {
        unchecked {
            require(b <= a, errorMessage);
            return a - b;
        }
    }

    /**
     * @dev Returns the integer division of two unsigned integers, reverting with custom message on
     * division by zero. The result is rounded towards zero.
     *
     * Counterpart to Solidity's `/` operator. Note: this function uses a
     * `revert` opcode (which leaves remaining gas untouched) while Solidity
     * uses an invalid opcode to revert (consuming all remaining gas).
     *
     * Requirements:
     *
     * - The divisor cannot be zero.
     */
    function div(
        uint256 a,
        uint256 b,
        string memory errorMessage
    ) internal pure returns (uint256) {
        unchecked {
            require(b > 0, errorMessage);
            return a / b;
        }
    }

    /**
     * @dev Returns the remainder of dividing two unsigned integers. (unsigned integer modulo),
     * reverting with custom message when dividing by zero.
     *
     * CAUTION: This function is deprecated because it requires allocating memory for the error
     * message unnecessarily. For custom revert reasons use {tryMod}.
     *
     * Counterpart to Solidity's `%` operator. This function uses a `revert`
     * opcode (which leaves remaining gas untouched) while Solidity uses an
     * invalid opcode to revert (consuming all remaining gas).
     *
     * Requirements:
     *
     * - The divisor cannot be zero.
     */
    function mod(
        uint256 a,
        uint256 b,
        string memory errorMessage
    ) internal pure returns (uint256) {
        unchecked {
            require(b > 0, errorMessage);
            return a % b;
        }
    }
}

// File contracts/mapping-token/v2/erc20-mapping-protocol/Erc20.sol
// License-Identifier: MIT



contract Erc20 is IERC20, Ownable {
    using SafeMath for uint256;

    mapping (address => uint256) private _balances;

    mapping (address => mapping (address => uint256)) private _allowances;

    uint256 private _totalSupply;

    string public name;
    string public symbol;
    uint8 public decimals;

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
        _transferOwnership(_msgSender());
    }

    function totalSupply() public view override returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) public view override returns (uint256) {
        return _balances[account];
    }

    function transfer(address recipient, uint256 amount) public virtual override returns (bool) {
        _transfer(msg.sender, recipient, amount);
        return true;
    }

    function allowance(address owner, address spender) public view virtual override returns (uint256) {
        return _allowances[owner][spender];
    }

    function approve(address spender, uint256 amount) public virtual override returns (bool) {
        _approve(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount) public virtual override returns (bool) {
        _transfer(sender, recipient, amount);
        _approve(sender, msg.sender, _allowances[sender][msg.sender].sub(amount, "ERC20: transfer amount exceeds allowance"));
        return true;
    }

    function increaseAllowance(address spender, uint256 addedValue) public virtual returns (bool) {
        _approve(msg.sender, spender, _allowances[msg.sender][spender].add(addedValue));
        return true;
    }

    function decreaseAllowance(address spender, uint256 subtractedValue) public virtual returns (bool) {
        _approve(msg.sender, spender, _allowances[msg.sender][spender].sub(subtractedValue, "ERC20: decreased allowance below zero"));
        return true;
    }

    function _transfer(address sender, address recipient, uint256 amount) internal virtual {
        require(sender != address(0), "ERC20: transfer from the zero address");
        require(recipient != address(0), "ERC20: transfer to the zero address");

        _beforeTokenTransfer(sender, recipient, amount);

        _balances[sender] = _balances[sender].sub(amount, "ERC20: transfer amount exceeds balance");
        _balances[recipient] = _balances[recipient].add(amount);
        emit Transfer(sender, recipient, amount);
    }

    // only factory contract can mint with the lock proof from ethereum
    function mint(address account, uint256 amount) external onlyOwner {
        _mint(account, amount);
    }

    function burn(address account, uint256 amount) external {
        if (account != msg.sender && owner() != msg.sender && _allowances[account][msg.sender] != type(uint256).max) {
            _approve(account, msg.sender, _allowances[account][msg.sender].sub(amount, "ERC20: decreased allowance below zero"));
        }
        _burn(account, amount);
    }

    function _mint(address account, uint256 amount) internal virtual {
        require(account != address(0), "ERC20: mint to the zero address");

        _beforeTokenTransfer(address(0), account, amount);

        _totalSupply = _totalSupply.add(amount);
        _balances[account] = _balances[account].add(amount);
        emit Transfer(address(0), account, amount);
    }

    function _burn(address account, uint256 amount) internal virtual {
        require(account != address(0), "ERC20: burn from the zero address");

        _beforeTokenTransfer(account, address(0), amount);

        _balances[account] = _balances[account].sub(amount, "ERC20: burn amount exceeds balance");
        _totalSupply = _totalSupply.sub(amount);
        emit Transfer(account, address(0), amount);
    }

    function _approve(address owner, address spender, uint256 amount) internal virtual {
        require(owner != address(0), "ERC20: approve from the zero address");
        require(spender != address(0), "ERC20: approve to the zero address");

        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }

    function _beforeTokenTransfer(address from, address to, uint256 amount) internal virtual { }
}

// File @zeppelin-solidity-4.4.0/contracts/utils/structs/BitMaps.sol@v4.4.0-rc.0
// License-Identifier: MIT
// OpenZeppelin Contracts v4.4.0-rc.0 (utils/structs/BitMaps.sol)

/**
 * @dev Library for managing uint256 to bool mapping in a compact and efficient way, providing the keys are sequential.
 * Largelly inspired by Uniswap's https://github.com/Uniswap/merkle-distributor/blob/master/contracts/MerkleDistributor.sol[merkle-distributor].
 */
library BitMaps {
    struct BitMap {
        mapping(uint256 => uint256) _data;
    }

    /**
     * @dev Returns whether the bit at `index` is set.
     */
    function get(BitMap storage bitmap, uint256 index) internal view returns (bool) {
        uint256 bucket = index >> 8;
        uint256 mask = 1 << (index & 0xff);
        return bitmap._data[bucket] & mask != 0;
    }

    /**
     * @dev Sets the bit at `index` to the boolean `value`.
     */
    function setTo(
        BitMap storage bitmap,
        uint256 index,
        bool value
    ) internal {
        if (value) {
            set(bitmap, index);
        } else {
            unset(bitmap, index);
        }
    }

    /**
     * @dev Sets the bit at `index`.
     */
    function set(BitMap storage bitmap, uint256 index) internal {
        uint256 bucket = index >> 8;
        uint256 mask = 1 << (index & 0xff);
        bitmap._data[bucket] |= mask;
    }

    /**
     * @dev Unsets the bit at `index`.
     */
    function unset(BitMap storage bitmap, uint256 index) internal {
        uint256 bucket = index >> 8;
        uint256 mask = 1 << (index & 0xff);
        bitmap._data[bucket] &= ~mask;
    }
}

// File contracts/mapping-token/v2/erc20-mapping-protocol/Erc20Sub2EthMappingTokenFactory.sol
// License-Identifier: MIT
// This is the Issuing Module(Mapping-token-factory) of the ethereum like bridge.
// We trust the inboundLane/outboundLane when we add them to the module.
// It means that each message from the inboundLane is verified correct and truthly from the sourceAccount.
// Only we need is to verify the sourceAccount is expected. And we add it to the Filter.








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
    event RemoteUnlockFailure(uint256 refundId, uint256 transferId, address originalToken, address originalSender, uint256 amount, uint256 fee);

    receive() external payable {}

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
        expendDailyLimit(mappingToken, amount);
        require(BitMaps.get(issueMessages, transferId) == false, "MappingTokenFactory:message has been accepted");
        BitMaps.set(issueMessages, transferId);
        if (guard != address(0)) {
            Erc20(mappingToken).mint(address(this), amount);
            uint allowance = IERC20(mappingToken).allowance(address(this), guard);
            require(IERC20(mappingToken).approve(guard, allowance + amount), "Backing:approve token transfer to guard failed");
            IGuard(guard).deposit(transferId, mappingToken, recipient, amount);
        } else {
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
        (uint256 refundId, uint256 fee) = _sendMessage(handleUnlockForFailed);
        emit RemoteUnlockFailure(refundId, transferId, originalToken, originalSender, amount, fee);
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
        (uint256 refundId, uint256 fee) = _sendMessage(handleUnlockForFailedNative);
        emit RemoteUnlockFailure(refundId, transferId, xwToken, originalSender, amount, fee);
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