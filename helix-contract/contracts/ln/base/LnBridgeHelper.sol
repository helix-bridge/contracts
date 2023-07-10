// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@zeppelin-solidity/contracts/token/ERC20/IERC20.sol";

contract LnBridgeHelper {
    bytes32 constant public INIT_SLASH_TRANSFER_ID = bytes32(uint256(1));

    struct TransferParameter {
        bytes32 previousTransferId;
        address provider;
        address sourceToken;
        address targetToken;
        uint112 amount;
        uint64 timestamp;
        address receiver;
    }

    function _safeTransfer(
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

    function _safeTransferFrom(
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

    function getProviderKey(address provider, address token) pure public returns(bytes32) {
        return keccak256(abi.encodePacked(
            provider,
            token
        ));
    }
}

