path=flatten/lnv2
mkdir -p $path
yarn flat contracts/ln/Arb2EthTarget.sol --output $path/Arb2EthTarget.sol
yarn flat contracts/ln/Arb2EthSource.sol --output $path/Arb2EthSource.sol
