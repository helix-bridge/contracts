import { Wallet, utils, ContractFactory } from "zksync-web3";
import * as ethers from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Deployer } from "@matterlabs/hardhat-zksync-deploy";
import { ProxyDeployer } from "./proxy.ts";

const privateKey = process.env.PRIKEY

const zkSyncNetwork = {
    url: "https://zksync2-testnet.zksync.dev",
    proxyAdmin: "0xd7b3aC0c9E99e9B2EF1C9D2a5ff397867c8c8A3E",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    logicAddress: "0x6213E3bc566f7d7A73Fd7565c97ac5Ffb8624674",
};

export default async function (hre: HardhatRuntimeEnvironment) {
  // deploy proxy admin contract
  console.log(`Running deploy script for the zksync default bridge proxy contract`);

  // Initialize the wallet.
  const wallet = new Wallet(privateKey);

  // Create deployer object and load the artifact of the contract you want to deploy.
  const deployer = new Deployer(hre, wallet);
  const artifact = await deployer.loadArtifact("LnDefaultBridge");

  // deploy proxy contract
  const logicFactory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const proxyAddress = await ProxyDeployer.deployProxyContract(deployer, zkSyncNetwork.proxyAdmin, logicFactory, zkSyncNetwork.logicAddress, [zkSyncNetwork.dao]);
  console.log(`proxy contract was deployed to ${proxyAddress}`);

  const calldata = ProxyDeployer.getInitializerData(logicFactory.interface, [zkSyncNetwork.dao], "initialize");
  const proxyVerificationId = await hre.run("verify:verify", {
      address: proxyAddress,
      constructorArguments: [zkSyncNetwork.logicAddress, zkSyncNetwork.proxyAdmin, calldata],
  });
  console.log(`Proxy Verification ID: ${proxyVerificationId}`);
}

