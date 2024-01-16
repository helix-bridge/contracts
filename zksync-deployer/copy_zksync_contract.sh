rm -rf ./contracts
mkdir -p contracts/ln
mkdir -p contracts/ln/messager
mkdir -p contracts/ln/test
rm -rf ./cache-zk
rm -rf ./artifacts-zk
cp -r ../helix-contract/contracts/ln/base ./contracts/ln/
cp -r ../helix-contract/contracts/ln/interface ./contracts/ln/
cp -r ../helix-contract/contracts/ln/tool ./contracts/ln/
cp -r ../helix-contract/contracts/ln/messager/interface ./contracts/ln/messager/
cp -r ../helix-contract/contracts/ln/messager/LayerZeroMessager.sol ./contracts/ln/messager/
cp -r ../helix-contract/contracts/ln/LnDefaultBridge.sol ./contracts/ln/
cp -r ../helix-contract/contracts/ln/LnOppositeBridge.sol ./contracts/ln/
cp -r ../helix-contract/contracts/ln/HelixLnBridgeV3.sol ./contracts/ln/
cp -r ../helix-contract/contracts/utils ./contracts/
cp -r ../helix-contract/contracts/interfaces ./contracts/
cp -r ../helix-contract/contracts/ln/test/TestToken.sol ./contracts/ln/test/
