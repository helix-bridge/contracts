const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');

var Create2 = require("./create2.js");

const privateKey = process.env.PRIKEY

const arbitrumNetwork = {
    url: "https://goerli-rollup.arbitrum.io/rpc",
    deployer: "0xbe6b2860d3c17a719be0A4911EA0EE689e8357f3",
};

const goerliNetwork = {
    url: "https://rpc.ankr.com/eth_goerli",
    deployer: "0xbe6b2860d3c17a719be0A4911EA0EE689e8357f3",
};

const mantleNetwork = {
    url: "https://rpc.testnet.mantle.xyz",
    deployer: "0xbe6b2860d3c17a719be0A4911EA0EE689e8357f3",
};

const lineaNetwork = {
    url: "https://rpc.goerli.linea.build",
    deployer: "0xbe6b2860d3c17a719be0A4911EA0EE689e8357f3",
};

function wallet(url) {
    const provider = new ethers.providers.JsonRpcProvider(url);
    const wallet = new ethers.Wallet(privateKey, provider);
    return wallet;
}

async function deployLnDefaultBridge(wallet, deployerAddress, salt) {
    const bridgeContract = await ethers.getContractFactory("LnDefaultBridge", wallet);
    const bytecode = Create2.getDeployedBytecode(bridgeContract, [], []);
    const address = await Create2.deploy(deployerAddress, wallet, bytecode, salt);
    console.log("finish to deploy ln default bridge logic, address: ", address);
}

async function deployLnOppositeBridge(wallet, deployerAddress, salt) {
    const bridgeContract = await ethers.getContractFactory("LnOppositeBridge", wallet);
    const bytecode = Create2.getDeployedBytecode(bridgeContract, [], []);
    const address = await Create2.deploy(deployerAddress, wallet, bytecode, salt);
    console.log("finish to deploy ln opposite bridge logic, address: ", address);
}

// 2. deploy mapping token factory
async function main() {
    const network = lineaNetwork;
    const w = wallet(network.url);
    await deployLnDefaultBridge(w, network.deployer, "ln-default-logic-v1.0.0");
    await deployLnOppositeBridge(w, network.deployer, "ln-opposite-logic-v1.0.0");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

