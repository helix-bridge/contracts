// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import {ECDSA} from "@openzeppelin/contracts@4.9.2/utils/cryptography/ECDSA.sol";

contract MultiSigWallet {
    event ExecutionResult(bytes32 indexed hash, bool result);

    address[] public owners;
    uint64 public threshold;
    mapping(address => bool) public isOwner;
    mapping(bytes32 => bool) public doneOf;
    mapping(bytes32 => address[]) public transactionSigners;

    receive() external payable {}

    constructor(address[] memory signers, uint64 _threshold) {
        require(signers.length > 0, "owners required");
        require(
            _threshold > 0 && _threshold <= signers.length,
            "invalid threshold"
        );

        for (uint256 i = 0; i < signers.length; i++) {
            address owner = signers[i];
            require(owner != address(0), "invalid owner");
            require(!isOwner[owner], "owner not unique");

            isOwner[owner] = true;
            owners.push(owner);
        }

        threshold = _threshold;
    }

    function proposeOrApproveTransaction(
        address to,
        uint256 value,
        uint256 expiration,
        bytes memory data,
        bytes calldata signature
    ) external {
        require(isOwner[msg.sender], "not an owner");
        bytes memory txData = abi.encode(
            block.chainid,
            address(this),
            to,
            value,
            expiration,
            data
        );
        bytes32 hash = keccak256(txData);

        require(
            transactionSigners[hash].length < threshold,
            "threshold reached"
        );
        require(
            ECDSA.recover(ECDSA.toEthSignedMessageHash(hash), signature) ==
                msg.sender,
            "invalid signature"
        );
        transactionSigners[hash].push(msg.sender);

        if (transactionSigners[hash].length == threshold) {
            bytes memory signatures = new bytes(threshold * 65);
            for (uint256 i = 0; i < threshold; i++) {
                bytes memory sig = abi.encodePacked(
                    transactionSigners[hash][i]
                );
                for (uint256 j = 0; j < 65; j++) {
                    signatures[i * 65 + j] = sig[j];
                }
            }

            exec(to, value, expiration, data);
        }
    }

    function exec(
        address to,
        uint256 value,
        uint256 expiration,
        bytes memory data
    ) internal returns (bool success) {
        bytes memory txData = abi.encode(
            block.chainid,
            address(this),
            to,
            value,
            expiration,
            data
        );
        bytes32 hash = keccak256(txData);
        (success, ) = to.call{value: value}(data);
        doneOf[hash] = true;
        emit ExecutionResult(hash, success);
    }
}
