// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@zeppelin-solidity/contracts/token/ERC20/IERC20.sol";

contract LnBridgeHelper {
    bytes32 constant public INIT_SLASH_TRANSFER_ID = bytes32(uint256(1));

    struct TransferParameter {
        uint64 providerKey;
        bytes32 previousTransferId;
        bytes32 lastBlockHash;
        uint112 amount;
        uint64 nonce;
        uint64 timestamp;
        address token;
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

    function getTransferId(TransferParameter calldata param) pure public returns(bytes32) {
        return keccak256(abi.encodePacked(
            param.providerKey,
            param.previousTransferId,
            param.lastBlockHash,
            param.nonce,
            param.timestamp,
            param.token,
            param.receiver,
            param.amount
        ));
    }
}

