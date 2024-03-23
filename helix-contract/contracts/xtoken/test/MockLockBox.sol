// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@zeppelin-solidity/contracts/token/ERC20/IERC20.sol";
interface IRING {
    function balanceOf(address src) external view returns (uint256);
    function burn(address _guy, uint256 _wad) external;
    function mint(address _guy, uint256 _wad) external;
}

contract XRINGLockBox {
    IRING public immutable RING;
    IERC20 public immutable XRING;

    event Deposit(address indexed dst, uint256 wad);
    event Withdrawal(address indexed src, uint256 wad);

    constructor(address ring, address xring) {
        RING = IRING(ring);
        XRING = IERC20(xring);
    }

    function deposit(uint256 amount) external {
        _deposit(msg.sender, amount);
    }

    function withdraw(uint256 amount) external {
        _withdraw(msg.sender, amount);
    }

    function depositFor(address to, uint256 amount) external {
        _deposit(to, amount);
    }

    function withdrawTo(address to, uint256 amount) external {
        _withdraw(to, amount);
    }

    function _deposit(address to, uint256 amount) internal {
        XRING.transferFrom(msg.sender, address(this), amount);
        RING.mint(to, amount);
        emit Deposit(to, amount);
    }

    function _withdraw(address to, uint256 amount) internal {
        RING.burn(msg.sender, amount);
        XRING.transfer(to, amount);
        emit Withdrawal(to, amount);
    }
}
