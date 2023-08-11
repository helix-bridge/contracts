path=flatten/lnv2
mkdir -p $path
yarn flat contracts/ln/ZkSync2EthSource.sol --output $path/ZkSync2EthSource.sol
yarn flat contracts/ln/ZkSync2EthTarget.sol --output $path/ZkSync2EthTarget.sol
