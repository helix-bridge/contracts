// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "../interface/ILpBridgeBacking.sol";
import "./LpBridgeHelper.sol";

contract LpBridgeIssuing is LpBridgeHelper {
    mapping(bytes32 => address) public issuedMessages;

    event TransferRelayed(bytes32 transferId, address relayer);

    function relay(
        uint256 nonce,
        address token,
        address sender,
        address receiver,
        uint112 amount,
        uint64 sourceChainId,
        bool issuingNative
    ) payable external {
        bytes32 transferId = keccak256(abi.encodePacked(nonce, issuingNative, token, sender, receiver, amount, sourceChainId, uint64(block.chainid)));
        require(issuedMessages[transferId] == address(0), "lpBridgeIssuing:message exist");
        issuedMessages[transferId] = msg.sender;
        if (issuingNative) {
            require(msg.value == amount, "lpBridgeIssuing:invalid amount");
            payable(receiver).transfer(amount);
        } else {
            _safeTransferFrom(token, msg.sender, receiver, uint256(amount));
        }
        emit TransferRelayed(transferId, msg.sender);
    }

    // only lpProvider can request withdraw liquidity
    function _encodeWithdrawLiquidity(
        bytes32[] memory transferIds,
        bool withdrawNative,
        address receiver) internal view returns(bytes memory) {
        for (uint idx = 0; idx < transferIds.length; idx++) {
            address lpProvider = issuedMessages[transferIds[idx]];
            require(lpProvider == msg.sender, "invalid lpProvider");
        }
        return abi.encodeWithSelector(ILpBridgeBacking.withdrawLiquidity.selector, transferIds, withdrawNative, receiver);
    }

    // we only allowed token sender or receiver cancel the transaction
    function _cancelIssuing(
        uint256 nonce,
        bool issuingNative,
        address token,
        address sender,
        address receiver,
        uint112 amount,
        uint64 sourceChainId
    ) internal returns(bytes32 transferId) {
        require(sender == msg.sender || receiver == msg.sender, "lpBridgeIssuing:only sender or receiver allowed");
        transferId = keccak256(abi.encodePacked(nonce, issuingNative, token, sender, receiver, amount, sourceChainId, uint64(block.chainid)));
        if (issuedMessages[transferId] == msg.sender) {
            return transferId;
        }
        require(issuedMessages[transferId] == address(0), "lpBridgeIssuing:message exist");
        issuedMessages[transferId] = msg.sender;
    }
}
