// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

contract IncreaseMerkleTree {
    uint constant TREE_DEPTH = 64;
    uint constant MAX_COUNT  = 2**TREE_DEPTH - 1;
    uint64 public total_count;
    bytes32[TREE_DEPTH] public branch;
    bytes32[TREE_DEPTH] public zero_hashes;

    function initTree() internal {
        for (uint height = 0; height < TREE_DEPTH - 1; height++) {
            zero_hashes[height + 1] = hashNode(zero_hashes[height], zero_hashes[height]);
        }
    }

    function getRoot() public view returns (bytes32) {
        bytes32 node;
        uint64 size = total_count;
        for (uint height = 0; height < TREE_DEPTH; height++) {
            if ((size & 1) == 1)
                node = hashNode(branch[height], node);
            else
                node = hashNode(node, zero_hashes[height]);
            size /= 2;
        }
        return node;
    }

    function append(bytes32 node) internal {
        require(total_count < MAX_COUNT, "IncreaseMerkleTree: merkle tree full");
        total_count += 1;
        uint64 size = total_count;
        for (uint height = 0; height < TREE_DEPTH; height++) {
            if ((size & 1) == 1) {
                branch[height] = node;
                return;
            }
            node = hash(abi.encodePacked(branch[height], node));
            size /= 2;
        }
        assert(false);
    }
     
    // verify path
    function verifyProof(
        bytes32 leaf,
        bytes32[] memory proof,
        uint64 index
    ) public view returns (bool) {
        bytes32 value = leaf;
        bytes32 root = getRoot();
        for (uint i = 0; i < TREE_DEPTH; ++i) {
            if ((index / (2**i)) % 2 == 1) {
                value = hashNode(proof[i], value);
            } else {
                value = hashNode(value, proof[i]);
            }
        }
        return value == root;
    }

    function hashNode(bytes32 left, bytes32 right)
        public
        pure
        returns (bytes32)
    {
        return hash(abi.encodePacked(left, right));
    }

    function hash(bytes memory value) public pure returns (bytes32) {
        return sha256(value);
    }
}

