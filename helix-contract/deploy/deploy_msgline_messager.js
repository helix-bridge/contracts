const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');
const fs = require("fs");

var ProxyDeployer = require("./proxy.js");

const privateKey = process.env.PRIKEY

const crabNetwork = {
    name: "crab",
    url: "https://crab-rpc.darwinia.network",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    deployer: "0xbe6b2860d3c17a719be0A4911EA0EE689e8357f3",
    msgline: "0x000000000EFcBAdA3793cC59c62D79b9f56Ae48F",
};

const sepoliaNetwork = {
    name: "sepolia",
    url: "https://rpc-sepolia.rockx.com",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    deployer: "0xbe6b2860d3c17a719be0A4911EA0EE689e8357f3",
    msgline: "0x000000000EFcBAdA3793cC59c62D79b9f56Ae48F",
};

function wallet(url) {
    const provider = new ethers.providers.JsonRpcProvider(url);
    const wallet = new ethers.Wallet(privateKey, provider);
    return wallet;
}

async function deployMessager(wallet, dao, msgline, deployer) {
    const messagerContract = await ethers.getContractFactory("MsglineMessager", wallet);
    const messager = await messagerContract.deploy(dao, msgline);
    await messager.deployed();
    console.log("finish to deploy messager, address:", messager.address);
    return messager.address;
}

async function deploy() {
    const walletCrab = wallet(crabNetwork.url);
    await deployMessager(walletCrab, crabNetwork.dao, crabNetwork.msgline, crabNetwork.deployer);

    const walletSepolia = wallet(sepoliaNetwork.url);
    await deployMessager(walletSepolia, sepoliaNetwork.dao, sepoliaNetwork.msgline, sepoliaNetwork.deployer);
}

async function main() {
    await deploy();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
    
