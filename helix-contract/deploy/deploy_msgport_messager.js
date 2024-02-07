const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');
const fs = require("fs");
var Create2 = require("./create2.js");

const privateKey = process.env.PRIKEY

function wallet(url) {
    const provider = new ethers.providers.JsonRpcProvider(url);
    const wallet = new ethers.Wallet(privateKey, provider);
    return wallet;
}

async function deployMessager(wallet, dao, msgport, deployer, salt) {
    const messagerContract = await ethers.getContractFactory("MsgportMessager", wallet);
    const bytecode = Create2.getDeployedBytecode(messagerContract, ["address", "address"], [dao, msgport]);
    const address = await Create2.deploy(deployer, wallet, bytecode, salt, 2000000);
    console.log("finish to deploy messager, address:", address);
    return address;
}

function wallet(configure, network) {
    const provider = new ethers.providers.JsonRpcProvider(network.url);
    const wallet = new ethers.Wallet(privateKey, provider);
    return wallet;
}

async function main() {
    const pathConfig = "./address/ln-dev.json";
    const configure = JSON.parse(
        fs.readFileSync(pathConfig, "utf8")
    );
    const network = configure.chains['sepolia'];
    const w = wallet(configure, network);
    await deployMessager(w, network.dao, network.ormpPort, network.deployer, "msgport-messager-v1.0.0");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
    
