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

    function verifySignatures(bytes32 hash, bytes memory signatures)
        public
        view
    {
        require(
            signatures.length == threshold * 65,
            "invalid signature length"
        );
        bytes32 messageDigest = ECDSA.toEthSignedMessageHash(hash);

        address lastOwner = address(0);
        for (uint256 i = 0; i < threshold; i++) {
            bytes memory signature = slice(signatures, i * 65, (i + 1) * 65);
            address currentOwner = ECDSA.recover(messageDigest, signature);
            require(
                currentOwner > lastOwner && isOwner[currentOwner],
                "invalid signature"
            );
            lastOwner = currentOwner;
        }
    }

    function _checkSigs(
        uint256 expiration,
        bytes32 hash,
        bytes memory signatures
    ) internal view {
        require(block.timestamp < expiration, "operation expired");
        require(!doneOf[hash], "hash already used");
        verifySignatures(hash, signatures);
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

            exec(to, value, expiration, data, signatures);
        }
    }

    function exec(
        address to,
        uint256 value,
        uint256 expiration,
        bytes memory data,
        bytes memory signatures
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
        _checkSigs(expiration, hash, signatures);
        (success, ) = to.call{value: value}(data);
        doneOf[hash] = true;
        emit ExecutionResult(hash, success);
    }

    function slice(
        bytes memory _bytes,
        uint256 _start,
        uint256 _length
    ) internal pure returns (bytes memory) {
        require(_length + 31 >= _length, "slice_overflow");
        require(_bytes.length >= _start + _length, "slice_outOfBounds");

        bytes memory tempBytes;

        // Check length is 0. `iszero` return 1 for `true` and 0 for `false`.
        assembly {
            switch iszero(_length)
            case 0 {
                // Get a location of some free memory and store it in tempBytes as
                // Solidity does for memory variables.
                tempBytes := mload(0x40)

                // Calculate length mod 32 to handle slices that are not a multiple of 32 in size.
                let lengthmod := and(_length, 31)

                // tempBytes will have the following format in memory: <length><data>
                // When copying data we will offset the start forward to avoid allocating additional memory
                // Therefore part of the length area will be written, but this will be overwritten later anyways.
                // In case no offset is require, the start is set to the data region (0x20 from the tempBytes)
                // mc will be used to keep track where to copy the data to.
                let mc := add(
                    add(tempBytes, lengthmod),
                    mul(0x20, iszero(lengthmod))
                )
                let end := add(mc, _length)

                for {
                    // Same logic as for mc is applied and additionally the start offset specified for the method is added
                    let cc := add(
                        add(
                            add(_bytes, lengthmod),
                            mul(0x20, iszero(lengthmod))
                        ),
                        _start
                    )
                } lt(mc, end) {
                    // increase `mc` and `cc` to read the next word from memory
                    mc := add(mc, 0x20)
                    cc := add(cc, 0x20)
                } {
                    // Copy the data from source (cc location) to the slice data (mc location)
                    mstore(mc, mload(cc))
                }

                // Store the length of the slice. This will overwrite any partial data that
                // was copied when having slices that are not a multiple of 32.
                mstore(tempBytes, _length)

                // update free-memory pointer
                // allocating the array padded to 32 bytes like the compiler does now
                // To set the used memory as a multiple of 32, add 31 to the actual memory usage (mc)
                // and remove the modulo 32 (the `and` with `not(31)`)
                mstore(0x40, and(add(mc, 31), not(31)))
            }
            // if we want a zero-length slice let's just return a zero-length array
            default {
                tempBytes := mload(0x40)
                // zero out the 32 bytes slice we are about to return
                // we need to do it because Solidity does not garbage collect
                mstore(tempBytes, 0)

                // update free-memory pointer
                // tempBytes uses 32 bytes in memory (even when empty) for the length.
                mstore(0x40, add(tempBytes, 0x20))
            }
        }

        return tempBytes;
    }
}
