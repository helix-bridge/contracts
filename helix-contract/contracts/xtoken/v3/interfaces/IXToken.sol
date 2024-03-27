// SPDX-License-Identifier: MIT
pragma solidity >=0.8.17;

interface IXToken {
    function transferOwnership(address newOwner) external;
    function acceptOwnership() external;
    function mint(address account, uint256 amount) external;
    function burn(address account, uint256 amount) external;
    function approve(address spender, uint256 value) external returns (bool);
}
