import { Wallet, utils, ContractFactory } from "zksync-web3";
import * as ethers from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Deployer } from "@matterlabs/hardhat-zksync-deploy";
import { ProxyDeployer } from "./proxy.ts";

// load wallet private key from env file
const privateKey = process.env.PRIKEY

// An example of a deploy script that will deploy and call a simple contract.
export default async function (hre: HardhatRuntimeEnvironment) {
  // deploy proxy admin contract
  console.log(`Running deploy script for the eth2zksync target contract`);
  const proxyAdmin = "0x96892F3EaD26515592Da38432cFABad991BBd69d";
  const dao = "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4";

  // Initialize the wallet.
  const wallet = new Wallet(privateKey);

  // Create deployer object and load the artifact of the contract you want to deploy.
  const deployer = new Deployer(hre, wallet);
  // deploy logic contract
  const artifact = await deployer.loadArtifact("Eth2ZkSyncTarget");
  const logicContract = await deployer.deploy(artifact, []);
  const logicContractAddress = logicContract.address;
  console.log(`logic contract was deployed to ${logicContractAddress}`);
  const logicVerificationId = await hre.run("verify:verify", {
      address: logicContractAddress,
      contract: "contracts/ln/Eth2ZkSyncTarget.sol:Eth2ZkSyncTarget",
      constructorArguments: [],
  });

  console.log(`Logic Verification ID: ${logicVerificationId}`);

  // deploy proxy contract
  const logicFactory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const proxyAddress = await ProxyDeployer.deployProxyContract(deployer, proxyAdmin, logicFactory, logicContractAddress, [dao]);
  console.log(`proxy contract was deployed to ${proxyAddress}`);

  const calldata = ProxyDeployer.getInitializerData(logicFactory.interface, [dao], "initialize");
  const proxyVerificationId = await hre.run("verify:verify", {
      address: proxyAddress,
      constructorArguments: [logicContractAddress, proxyAdmin, calldata],
  });
  console.log(`Proxy Verification ID: ${logicVerificationId}`);
}

