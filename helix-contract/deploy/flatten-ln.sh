path=flatten/lnv2
mkdir -p $path
yarn flat contracts/ln/LnDefaultBridge.sol --output $path/LnDefaultBridge.sol
yarn flat contracts/ln/LnOppositeBridge.sol --output $path/LnOppositeBridge.sol
yarn flat contracts/ln/messager/Eth2LineaSendService.sol --output $path/Eth2LineaSendService.sol
yarn flat contracts/ln/messager/Eth2LineaReceiveService.sol --output $path/Eth2LineaReceiveService.sol
