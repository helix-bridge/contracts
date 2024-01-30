import { Wallet } from "zksync-ethers";
import * as ethers from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Deployer } from "@matterlabs/hardhat-zksync-deploy";

const privateKey = process.env.PRIKEY

const tokens = [
  {
    name: "Helix Test Token USDT",
    symbol: "USDT",
    decimals: 6
  },
  {
    name: "Helix Test Token USDC",
    symbol: "USDC",
    decimals: 6
  }
];

export default async function (hre: HardhatRuntimeEnvironment) {
  // deploy proxy admin contract
  console.log(`Running deploy script for the zksync ln test token contract`);

  // Initialize the wallet.
  const wallet = new Wallet(privateKey);

  // Create deployer object and load the artifact of the contract you want to deploy.
  const deployer = new Deployer(hre, wallet);
  // deploy create2 tool contract
  const artifact = await deployer.loadArtifact("HelixTestErc20");

  for (const token of tokens) {
    const contract = await deployer.deploy(artifact, [token.name, token.symbol, token.decimals]);
    const contractAddress = contract.target;
    console.log(`ln test token contract was deployed to ${contractAddress}`);
    const verificationId = await hre.run("verify:verify", {
        address: contractAddress,
        constructorArguments: [token.name, token.symbol, token.decimals],
    });
    console.log(`Ln Test Erc20 Contract Verification ID: ${verificationId}`);
  }
}

