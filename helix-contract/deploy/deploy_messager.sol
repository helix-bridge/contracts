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

async function deployDirectMessager(wallet, deployerAddress, salt) {
    const messagerContract = await ethers.getContractFactory("DirectMessager", wallet);
    const bytecode = Create2.getDeployedBytecode(messagerContract, ['address'], [wallet.address]);
    const address = await Create2.deploy(deployerAddress, wallet, bytecode, salt, 8000000);
    console.log("finish to deploy direct messager, address: ", address);
    return address;
}

async function deployLayerzeroMessager(wallet, deployerAddress, salt, endpoint) {
    const messagerContract = await ethers.getContractFactory("LayerZeroMessager", wallet);
    const bytecode = Create2.getDeployedBytecode(messagerContract, ['address', 'address'], [wallet.address, endpoint]);
    const address = await Create2.deploy(deployerAddress, wallet, bytecode, salt, 8000000);
    console.log("finish to deploy layerzero messager, address: ", address);
    return address;
}

// 2. deploy mapping token factory
async function main() {
    const pathConfig = "./address/ln-dev.json";
    const configure = JSON.parse(
        fs.readFileSync(pathConfig, "utf8")
    );

    const network = chainInfo(configure, "bera");
    const w = wallet(configure, network);

    //const logicAddress = await deployDirectMessager(w, network.deployer, "direct-messager-v1.0.0");
    const layerzero = await deployLayerzeroMessager(w, network.deployer, "layerzero-messager-v1.0.0", network.layerzeroEndpoint);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

