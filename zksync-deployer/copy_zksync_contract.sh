rm -rf ./contracts
mkdir -p contracts/ln
cp -r ../helix-contract/contracts/ln/base ./contracts/ln/
cp -r ../helix-contract/contracts/ln/interface ./contracts/ln/
cp -r ../helix-contract/contracts/ln/Eth2ZkSyncSource.sol ./contracts/ln/
cp -r ../helix-contract/contracts/ln/Eth2ZkSyncTarget.sol ./contracts/ln/
cp -r ../helix-contract/contracts/ln/ProxyAdmin.sol ./contracts/ln/
cp -r ../helix-contract/contracts/ln/TransparentUpgradeableProxy.sol ./contracts/ln/
