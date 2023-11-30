// SPDX-License-Identifier: MIT
pragma solidity >=0.8.17;

interface ILnBridgeSourceV3 {
    function slash(
        uint256 _remoteChainId,
        bytes32 _transferId,
        uint112 _sourceAmount,
        address _lnProvider,
        uint64 _timestamp,
        address _slasher
    ) external;
    function withdrawLiquidity(
        bytes32[] calldata _transferIds,
        uint256 _remoteChainId,
        address _provider
    ) external;
}
