// SPDX-License-Identifier: Apache-2.0

pragma solidity >=0.8.17;

import "@zeppelin-solidity/contracts/security/Pausable.sol";
import "@zeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "@zeppelin-solidity/contracts/utils/introspection/ERC165Checker.sol";
import "./GuardRegistryV3.sol";
import "../interfaces/IWToken.sol";
import "../../utils/TokenTransferHelper.sol";
import "../../interfaces/IUniswapV3SwapCallback.sol";

contract GuardV3 is GuardRegistryV3, Pausable {
    struct CallbackInfo {
        bytes4 sig;
        bytes32 transferId;
        address token;
        bytes extData;
    }

    mapping(uint256 => bytes32) public deposits;

    uint256 public maxUnclaimableTime;
    mapping(address => bool) public depositors;
    address public operator;

    event TokenDeposit(address sender, uint256 id, uint256 timestamp, address token, address recipient, uint256 amount, bytes extData);
    event TokenClaimed(uint256 id);

    constructor(
        address[] memory _guards,
        address _operator,
        uint256 _threshold,
        uint256 _maxUnclaimableTime
    ) {
        maxUnclaimableTime = _maxUnclaimableTime;
        operator = _operator;
        initialize(_guards, _threshold);
    }

    modifier onlyDepositor() {
        require(depositors[msg.sender] == true, "Guard: Invalid depositor");
        _;
    }

    modifier onlyOperator() {
        require(msg.sender == operator, "Guard: Invalid operator");
        _;
    }

    function unpause() external onlyOperator {
        _unpause();
    }

    function pause() external onlyOperator {
        _pause();
    }

    function setOperator(address _operator, bytes[] calldata _signatures) external {
        verifyGuardSignatures(msg.sig, abi.encode(_operator), _signatures);
        operator = _operator;
    }

    function setDepositor(address _depositor, bool _enable) external onlyOperator {
        depositors[_depositor] = _enable;
    }

    function setMaxUnclaimableTime(uint256 _maxUnclaimableTime, bytes[] calldata _signatures) external {
        verifyGuardSignatures(msg.sig, abi.encode(_maxUnclaimableTime), _signatures);
        maxUnclaimableTime = _maxUnclaimableTime;
    }

    /**
      * @dev deposit token to guard, waiting to claim, only allowed depositor
      * @param _id the id of the operation, should be siged later by guards
      * @param _token the erc20 token address
      * @param _recipient the recipient of the token
      * @param _amount the amount of the token
      */
    function deposit(
        uint256 _id,
        address _token,
        address _recipient,
        uint256 _amount,
        bytes calldata _extData
    ) public onlyDepositor whenNotPaused {
        require(deposits[_id] == bytes32(0), "Guard: deposit conflit");
        deposits[_id] = hash(abi.encodePacked(msg.sender, block.timestamp, _token, _recipient, _amount, _extData));
        emit TokenDeposit(msg.sender, _id, block.timestamp, _token, _recipient, _amount, _extData);
    }

    function claimById(
        address _from,
        uint256 _id,
        uint256 _timestamp,
        address _token,
        address _recipient,
        uint256 _amount,
        bytes calldata _extData,
        bool _isNative
    ) internal {
        require(hash(abi.encodePacked(_from, _timestamp, _token, _recipient, _amount, _extData)) == deposits[_id], "Guard: Invalid id to claim");
        require(_amount > 0, "Guard: Invalid amount to claim");
        delete deposits[_id];
        if (_isNative) {
            TokenTransferHelper.safeTransferFrom(_token, _from, address(this), _amount);
            uint256 balanceBefore = address(this).balance;
            IWToken(_token).withdraw(_amount);
            require(address(this).balance == balanceBefore + _amount, "Guard: token is not wrapped by native token");
            TokenTransferHelper.safeTransferNative(_recipient, _amount);
        } else {
            TokenTransferHelper.safeTransferFrom(_token, _from, _recipient, _amount);
        }
        if (ERC165Checker.supportsInterface(_recipient, type(IUniswapV3SwapCallback).interfaceId)) {
            CallbackInfo memory callbackInfo = CallbackInfo(msg.sig, bytes32(_id), _token, _extData);
            bytes memory data = abi.encode(callbackInfo);
            IUniswapV3SwapCallback(_recipient).uniswapV3SwapCallback(int256(_amount), int256(_amount), data);
        }
        emit TokenClaimed(_id);
    }

    /**
      * @dev claim the tokens in the contract saved by deposit, this acquire signatures from guards
      * @param _id the id to be claimed
      * @param _signatures the signatures of the guards which to claim tokens.
      */
    function claim(
        address _from,
        uint256 _id,
        uint256 _timestamp,
        address _token,
        address _recipient,
        uint256 _amount,
        bytes calldata _extData,
        bytes[] calldata _signatures
    ) public {
        verifyGuardSignaturesWithoutNonce(msg.sig, abi.encode(_from, _id, _timestamp, _token, _recipient, _amount, _extData), _signatures);
        claimById(_from, _id, _timestamp, _token, _recipient, _amount, _extData, false);
    }

    /**
      * @dev claimNative the tokens in the contract saved by deposit, this acquire signatures from guards
      * @param _id the id to be claimed
      * @param _signatures the signatures of the guards which to claim tokens.
      */
    function claimNative(
        address _from,
        uint256 _id,
        uint256 _timestamp,
        address _token,
        address _recipient,
        uint256 _amount,
        bytes calldata _extData,
        bytes[] calldata _signatures
    ) public {
        verifyGuardSignaturesWithoutNonce(msg.sig, abi.encode(_from, _id, _timestamp, _token, _recipient, _amount, _extData), _signatures);
        claimById(_from, _id, _timestamp, _token, _recipient, _amount, _extData, true);
    }

    /**
      * @dev claim the tokens without signatures, this only allowed when timeout
      * @param _id the id to be claimed
      */
    function claimByTimeout(
        address _from,
        uint256 _id,
        uint256 _timestamp,
        address _token,
        address _recipient,
        uint256 _amount,
        bool _isNative,
        bytes calldata _extData
    ) public whenNotPaused {
        require(_timestamp < block.timestamp && block.timestamp - _timestamp > maxUnclaimableTime, "Guard: claim at invalid time");
        claimById(_from, _id, _timestamp, _token, _recipient, _amount, _extData, _isNative);
    }

    function hash(bytes memory _value) public pure returns (bytes32) {
        return sha256(_value);
    }
}

