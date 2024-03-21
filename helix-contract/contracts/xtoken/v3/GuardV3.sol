// SPDX-License-Identifier: Apache-2.0

pragma solidity >=0.8.17;

import "@zeppelin-solidity/contracts/security/Pausable.sol";
import "@zeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "@zeppelin-solidity/contracts/utils/introspection/ERC165Checker.sol";
import "@zeppelin-solidity/contracts/utils/introspection/ERC165.sol";
import "./GuardRegistryV3.sol";
import "./interfaces/IXTokenCallback.sol";
import "../../utils/TokenTransferHelper.sol";

contract GuardV3 is GuardRegistryV3, Pausable, ERC165 {
    mapping(uint256 => bytes32) public deposits;

    uint256 public maxUnclaimableTime;
    mapping(address => bool) public depositors;
    address public operator;

    event TokenDeposit(address sender, uint256 id, uint256 timestamp, address token, uint256 amount, bytes data);
    event TokenClaimed(uint256 id);

    receive() external payable {}

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

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165) returns (bool) {
        return
            interfaceId == type(IXTokenCallback).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /**
      * @dev deposit token to guard, waiting to claim, only allowed depositor
      * @param _transferId the id of the operation, should be siged later by guards
      * @param _xToken the erc20 token address
      * @param _amount the amount of the token
      */
    function xTokenCallback(
        uint256 _transferId,
        address _xToken,
        uint256 _amount,
        bytes calldata _extData
    ) external onlyDepositor whenNotPaused {
        require(deposits[_transferId] == bytes32(0), "Guard: deposit conflict");
        deposits[_transferId] = hash(abi.encodePacked(msg.sender, block.timestamp, _xToken, _amount, _extData));
        emit TokenDeposit(msg.sender, _transferId, block.timestamp, _xToken, _amount, _extData);
    }

    function claimById(
        address _from,
        uint256 _id,
        uint256 _timestamp,
        address _token,
        uint256 _amount,
        bytes calldata _extData
    ) internal {
        require(hash(abi.encodePacked(_from, _timestamp, _token, _amount, _extData)) == deposits[_id], "Guard: Invalid id to claim");
        require(_amount > 0, "Guard: Invalid amount to claim");
        delete deposits[_id];
        (address recipient, bytes memory data) = abi.decode(_extData, (address, bytes));
        TokenTransferHelper.safeTransfer(_token, recipient, _amount);

        emit TokenClaimed(_id);
        if (ERC165Checker.supportsInterface(recipient, type(IXTokenCallback).interfaceId)) {
            IXTokenCallback(recipient).xTokenCallback(_id, _token, _amount, data);
        }
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
        uint256 _amount,
        bytes calldata _extData,
        bytes[] calldata _signatures
    ) public {
        verifyGuardSignaturesWithoutNonce(msg.sig, abi.encode(_from, _id, _timestamp, _token, _amount, _extData), _signatures);
        claimById(_from, _id, _timestamp, _token, _amount, _extData);
    }

    function rescueFunds(
        address _token,
        address _recipient,
        uint256 _amount,
        bytes[] calldata _signatures
    ) external {
        verifyGuardSignatures(msg.sig, abi.encode(_token, _recipient, _amount), _signatures);
        if (_token == address(0)) {
            payable(_recipient).transfer(_amount);
        } else {
            IERC20(_token).transfer(_recipient, _amount);
        }
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
        uint256 _amount,
        bytes calldata _extData
    ) public whenNotPaused {
        require(_timestamp < block.timestamp && block.timestamp - _timestamp > maxUnclaimableTime, "Guard: claim at invalid time");
        claimById(_from, _id, _timestamp, _token, _amount, _extData);
    }

    function hash(bytes memory _value) public pure returns (bytes32) {
        return sha256(_value);
    }
}

