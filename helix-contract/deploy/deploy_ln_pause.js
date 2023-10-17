const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');

var ProxyDeployer = require("./proxy.js");

const privateKey = process.env.PRIKEY

const networks = {
    lineaGoerli: {
        url: "https://rpc.goerli.linea.build",
        chainId: 59140,
        defaultBridgeProxy: "0x54cc9716905ba8ebdD01E6364125cA338Cd0054E",
        oppositeBridgeProxy: "0x79e6f452f1e491a7aF0382FA0a6EF9368691960D",
    },
    arbitrumGoerli: {
        url: "https://goerli-rollup.arbitrum.io/rpc",
        chainId: 421613,
        defaultBridgeProxy: "0x54cc9716905ba8ebdD01E6364125cA338Cd0054E",
        oppositeBridgeProxy: "0x79e6f452f1e491a7aF0382FA0a6EF9368691960D",
    },
    goerli: {
        url: "https://rpc.ankr.com/eth_goerli",
        chainId: 5,
        defaultBridgeProxy: "0x54cc9716905ba8ebdD01E6364125cA338Cd0054E",
        oppositeBridgeProxy: "0x79e6f452f1e491a7aF0382FA0a6EF9368691960D",
    },
    mantleGoerli: {
        url: "https://rpc.testnet.mantle.xyz",
        chainId: 5001,
        defaultBridgeProxy: "0x54cc9716905ba8ebdD01E6364125cA338Cd0054E",
        oppositeBridgeProxy: "0x79e6f452f1e491a7aF0382FA0a6EF9368691960D",
    },
};

function wait(ms) {
    return new Promise(resolve => setTimeout(() => resolve(), ms));
};

function wallet(url) {
    const provider = new ethers.providers.JsonRpcProvider(url);
    const wallet = new ethers.Wallet(privateKey, provider);
    return wallet;
}

async function pause(isDefault, network) {
    const w = wallet(network.url);
    if (isDefault) {
        const bridge = await ethers.getContractAt("LnDefaultBridge", network.defaultBridgeProxy, w);
        await bridge.pause();
    } else {
        const bridge = await ethers.getContractAt("LnOppositeBridge", network.oppositeBridgeProxy, w);
        await bridge.pause();
    }
}

async function unpause(isDefault, network) {
    const w = wallet(network.url);
    if (isDefault) {
        const bridge = await ethers.getContractAt("LnDefaultBridge", network.defaultBridgeProxy, w);
        await bridge.unpause();
    } else {
        const bridge = await ethers.getContractAt("LnOppositeBridge", network.oppositeBridgeProxy, w);
        await bridge.unpause();
    }
}

async function pauseAll() {
    for (let network in networks) {
        await pause(true, networks[network]);
    }
    for (let network in networks) {
        await pause(false, networks[network]);
    }
    }
}

async function unpauseAll() {
    for (let network in networks) {
        await unpause(true, networks[network]);
    }
    for (let network in networks) {
        await unpause(false, networks[network]);
    }
}

async function main() {
    await pauseAll();
    console.log("finished!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
