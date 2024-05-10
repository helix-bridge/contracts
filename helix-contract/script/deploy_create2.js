const fs = require("fs");
var Configure = require("./configure/readconfig.js");
var Create2 = require("./api/create2.js");

const privateKey = process.env.PRIKEY

function wallet(url) {
    const provider = new ethers.providers.JsonRpcProvider(url);
    const wallet = new ethers.Wallet(privateKey, provider);
    return wallet;
}

async function deployCreate2Deployer(networkUrl, version) {
    const w = wallet(networkUrl);
    const salt = ethers.utils.hexZeroPad(ethers.utils.hexlify(ethers.utils.toUtf8Bytes(version)), 32);
    const create2Contract = await ethers.getContractFactory("Create2Deployer", w);
    const bytecode = Create2.getDeployedBytecode(create2Contract, [], []);
    const unsignedTransaction = {
        from: w.address,
        to: "0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7",
        data: `${salt}${bytecode.slice(2)}`,
        gasLimit: 2000000,
        //gasPrice: 2100000000,
        //nonce: 0,
    };
    const tx = await w.sendTransaction(unsignedTransaction);
    console.log(`deploy create2 tx: ${tx.hash}, salt: ${salt}`);
    return;
}

// 2. deploy mapping token factory
async function main() {
    const chainInfo = Configure.chain('product');
    const network = chainInfo['astar'];

    await deployCreate2Deployer(network.url, 'v1.0.0');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

