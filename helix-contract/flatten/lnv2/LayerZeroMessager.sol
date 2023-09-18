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
 * 9/18/2023
 **/

pragma solidity ^0.8.10;

// File contracts/ln/interface/ILowLevelMessager.sol
// License-Identifier: MIT

interface ILowLevelMessageSender {
    function registerRemoteReceiver(uint256 remoteChainId, address remoteBridge) external;
    function sendMessage(uint256 remoteChainId, bytes memory message, bytes memory params) external payable;
}

interface ILowLevelMessageReceiver {
    function registerRemoteSender(uint256 remoteChainId, address remoteBridge) external;
    function recvMessage(address remoteSender, address localReceiver, bytes memory payload) external;
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

// File contracts/ln/base/LnAccessController.sol
// License-Identifier: MIT

/// @title LnAccessController
/// @notice LnAccessController is a contract to control the access permission 
/// @dev See https://github.com/helix-bridge/contracts/tree/master/helix-contract
contract LnAccessController is Pausable {
    address public dao;
    address public operator;

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
        operator = msg.sender;
    }

    function setOperator(address _operator) onlyDao external {
        operator = _operator;
    }

    function transferOwnership(address _dao) onlyDao external {
        dao = _dao;
    }

    function unpause() external onlyOperator {
        _unpause();
    }

    function pause() external onlyOperator {
        _pause();
    }
}

// File contracts/ln/messager/interface/ILayerZeroEndpoint.sol
// License-Identifier: MIT

interface ILayerZeroEndpoint {
    function send(
        uint16 _dstChainId,
        bytes calldata _destination,
        bytes calldata _payload,
        address payable _refundAddress,
        address _zroPaymentAddress,
        bytes calldata _adapterParams
    ) external payable;

    function estimateFees(
        uint16 _dstChainId,
        address _userApplication,
        bytes calldata _payload,
        bool _payInZRO,
        bytes calldata _adapterParam
    ) external view returns (uint nativeFee, uint zroFee);
}

// File contracts/ln/messager/LayerZeroMessager.sol
// License-Identifier: MIT



contract LayerZeroMessager is LnAccessController {
    ILayerZeroEndpoint public endpoint;

    struct RemoteMessager {
        uint16 lzRemoteChainId;
        address messager;
    }

    // app remoteChainId => layerzero remote messager
    mapping(uint256=>RemoteMessager) public remoteMessagers;
    // lz remoteChainId => trustedRemotes
    mapping(uint16=>bytes32) public trustedRemotes;

    // token bridge pair
    // hash(lzRemoteChainId, localAppAddress) => remoteAppAddress
    mapping(bytes32=>address) public remoteAppReceivers;
    mapping(bytes32=>address) public remoteAppSenders;

    event CallResult(uint16 lzRemoteChainId, bytes srcAddress, bool successed);

    constructor(address _dao, address _endpoint) {
        _initialize(_dao);
        endpoint = ILayerZeroEndpoint(_endpoint);
    }

    modifier onlyRemoteBridge(uint16 lzRemoteChainId, bytes calldata srcAddress) {
        require(msg.sender == address(endpoint), "invalid caller");
        require(trustedRemotes[lzRemoteChainId] == keccak256(srcAddress), "invalid remote caller");
        _;
    }

    function setRemoteMessager(uint256 _appRemoteChainId, uint16 _lzRemoteChainId, address _remoteMessager) onlyOperator external {
        remoteMessagers[_appRemoteChainId] = RemoteMessager(_lzRemoteChainId, _remoteMessager);
        trustedRemotes[_lzRemoteChainId] = keccak256(abi.encodePacked(_remoteMessager, address(this)));
    }

    function registerRemoteReceiver(uint256 _remoteChainId, address _remoteBridge) external {
        RemoteMessager memory remoteMessager = remoteMessagers[_remoteChainId];
        require(remoteMessager.messager != address(0), "remote not configured");
        bytes32 key = keccak256(abi.encodePacked(remoteMessager.lzRemoteChainId, msg.sender));
        remoteAppReceivers[key] = _remoteBridge;
    }

    function registerRemoteSender(uint256 _remoteChainId, address _remoteBridge) external {
        RemoteMessager memory remoteMessager = remoteMessagers[_remoteChainId];
        require(remoteMessager.messager != address(0), "remote not configured");
        bytes32 key = keccak256(abi.encodePacked(remoteMessager.lzRemoteChainId, msg.sender));
        remoteAppSenders[key] = _remoteBridge;
    }

    function sendMessage(uint256 _remoteChainId, bytes memory _message, bytes memory _params) external payable {
        address refunder = address(bytes20(_params));
        RemoteMessager memory remoteMessager = remoteMessagers[_remoteChainId];
        require(remoteMessager.messager != address(0), "remote not configured");
        bytes memory destination = abi.encodePacked(
            remoteMessager.messager,
            address(this)
        );
        bytes32 key = keccak256(abi.encodePacked(remoteMessager.lzRemoteChainId, msg.sender));
        address remoteAppAddress = remoteAppReceivers[key];
        require(remoteAppAddress != address(0), "app pair not registered");
        bytes memory lzPayload = abi.encode(msg.sender, remoteAppAddress, _message);
        endpoint.send{ value: msg.value }(
            remoteMessager.lzRemoteChainId,
            destination,
            lzPayload,
            payable(refunder),
            // zro payment, future parameter
            address(0x0),
            bytes("")
        );
    }

    function lzReceive(
        uint16 _srcChainId,
        bytes calldata _srcAddress,
        uint64, //nonce unused
        bytes calldata _payload) onlyRemoteBridge(_srcChainId, _srcAddress) external {
        // call
        (address remoteAppAddress, address localAppAddress, bytes memory message) = abi.decode(_payload, (address, address, bytes));
        bytes32 key = keccak256(abi.encodePacked(_srcChainId, localAppAddress));
        require(remoteAppAddress == remoteAppSenders[key], "invalid remote address");
        (bool success,) = localAppAddress.call(message);
        // don't revert to prevent message block
        emit CallResult(_srcChainId, _srcAddress, success);
    }

    function fee(
        uint256 _remoteChainId,
        bytes memory _message
    ) external view returns(uint256 nativeFee, uint256 zroFee) {
        RemoteMessager memory remoteMessager = remoteMessagers[_remoteChainId];
        require(remoteMessager.messager != address(0), "messager not configured");
        return endpoint.estimateFees(
            remoteMessager.lzRemoteChainId,
            remoteMessager.messager,
            _message,
            false,
            bytes("")
        );
    }
}