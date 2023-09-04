path=flatten/lnv2
mkdir -p $path
yarn flat contracts/ln/Mantle2EthSource.sol --output $path/Mantle2EthSource.sol
yarn flat contracts/ln/Mantle2EthTarget.sol --output $path/Mantle2EthTarget.sol
