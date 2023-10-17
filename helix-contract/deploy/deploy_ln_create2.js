const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');

var Create2 = require("./create2.js");

const privateKey = process.env.PRIKEY

function wallet(url) {
    const provider = new ethers.providers.JsonRpcProvider(url);
    const wallet = new ethers.Wallet(privateKey, provider);
    return wallet;
}

async function deployCreate2Deployer(networkUrl, version) {
    const salt = ethers.utils.hexZeroPad(ethers.utils.hexlify(ethers.utils.toUtf8Bytes(version)), 32);
    const create2Contract = await ethers.getContractFactory("Create2Deployer", wallet);
    const bytecode = Create2.getDeployedBytecode(create2Contract, [], []);
    const w = wallet(networkUrl);
    const unsignedTransaction = {
        from: w.address,
        to: "0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7",
        data: `${salt}${bytecode.slice(2)}`
    };
    const tx = await w.sendTransaction(unsignedTransaction);
    console.log(`deploy create2 tx: ${tx.hash}, salt: ${salt}`);
    return;
}

// 2. deploy mapping token factory
async function main() {
    //await deployCreate2Deployer('https://rpc.ankr.com/eth_goerli', 'v1.0.0');
    //await deployCreate2Deployer('https://goerli-rollup.arbitrum.io/rpc', 'v1.0.0');
    await deployCreate2Deployer('https://rpc.testnet.mantle.xyz', 'v1.0.0');
    await deployCreate2Deployer('https://rpc.goerli.linea.build', 'v1.0.0');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

