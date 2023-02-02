// SPDX-License-Identifier: MIT

pragma solidity >=0.8.10;

interface ILpBridgeBacking {
    function withdrawLiquidity(bytes32[] memory hashes, bool withdrawNative, address liquidityProvider) external;
}
