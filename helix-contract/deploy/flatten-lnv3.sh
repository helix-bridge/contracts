path=flatten/lnv3
mkdir -p $path
yarn flat contracts/ln/HelixLnBridgeV3.sol --output $path/HelixLnBridgeV3.sol
yarn flat contracts/ln/tool/Create2DeployForBlast.sol --output $path/Create2DeployForBlast.sol
yarn flat contracts/ln/HelixLnBridgeV3ForBlast.sol --output $path/HelixLnBridgeV3ForBlast.sol
yarn flat contracts/messagers/DirectMessager.sol --output $path/DirectMessager.sol
