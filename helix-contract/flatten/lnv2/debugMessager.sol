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
 * 10/18/2023
 **/

pragma solidity ^0.8.17;

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

// File contracts/ln/base/LnBridgeHelper.sol
// License-Identifier: MIT

library LnBridgeHelper {
    // the time(seconds) for liquidity provider to delivery message
    // if timeout, slasher can work.
    uint256 constant public SLASH_EXPIRE_TIME = 30 * 60;
    bytes32 constant public INIT_SLASH_TRANSFER_ID = bytes32(uint256(1));
    // liquidity fee base rate
    // liquidityFee = liquidityFeeRate / LIQUIDITY_FEE_RATE_BASE * sendAmount
    uint256 constant public LIQUIDITY_FEE_RATE_BASE = 100000;

    struct TransferParameter {
        bytes32 previousTransferId;
        address provider;
        address sourceToken;
        address targetToken;
        uint112 amount;
        uint256 timestamp;
        address receiver;
    }

    // sourceToken and targetToken is the pair of erc20 token(or native) addresses
    // if sourceToken == address(0), then it's native token
    // if targetToken == address(0), then remote is native token
    // * `protocolFee` is the protocol fee charged by system
    // * `penaltyLnCollateral` is penalty from lnProvider when the transfer slashed, if we adjust this value, it'll not affect the old transfers.
    struct TokenInfo {
        uint112 protocolFee;
        uint112 penaltyLnCollateral;
        uint8 sourceDecimals;
        uint8 targetDecimals;
        bool isRegistered;
    }

    function sourceAmountToTargetAmount(
        TokenInfo memory tokenInfo,
        uint112 amount
    ) internal pure returns(uint112) {
        uint256 targetAmount = uint256(amount) * 10**tokenInfo.targetDecimals / 10**tokenInfo.sourceDecimals;
        require(targetAmount < type(uint112).max, "overflow amount");
        return uint112(targetAmount);
    }

    function calculateProviderFee(uint112 baseFee, uint16 liquidityFeeRate, uint112 amount) internal pure returns(uint112) {
        uint256 fee = uint256(baseFee) + uint256(liquidityFeeRate) * uint256(amount) / LIQUIDITY_FEE_RATE_BASE;
        require(fee < type(uint112).max, "overflow fee");
        return uint112(fee);
    }

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
        require(success && (data.length == 0 || abi.decode(data, (bool))), "lnBridgeHelper:transfer token failed");
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
        require(success && (data.length == 0 || abi.decode(data, (bool))), "lnBridgeHelper:transferFrom token failed");
    }

    function safeTransferNative(
        address receiver,
        uint256 amount
    ) internal {
        (bool success,) = payable(receiver).call{value: amount}("");
        require(success, "lnBridgeHelper:transfer native token failed");
    }

    function getProviderKey(uint256 remoteChainId, address provider, address sourceToken, address targetToken) pure internal returns(bytes32) {
        return keccak256(abi.encodePacked(
            remoteChainId,
            provider,
            sourceToken,
            targetToken
        ));
    }

    function getTokenKey(uint256 remoteChainId, address sourceToken, address targetToken) pure internal returns(bytes32) {
        return keccak256(abi.encodePacked(
            remoteChainId,
            sourceToken,
            targetToken
        ));
    }
}

// File contracts/ln/interface/ILnDefaultBridgeTarget.sol
// License-Identifier: MIT

interface ILnDefaultBridgeTarget {
    function slash(
        LnBridgeHelper.TransferParameter memory params,
        uint256 remoteChainId,
        address slasher,
        uint112 fee,
        uint112 penalty
    ) external;

    function withdraw(
        uint256 _sourceChainId,
        bytes32 lastTransferId,
        uint64 withdrawNonce,
        address provider,
        address sourceToken,
        address targetToken,
        uint112 amount
    ) external;
}

// File contracts/ln/interface/ILnOppositeBridgeSource.sol
// License-Identifier: MIT

interface ILnOppositeBridgeSource {
    function slash(
        bytes32 lastRefundTransferId,
        bytes32 transferId,
        uint256 remoteChainId,
        uint256 timestamp,
        address sourceToken,
        address targetToken,
        address provider,
        address slasher
    ) external;

    function withdrawMargin(
        bytes32 lastRefundTransferId,
        bytes32 lastTransferId,
        uint256 remoteChainId,
        address provider,
        address sourceToken,
        address targetToken,
        uint112 amount
    ) external;
}

// File contracts/ln/messager/DebugMessager.sol
// License-Identifier: MIT



contract DebugMessager {
    address public owner;
    address public app;

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "invalid owner");
        _;
    }

    function slashDefault(
        LnBridgeHelper.TransferParameter memory _params,
        uint256 _remoteChainId,
        address _slasher,
        uint112 _fee,
        uint112 _penalty
    ) external onlyOwner {
        ILnDefaultBridgeTarget(app).slash(_params, _remoteChainId, _slasher, _fee, _penalty);
    }

    function slashOpposite(
        bytes32 _latestSlashTransferId,
        bytes32 _transferId,
        uint256 _remoteChainId,
        uint256 _timestamp,
        address _sourceToken,
        address _targetToken,
        address _provider,
        address _slasher
    ) external onlyOwner {
        ILnOppositeBridgeSource(app).slash(
            _latestSlashTransferId,
            _transferId,
            _remoteChainId,
            _timestamp,
            _sourceToken,
            _targetToken,
            _provider,
            _slasher
        );
    }

    function withdrawDefault(
        uint256 _remoteChainId,
        bytes32 _lastTransferId,
        uint64  _withdrawNonce,
        address _provider,
        address _sourceToken,
        address _targetToken,
        uint112 _amount
    ) external onlyOwner {
        ILnDefaultBridgeTarget(app).withdraw(
            _remoteChainId,
            _lastTransferId,
            _withdrawNonce,
            _provider,
            _sourceToken,
            _targetToken,
            _amount
        );
    }

    function withdrawOpposite(
        bytes32 _latestSlashTransferId,
        bytes32 _lastTransferId,
        uint256 _remoteChainId,
        address _provider,
        address _sourceToken,
        address _targetToken,
        uint112 _amount
    ) external onlyOwner {
        ILnOppositeBridgeSource(app).withdrawMargin(
            _latestSlashTransferId,
            _lastTransferId,
            _remoteChainId,
            _provider,
            _sourceToken,
            _targetToken,
            _amount
        );
    }

    function registerRemoteReceiver(uint256 _remoteChainId, address _remoteBridge) external {
    }

    function registerRemoteSender(uint256 _remoteChainId, address _remoteBridge) external {
        app = msg.sender;
    }
}