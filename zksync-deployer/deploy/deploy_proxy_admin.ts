import { Wallet } from "zksync-ethers";
import * as ethers from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Deployer } from "@matterlabs/hardhat-zksync-deploy";
import { ProxyDeployer } from "./proxy.ts";

// load wallet private key from env file
const privateKey = process.env.PRIKEY

// An example of a deploy script that will deploy and call a simple contract.
export default async function (hre: HardhatRuntimeEnvironment) {
  // deploy proxy admin contract
  console.log(`Running deploy script for the proxy admin contract`);

  // Initialize the wallet.
  const wallet = new Wallet(privateKey);

  // Create deployer object and load the artifact of the contract you want to deploy.
  const deployer = new Deployer(hre, wallet);
  const artifact = await deployer.loadArtifact("ProxyAdmin");
  const proxyAdminContract = await deployer.deploy(artifact, []);

  // Show the contract info.
  const contractAddress = proxyAdminContract.target;
  //const contractAddress = await ProxyDeployer.deployProxyAdmin(deployer);
  console.log(`deployed to ${contractAddress}`);
  
  const verificationId = await hre.run("verify:verify", {
      address: contractAddress,
      constructorArguments: [],
  });

  console.log(`ProxyAdmin Verification ID: ${verificationId}`);

}
