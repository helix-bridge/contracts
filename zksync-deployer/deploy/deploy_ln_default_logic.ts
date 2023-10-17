import { Wallet } from "zksync-web3";
import * as ethers from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Deployer } from "@matterlabs/hardhat-zksync-deploy";

const privateKey = process.env.PRIKEY

export default async function (hre: HardhatRuntimeEnvironment) {
  // deploy proxy admin contract
  console.log(`Running deploy script for the zksync ln default logic contract`);

  // Initialize the wallet.
  const wallet = new Wallet(privateKey);

  // Create deployer object and load the artifact of the contract you want to deploy.
  const deployer = new Deployer(hre, wallet);
  // deploy create2 tool contract
  const artifact = await deployer.loadArtifact("LnDefaultBridge");
  const contract = await deployer.deploy(artifact, []);
  const contractAddress = contract.address;
  console.log(`ln default bridge logic contract was deployed to ${contractAddress}`);
  const verificationId = await hre.run("verify:verify", {
      address: contractAddress,
      contract: "contracts/ln/LnDefaultBridge.sol:LnDefaultBridge",
      constructorArguments: [],
  });

  console.log(`LnDefaultBridge Logic Verification ID: ${verificationId}`);
}

