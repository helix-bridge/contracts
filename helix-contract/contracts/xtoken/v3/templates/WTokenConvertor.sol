// SPDX-License-Identifier: Apache-2.0

pragma solidity >=0.8.17;

import "@zeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "@zeppelin-solidity/contracts/utils/introspection/ERC165.sol";
import "./interfaces/IWToken.sol";
import "../interfaces/IXTokenBacking.sol";
import "../interfaces/IXTokenCallback.sol";
import "../../../utils/TokenTransferHelper.sol";

contract WTokenConvertor is IXTokenCallback, IXTokenRollbackCallback, ERC165 {
    address public immutable wToken;
    IXTokenBacking public immutable xTokenBacking;

    mapping(uint256=>address) public senders;

    event TokenUnwrapped(uint256 transferId, address recipient, uint256 amount);
    event TokenRollback(uint256 transferId, address originalSender, uint256 amount);
    event LockAndXIssue(uint256 transferId, address sender, address recipient, uint256 amount, bytes extData);

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165) returns (bool) {
        return
            interfaceId == type(IXTokenCallback).interfaceId ||
            interfaceId == type(IXTokenRollbackCallback).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    receive() external payable {}

    modifier onlyXTokenBacking() {
        require(address(xTokenBacking) == msg.sender, "invalid sender");
        _;
    }

    modifier onlyXTokenBackingAuthorized() {
        require(address(xTokenBacking) == msg.sender || xTokenBacking.guard() == msg.sender, "invalid sender");
        _;
    }

    constructor(address _wToken, address _xTokenBacking) {
        require(_wToken.code.length > 0, "invalid wtoken address");
        wToken = _wToken;
        xTokenBacking = IXTokenBacking(_xTokenBacking);
        IERC20(_wToken).approve(_xTokenBacking, type(uint256).max);
    }

    /**
      * @dev after receive token, the backing or guard call this interface
      * @param _extData it's a bytes20 address
      */
    function xTokenCallback(
        uint256 _transferId,
        address _xToken,
        uint256 _amount,
        bytes calldata _extData
    ) onlyXTokenBackingAuthorized external {
        address recipient = address(bytes20(_extData));
        require(_xToken == wToken, "invalid xtoken");
        IWToken(_xToken).withdraw(_amount);
        TokenTransferHelper.safeTransferNative(recipient, _amount);
        emit TokenUnwrapped(_transferId, recipient, _amount);
    }

    function xTokenRollbackCallback(
        uint256 _transferId,
        address _xToken,
        uint256 _amount
    ) onlyXTokenBacking external {
        require(_xToken == wToken, "invalid xtoken");
        address originalSender = senders[_transferId];
        require(originalSender != address(0), "invalid original sender");
        delete senders[_transferId];
        IWToken(_xToken).withdraw(_amount);
        TokenTransferHelper.safeTransferNative(originalSender, _amount);
        emit TokenRollback(_transferId, originalSender, _amount);
    }

    function lockAndXIssue(
        uint256 _remoteChainId,
        address _recipient,
        address _rollbackAccount,
        uint256 _amount,
        uint256 _nonce,
        bytes calldata _extData,
        bytes memory _extParams
    ) payable external {
        require(msg.value > _amount, "invalid msg.value");
        IWToken(wToken).deposit{value: _amount}();
        bytes32 transferId = xTokenBacking.lockAndXIssue{value: msg.value - _amount}(_remoteChainId, wToken, _recipient, _rollbackAccount, _amount, _nonce, _extData, _extParams);
        uint256 id = uint256(transferId);
        senders[id] = msg.sender;
        emit LockAndXIssue(id, msg.sender, _recipient, _amount, _extData);
    }

    function encodeExtData(address recipient) external pure returns (bytes memory) {
        return abi.encodePacked(recipient);
    }
}

