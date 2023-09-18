var ProxyDeployer = require("./proxy.js");

const privateKey = process.env.PRIKEY

const lineaNetwork = {
    url: "https://rpc.goerli.linea.build",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    chainId: 59140,
    defaultBridgeProxy: "0x54cc9716905ba8ebdD01E6364125cA338Cd0054E",
    oppositeBridgeProxy: "0x79e6f452f1e491a7aF0382FA0a6EF9368691960D",
    axelarMessager: "0x1c90D8027712015b9A93dE40efFe83787AA843B3",
};

const arbitrumNetwork = {
    url: "https://goerli-rollup.arbitrum.io/rpc",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    chainId: 421613,
    defaultBridgeProxy: "0x54cc9716905ba8ebdD01E6364125cA338Cd0054E",
    oppositeBridgeProxy: "0x79e6f452f1e491a7aF0382FA0a6EF9368691960D",
    axelarMessager: "0x94cC54D6fEC47146f18c32476A715ed20D6eC801",
};

const goerliNetwork = {
    url: "https://rpc.ankr.com/eth_goerli",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    chainId: 5,
    defaultBridgeProxy: "0x54cc9716905ba8ebdD01E6364125cA338Cd0054E",
    oppositeBridgeProxy: "0x79e6f452f1e491a7aF0382FA0a6EF9368691960D",
    axelarMessager: "0x5BdECe2537A36aEC8aa1497310d55e8284c5bDa9",
};

const mantleNetwork = {
    url: "https://rpc.testnet.mantle.xyz",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    chainId: 5001,
    defaultBridgeProxy: "0x54cc9716905ba8ebdD01E6364125cA338Cd0054E",
    oppositeBridgeProxy: "0x79e6f452f1e491a7aF0382FA0a6EF9368691960D",
    axelarMessager: "0x374A9Ac632E6DdFBBDfE5F1e60B14bB58452a7e2",
};

function wallet(url) {
    const provider = new ethers.providers.JsonRpcProvider(url);
    const wallet = new ethers.Wallet(privateKey, provider);
    return wallet;
}

async function switchMessager(bridgeName, sourceNetwork, sourceMessager, sourceWallet, targetNetwork, targetMessager, targetWallet) {
    if (bridgeName == 'LnDefaultBridge') {
        const sourceBridge = await ethers.getContractAt(bridgeName, sourceNetwork.defaultBridgeProxy, sourceWallet);
        await sourceBridge.setSendService(targetNetwork.chainId, targetNetwork.defaultBridgeProxy, sourceMessager);
        const targetBridge = await ethers.getContractAt(bridgeName, targetNetwork.defaultBridgeProxy, targetWallet);
        await targetBridge.setReceiveService(sourceNetwork.chainId, sourceNetwork.defaultBridgeProxy, targetMessager);
    } else {
        const sourceBridge = await ethers.getContractAt(bridgeName, sourceNetwork.oppositeBridgeProxy, sourceWallet);
        await sourceBridge.setReceiveService(targetNetwork.chainId, targetNetwork.oppositeBridgeProxy, sourceMessager);
        const targetBridge = await ethers.getContractAt(bridgeName, targetNetwork.oppositeBridgeProxy, targetWallet);
        await targetBridge.setSendService(sourceNetwork.chainId, sourceNetwork.oppositeBridgeProxy, targetMessager);
    }
}

async function deploy() {
    const goerliWallet = wallet(goerliNetwork.url);
    const mantleWallet = wallet(mantleNetwork.url);
    await switchMessager(
        "LnDefaultBridge",
        goerliNetwork, goerliNetwork.axelarMessager, goerliWallet,
        mantleNetwork, mantleNetwork.axelarMessager, mantleWallet);
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
    
