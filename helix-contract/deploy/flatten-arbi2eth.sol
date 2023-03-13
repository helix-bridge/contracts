path=flatten/arbi2eth
mkdir -p $path
yarn flat contracts/mapping-token/v2/lp/LnArbitrumL1Issuing.sol --output $path/LnArbitrumL1Issuing.sol
yarn flat contracts/mapping-token/v2/lp/LnArbitrumL2Backing.sol --output $path/LnArbitrumL2Backing.sol
