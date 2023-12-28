const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');

var Create2 = require("./create2.js");

const privateKey = process.env.PRIKEY

const goerliNetwork = {
    url: "https://rpc.ankr.com/eth_goerli",
    deployer: "0xbe6b2860d3c17a719be0A4911EA0EE689e8357f3",
};

function wallet(url) {
    const provider = new ethers.providers.JsonRpcProvider(url);
    const wallet = new ethers.Wallet(privateKey, provider);
    return wallet;
}

async function deployLnBridgeV3(wallet, deployerAddress, salt) {
    const bridgeContract = await ethers.getContractFactory("HelixLnBridgeV3", wallet);
    const bytecode = Create2.getDeployedBytecode(bridgeContract, [], []);
    const address = await Create2.deploy(deployerAddress, wallet, bytecode, salt);
    console.log("finish to deploy lnv3 bridge logic, address: ", address);
    return address;
}

// 2. deploy mapping token factory
async function main() {
    const w = wallet(goerliNetwork.url);
    const logicAddress = await deployLnBridgeV3(w, goerliNetwork.deployer, "lnv3-logic-v1.0.0");
    console.log("finish to deploy logic contract, network is: ", goerliNetwork.url);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

