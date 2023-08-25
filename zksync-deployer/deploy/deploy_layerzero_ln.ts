import { Wallet, utils, ContractFactory } from "zksync-web3";
import * as ethers from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Deployer } from "@matterlabs/hardhat-zksync-deploy";
import { ProxyDeployer } from "./proxy.ts";

const privateKey = process.env.PRIKEY

const zkSyncNetwork = {
    url: "https://zksync2-testnet.zksync.dev",
    proxyAdmin: "0x96892F3EaD26515592Da38432cFABad991BBd69d",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    endpoint: "0x093D2CF57f764f09C3c2Ac58a42A2601B8C79281",
    usdc: "0x0faF6df7054946141266420b43783387A78d82A9",
    // we should update this remote chain id when deploy
    // arbitrum-goerli: 10143
    // linea-goerli: 10157
    remoteChainId: 10143,
};

export default async function (hre: HardhatRuntimeEnvironment) {
  // deploy proxy admin contract
  console.log(`Running deploy script for the zksync Layerzero contract`);

  // Initialize the wallet.
  const wallet = new Wallet(privateKey);

  // Create deployer object and load the artifact of the contract you want to deploy.
  const deployer = new Deployer(hre, wallet);
  // deploy logic contract
  const artifact = await deployer.loadArtifact("LnBridgeBaseLZ");
  const logicContract = await deployer.deploy(artifact, []);
  const logicContractAddress = logicContract.address;
  console.log(`logic contract was deployed to ${logicContractAddress}`);
  const logicVerificationId = await hre.run("verify:verify", {
      address: logicContractAddress,
      contract: "contracts/ln/LnBridgeBaseLZ.sol:LnBridgeBaseLZ",
      constructorArguments: [],
  });

  console.log(`Logic Verification ID: ${logicVerificationId}`);

  // deploy proxy contract
  const logicFactory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const proxyAddress = await ProxyDeployer.deployProxyContract(deployer, zkSyncNetwork.proxyAdmin, logicFactory, logicContractAddress, [zkSyncNetwork.dao, zkSyncNetwork.endpoint, zkSyncNetwork.remoteChainId]);
  console.log(`proxy contract was deployed to ${proxyAddress}`);

  const calldata = ProxyDeployer.getInitializerData(logicFactory.interface, [zkSyncNetwork.dao, zkSyncNetwork.endpoint, zkSyncNetwork.remoteChainId], "initialize");
  const proxyVerificationId = await hre.run("verify:verify", {
      address: proxyAddress,
      constructorArguments: [logicContractAddress, zkSyncNetwork.proxyAdmin, calldata],
  });
  console.log(`Proxy Verification ID: ${logicVerificationId}`);
}

