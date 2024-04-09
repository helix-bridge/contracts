var Create2 = require("./api/create2.js");
var Configure = require("./configure/readconfig.js");

const privateKey = process.env.PRIKEY

function wallet(url) {
    const provider = new ethers.providers.JsonRpcProvider(url);
    const wallet = new ethers.Wallet(privateKey, provider);
    return wallet;
}

async function deployMessager(wallet, network, salt) {
    const { dao, ormpPort, deployer } = network;
    const messagerContract = await ethers.getContractFactory("MsgportMessager", wallet);
    const bytecode = Create2.getDeployedBytecode(messagerContract, ["address", "address"], [dao, ormpPort]);
    const address = await Create2.deploy(deployer, wallet, bytecode, salt, 2000000);
    console.log("finish to deploy messager, address:", address);
    return address;
}

async function main() {
    const chainInfo = Configure.chain('dev');
    const network = chainInfo['sepolia'];
    const w = wallet(network.url);
    await deployMessager(w, network, "msgport-messager-v1.0.0");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
 
