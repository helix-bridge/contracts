path=flatten/lnv2
mkdir -p $path
yarn flat contracts/ln/Linea2EthSource.sol --output $path/Linea2EthSource.sol
yarn flat contracts/ln/Linea2EthTarget.sol --output $path/Linea2EthTarget.sol
