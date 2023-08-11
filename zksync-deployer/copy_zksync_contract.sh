rm -rf ./contracts
mkdir -p contracts/ln
rm -rf ./cache-zk
rm -rf ./artifacts-zk
cp -r ../helix-contract/contracts/ln/base ./contracts/ln/
cp -r ../helix-contract/contracts/ln/interface ./contracts/ln/
cp -r ../helix-contract/contracts/ln/Eth2ZkSyncSource.sol ./contracts/ln/
cp -r ../helix-contract/contracts/ln/Eth2ZkSyncTarget.sol ./contracts/ln/
cp -r ../helix-contract/contracts/ln/ZkSync2EthSource.sol ./contracts/ln/
cp -r ../helix-contract/contracts/ln/ZkSync2EthTarget.sol ./contracts/ln/
cp -r ../helix-contract/contracts/ln/ProxyAdmin.sol ./contracts/ln/
cp -r ../helix-contract/contracts/ln/TransparentUpgradeableProxy.sol ./contracts/ln/
