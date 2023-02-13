path=flatten/lp
mkdir -p $path
yarn flat contracts/mapping-token/v2/lp/LpSub2EthBridge.sol --output $path/LpSub2EthBridge.sol
yarn flat contracts/mapping-token/v2/lp/LpSub2SubBridge.sol --output $path/LpSub2SubBridge.sol
