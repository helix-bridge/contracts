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
 * 3/25/2024
 **/

pragma solidity ^0.8.17;

// File contracts/xtoken/v3/interfaces/IXTokenIssuing.sol
// License-Identifier: MIT

interface IXTokenIssuing {
    function burnAndXUnlock(
        address xToken,
        address recipient,
        address rollbackAccount,
        uint256 amount,
        uint256 nonce,
        bytes calldata extData,
        bytes memory extParams
    ) external payable returns(bytes32);

    function rollbackBurnAndXUnlock(
        uint256 originalChainId,
        address originalToken,
        address originalSender,
        address recipient,
        address rollbackAccount,
        uint256 amount,
        uint256 nonce
    ) external;

    function issue(
        uint256 remoteChainId,
        address originalToken,
        address originalSender,
        address recipient,
        address rollbackAccount,
        uint256 amount,
        uint256 nonce,
        bytes calldata extData
    ) external;

    function guard() external returns(address);
}

// File contracts/xtoken/v3/interfaces/IXTokenCallback.sol
// License-Identifier: MIT

interface IXTokenCallback {
    function xTokenCallback(
        uint256 transferId,
        address xToken,
        uint256 amount,
        bytes calldata extData
    ) external;
}

interface IXTokenRollbackCallback {
    function xTokenRollbackCallback(
        uint256 transferId,
        address token,
        uint256 amount
    ) external;
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

// File contracts/xtoken/v3/templates/interfaces/IXRINGLockBox.sol
// License-Identifier: MIT

interface IXRINGLockBox {
    function depositFor(address to, uint256 amount) external;
    function withdraw(uint256 amount) external;
}

// File @zeppelin-solidity/contracts/utils/introspection/IERC165.sol@v4.7.3
// License-Identifier: MIT
// OpenZeppelin Contracts v4.4.1 (utils/introspection/IERC165.sol)


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

// File @zeppelin-solidity/contracts/utils/introspection/ERC165.sol@v4.7.3
// License-Identifier: MIT
// OpenZeppelin Contracts v4.4.1 (utils/introspection/ERC165.sol)


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

// File contracts/xtoken/v3/templates/XRingConvertor.sol
// License-Identifier: Apache-2.0






contract XRingConvertor is IXTokenCallback, IXTokenRollbackCallback, ERC165 {
    IXRINGLockBox public lockBox;
    IXTokenIssuing public xTokenIssuing;
    address public immutable RING;
    address public immutable XRING;

    mapping(uint256=>address) public senders;

    event IssueRing(uint256 transferId, address recipient, uint256 amount);
    event RollbackBurn(uint256 transferId, address originalSender, uint256 amount);
    event BurnAndXUnlock(uint256 transferId, address sender, address recipient, uint256 amount);

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165) returns (bool) {
        return
            interfaceId == type(IXTokenCallback).interfaceId ||
            interfaceId == type(IXTokenRollbackCallback).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    receive() external payable {}

    modifier onlyXTokenIssuing() {
        require(address(xTokenIssuing) == msg.sender, "invalid sender");
        _;
    }

    modifier onlyXTokenIssuingAuthorized() {
        require(address(xTokenIssuing) == msg.sender || xTokenIssuing.guard() == msg.sender, "invalid sender");
        _;
    }

    constructor(address _xRing, address _ring, address _xTokenIssuing, address _lockBox) {
        RING = _ring;
        XRING = _xRing;
        lockBox = IXRINGLockBox(_lockBox);
        xTokenIssuing = IXTokenIssuing(_xTokenIssuing);
        IERC20(_ring).approve(_lockBox, type(uint256).max);
        IERC20(_xRing).approve(_lockBox, type(uint256).max);
        IERC20(_xRing).approve(_xTokenIssuing, type(uint256).max);
    }

    function xTokenCallback(
        uint256 _transferId,
        address _xToken,
        uint256 _amount,
        bytes calldata extData
    ) onlyXTokenIssuingAuthorized external {
        address recipient = address(bytes20(extData));
        require(_xToken == XRING, "invalid xtoken");
        lockBox.depositFor(recipient, _amount);
        emit IssueRing(_transferId, recipient, _amount);
    }

    function xTokenRollbackCallback(
        uint256 _transferId,
        address _xToken,
        uint256 _amount
    ) onlyXTokenIssuing external {
        require(_xToken == XRING, "invalid xtoken");
        address originalSender = senders[_transferId];
        lockBox.depositFor(originalSender, _amount);
        emit RollbackBurn(_transferId, originalSender, _amount);
    }

    function burnAndXUnlock(
        address _recipient,
        address _rollbackAccount,
        uint256 _amount,
        uint256 _nonce,
        bytes calldata _extData,
        bytes memory _extParams
    ) payable external {
        IERC20(RING).transferFrom(msg.sender, address(this), _amount);
        lockBox.withdraw(_amount);
        bytes32 transferId = xTokenIssuing.burnAndXUnlock{value: msg.value}(XRING, _recipient, _rollbackAccount, _amount, _nonce, _extData, _extParams);
        uint256 id = uint256(transferId);
        senders[id] = msg.sender;
        emit BurnAndXUnlock(id, msg.sender, _recipient, _amount);
    }
}