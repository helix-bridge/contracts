path=flatten/lnv2
mkdir -p $path
yarn flat contracts/ln/Eth2LineaSource.sol --output $path/Eth2LineaSource.sol
yarn flat contracts/ln/Eth2LineaTarget.sol --output $path/Eth2LineaTarget.sol
