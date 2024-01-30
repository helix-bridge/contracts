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

async function deployLnDefaultBridge(wallet, deployerAddress, salt) {
    const bridgeContract = await ethers.getContractFactory("LnDefaultBridge", wallet);
    const bytecode = Create2.getDeployedBytecode(bridgeContract, [], []);
    const address = await Create2.deploy(deployerAddress, wallet, bytecode, salt);
    console.log("finish to deploy ln default bridge logic, address: ", address);
    return address;
}

async function deployLnOppositeBridge(wallet, deployerAddress, salt) {
    const bridgeContract = await ethers.getContractFactory("LnOppositeBridge", wallet);
    const bytecode = Create2.getDeployedBytecode(bridgeContract, [], []);
    const address = await Create2.deploy(deployerAddress, wallet, bytecode, salt);
    console.log("finish to deploy ln opposite bridge logic, address: ", address);
    return address;
}

// 2. deploy mapping token factory
async function main() {
    const pathConfig = "./address/ln-dev.json";
    const configure = JSON.parse(
        fs.readFileSync(pathConfig, "utf8")
    );

    // deploy
    const network = configure.chains['arbitrum-sepolia'];
    const w = wallet(configure, network);
    //const logicAddress = await deployLnDefaultBridge(w, network.deployer, "lnv2-default-logic-v1.0.0");
    //const logicAddress = await deployLnOppositeBridge(w, network.deployer, "lnv2-opposite-logic-v1.0.0");

    console.log("finish to deploy logic contract, address is: ", logicAddress);

    // upgrade
    //const proxyAdmin = await ethers.getContractAt("ProxyAdmin", "0xE3979fFa68BBa1F53c6F502c8F5788B370d28730", w);
    //await proxyAdmin.upgrade("0x54cc9716905ba8ebdD01E6364125cA338Cd0054E", logicAddress);
    //console.log("finished");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

