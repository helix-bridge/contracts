path=flatten/lnv2
mkdir -p $path
yarn flat contracts/ln/tool/ProxyAdmin.sol --output $path/ProxyAdmin.sol
yarn flat contracts/ln/tool/TransparentUpgradeableProxy.sol --output $path/TransparentUpgradeableProxy.sol
yarn flat contracts/ln/LnDefaultBridge.sol --output $path/LnDefaultBridge.sol
yarn flat contracts/ln/LnOppositeBridge.sol --output $path/LnOppositeBridge.sol
yarn flat contracts/ln/messager/Eth2LineaSendService.sol --output $path/Eth2LineaSendService.sol
yarn flat contracts/ln/messager/Eth2LineaReceiveService.sol --output $path/Eth2LineaReceiveService.sol
yarn flat contracts/ln/messager/Eth2ArbSendService.sol --output $path/Eth2ArbSendService.sol
yarn flat contracts/ln/messager/Eth2ArbReceiveService.sol --output $path/Eth2ArbReceiveService.sol
yarn flat contracts/ln/messager/LayerZeroMessager.sol --output $path/LayerZeroMessager.sol
yarn flat contracts/ln/messager/debugMessager.sol --output $path/debugMessager.sol
yarn flat contracts/ln/test/TestToken.sol --output $path/TestToken.sol
