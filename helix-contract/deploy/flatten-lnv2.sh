path=flatten/lnv2
mkdir -p $path
yarn flat contracts/ln/LnArbitrumBridgeOnL1.sol --output $path/LnArbitrumBridgeOnL1.sol
yarn flat contracts/ln/LnArbitrumBridgeOnL2.sol --output $path/LnArbitrumBridgeOnL2.sol
