const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');
const fs = require("fs");

var Create2 = require("./create2.js");

const privateKey = process.env.PRIKEY

function wallet(configure, network) {
    const provider = new ethers.providers.JsonRpcProvider(network.url);
    const wallet = new ethers.Wallet(privateKey, provider);
    return wallet;
}

function chainInfo(configure, network) {
    return configure.chains[network];
}

async function deployLnBridgeV3(wallet, deployerAddress, salt) {
    const bridgeContract = await ethers.getContractFactory("HelixLnBridgeV3ForBlast", wallet);
    const bytecode = Create2.getDeployedBytecode(bridgeContract, [], []);
    //const address = await Create2.deploy(deployerAddress, wallet, bytecode, salt, 15000000);
    const address = await Create2.deploy(deployerAddress, wallet, bytecode, salt);
    console.log("finish to deploy lnv3 bridge logic, address: ", address);
    return address;
}

// 2. deploy mapping token factory
async function main() {
    const pathConfig = "./address/ln-dev.json";
    const configure = JSON.parse(
        fs.readFileSync(pathConfig, "utf8")
    );

    const network = chainInfo(configure, "blast-sepolia");
    const w = wallet(configure, network);
    const logicAddress = await deployLnBridgeV3(w, network.deployer, "lnv3-logic-v1.0.0");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

