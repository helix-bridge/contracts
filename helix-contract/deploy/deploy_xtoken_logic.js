const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');

var Create2 = require("./create2.js");

const privateKey = process.env.PRIKEY

const crabNetwork = {
    url: "https://crab-rpc.darwinia.network",
    deployer: "0xbe6b2860d3c17a719be0A4911EA0EE689e8357f3",
};

const sepoliaNetwork = {
    url: "https://rpc-sepolia.rockx.com",
    deployer: "0xbe6b2860d3c17a719be0A4911EA0EE689e8357f3",
}

function wallet(url) {
    const provider = new ethers.providers.JsonRpcProvider(url);
    const wallet = new ethers.Wallet(privateKey, provider);
    return wallet;
}

async function deployxTokenBacking(wallet, deployerAddress, salt) {
    const bridgeContract = await ethers.getContractFactory("xTokenBacking", wallet);
    const bytecode = Create2.getDeployedBytecode(bridgeContract, [], []);
    const address = await Create2.deploy(deployerAddress, wallet, bytecode, salt);
    console.log("finish to deploy xToken backing logic, address: ", address);
    return address;
}

async function deployxTokenIssuing(wallet, deployerAddress, salt) {
    const bridgeContract = await ethers.getContractFactory("xTokenIssuing", wallet);
    const bytecode = Create2.getDeployedBytecode(bridgeContract, [], []);
    const address = await Create2.deploy(deployerAddress, wallet, bytecode, salt);
    console.log("finish to deploy xToken Issuing logic, address: ", address);
    return address;
}

// 2. deploy mapping token factory
async function main() {
    // deploy backing on crab
    const walletCrab = wallet(crabNetwork.url);
    const backingLogic = await deployxTokenBacking(walletCrab, crabNetwork.deployer, "xTokenBacking-logic-v1.0.1");

    // deploy issuing on sepolia
    const walletSpeolia = wallet(sepoliaNetwork.url);
    const issuingLogic = await deployxTokenIssuing(walletSpeolia, sepoliaNetwork.deployer, "xTokenIssuing-logic-v1.0.0");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

