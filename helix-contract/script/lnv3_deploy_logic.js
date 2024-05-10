var Create2 = require("./api/create2.js");
var Configure = require("./configure/readconfig.js");
var LnBridgeV3LogicBytecode = require("./bytecode/LnBridgeV3Logic.js");

const privateKey = process.env.PRIKEY

function wallet(network) {
    const provider = new ethers.providers.JsonRpcProvider(network.url);
    const wallet = new ethers.Wallet(privateKey, provider);
    return wallet;
}

function chainInfo(configure, network) {
    return configure.chains[network];
}

async function deployLnBridgeV3(wallet, deployerAddress, salt) {
    //const bridgeContract = await ethers.getContractFactory("HelixLnBridgeV3", wallet);
    //const bytecode = Create2.getDeployedBytecode(bridgeContract, [], []);
    const bytecode = LnBridgeV3LogicBytecode;
    const address = await Create2.deploy(deployerAddress, wallet, bytecode, salt, 8000000);
    console.log("finish to deploy lnv3 bridge logic, address: ", address);
    return address;
}

// 2. deploy mapping token factory
async function main() {
    const chainInfo = Configure.chain('dev');
    const network = chainInfo['taiko-hekla'];
    const w = wallet(network);

    const logicAddress = await deployLnBridgeV3(w, network.deployer, "lnv3-logic-v1.0.0");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

