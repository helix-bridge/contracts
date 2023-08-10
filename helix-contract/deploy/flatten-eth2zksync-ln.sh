path=flatten/eth2zksync
mkdir -p $path
yarn flat contracts/ln/Eth2ZksyncSource.sol --output $path/Eth2ZksyncSource.sol
yarn flat contracts/ln/Eth2ZksyncTarget.sol --output $path/Eth2ZksyncTarget.sol
