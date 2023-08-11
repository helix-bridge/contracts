path=flatten/lnv2
mkdir -p $path
yarn flat contracts/ln/Eth2ZkSyncSource.sol --output $path/Eth2ZkSyncSource.sol
yarn flat contracts/ln/Eth2ZkSyncTarget.sol --output $path/Eth2ZkSyncTarget.sol
