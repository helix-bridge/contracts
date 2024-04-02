const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');
const fs = require("fs");

var Create2 = require("./create2.js");

const privateKey = process.env.PRIKEY

async function deployxTokenBacking(wallet, deployerAddress, salt) {
    const bridgeContract = await ethers.getContractFactory("XTokenBacking", wallet);
    const bytecode = Create2.getDeployedBytecode(bridgeContract, [], []);
    const address = await Create2.deploy(deployerAddress, wallet, bytecode, salt);
    console.log("finish to deploy xToken backing logic, address: ", address);
    return address;
}

async function deployxTokenIssuing(wallet, deployerAddress, salt) {
    const bridgeContract = await ethers.getContractFactory("XTokenIssuing", wallet);
    const bytecode = Create2.getDeployedBytecode(bridgeContract, [], []);
    const address = await Create2.deploy(deployerAddress, wallet, bytecode, salt);
    console.log("finish to deploy xToken Issuing logic, address: ", address);
    return address;
}

function wallet(configure, network) {
    const provider = new ethers.providers.JsonRpcProvider(network.url);
    const wallet = new ethers.Wallet(privateKey, provider);
    return wallet;
}

// 2. deploy mapping token factory
async function main() {
    const pathConfig = "./address/ln-product.json";
    const configure = JSON.parse(
        fs.readFileSync(pathConfig, "utf8")
    );
    const network = configure.chains['crab-dvm'];
    const w = wallet(configure, network);
    
    const backingLogic = await deployxTokenBacking(w, network.deployer, "xTokenBacking-logic-v3.0.2");
    const issuingLogic = await deployxTokenIssuing(w, network.deployer, "xTokenIssuing-logic-v3.0.2");

    // 0x846EB1FD04aCe26B1d4F1a435292b52f0Ba1febE
    // 0x34a66e0e1F8Ba991EbF7dC66380DD053CEFc9964
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

