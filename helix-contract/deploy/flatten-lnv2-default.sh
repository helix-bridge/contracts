path=flatten/lnv2
mkdir -p $path
yarn flat contracts/ln/Eth2ArbSource.sol --output $path/Eth2ArbSource.sol
yarn flat contracts/ln/Eth2ArbTarget.sol --output $path/Eth2ArbTarget.sol

