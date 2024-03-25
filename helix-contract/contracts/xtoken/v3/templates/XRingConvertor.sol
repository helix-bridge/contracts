// SPDX-License-Identifier: Apache-2.0

pragma solidity >=0.8.17;

import "@zeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import "@zeppelin-solidity/contracts/utils/introspection/ERC165.sol";
import "./interfaces/IXRINGLockBox.sol";
import "../interfaces/IXTokenIssuing.sol";
import "../interfaces/IXTokenCallback.sol";

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

