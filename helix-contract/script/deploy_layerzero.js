// use account 0x88a39B052d477CfdE47600a7C9950a441Ce61cb4(nonce: 4) to deploy the same address: 0x61B6B8c7C00aA7F060a2BEDeE6b11927CC9c3eF1
var Configure = require("./configure/readconfig.js");

const privateKey = process.env.PRIKEY

function wallet(url) {
    const provider = new ethers.providers.JsonRpcProvider(url);
    const wallet = new ethers.Wallet(privateKey, provider);
    return wallet;
}

async function deployMessager(wallet, network, salt) {
    const { dao, lzEndpoint } = network;
    const messagerContract = await ethers.getContractFactory("LayerZeroMessager", wallet);
    const messager = await messagerContract.deploy(dao, lzEndpoint);
    await messager.deployed();
    console.log("finish to deploy messager, address:", messager.address);
    return messager.address;
}

async function main() {
    const chainInfo = Configure.chain('dev');
    const network = chainInfo['morph'];
    const w = wallet(network.url);
    await deployMessager(w, network, "msgport-messager-v1.0.0");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
 
