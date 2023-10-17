import { Wallet } from "zksync-web3";
import * as ethers from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Deployer } from "@matterlabs/hardhat-zksync-deploy";

const privateKey = process.env.PRIKEY
const dao = "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4";
const endpoint = "0x093D2CF57f764f09C3c2Ac58a42A2601B8C79281";

export default async function (hre: HardhatRuntimeEnvironment) {
  // deploy proxy admin contract
  console.log(`Running deploy script for the zksync layerzero contract`);

  // Initialize the wallet.
  const wallet = new Wallet(privateKey);

  // Create deployer object and load the artifact of the contract you want to deploy.
  const deployer = new Deployer(hre, wallet);
  // deploy create2 tool contract
  const artifact = await deployer.loadArtifact("LayerZeroMessager");
  const contract = await deployer.deploy(artifact, [dao, endpoint]);
  const contractAddress = contract.address;
  console.log(`layerzero contract was deployed to ${contractAddress}`);
  const verificationId = await hre.run("verify:verify", {
      address: contractAddress,
      contract: "contracts/ln/messager/LayerZeroMessager.sol:LayerZeroMessager",
      constructorArguments: [dao, endpoint],
  });

  console.log(`LayerZeroMessager Verification ID: ${verificationId}`);
}

