var ProxyDeployer = require("./proxy.js");

const privateKey = process.env.PRIKEY

const lineaNetwork = {
    url: "https://rpc.goerli.linea.build",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    chainId: 59140,
    defaultBridgeProxy: "0x54cc9716905ba8ebdD01E6364125cA338Cd0054E",
    oppositeBridgeProxy: "0x79e6f452f1e491a7aF0382FA0a6EF9368691960D",
    axelarMessager: "0xC39491aBf9EA6a81b1cd7e13869fd8b1204fe8A0",
    debugMessager: "0x25Ce9C92526D002a11aBA105563a713357429A99",
};

const arbitrumNetwork = {
    url: "https://goerli-rollup.arbitrum.io/rpc",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    chainId: 421613,
    defaultBridgeProxy: "0x54cc9716905ba8ebdD01E6364125cA338Cd0054E",
    oppositeBridgeProxy: "0x79e6f452f1e491a7aF0382FA0a6EF9368691960D",
    axelarMessager: "0x54269881797A501017Fa161f326469947D138877",
    debugMessager: "0x7f431D5ba484Eb96811C469BE3DcbB23c67ae4a8",
};

const goerliNetwork = {
    url: "https://rpc.ankr.com/eth_goerli",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    chainId: 5,
    defaultBridgeProxy: "0x54cc9716905ba8ebdD01E6364125cA338Cd0054E",
    oppositeBridgeProxy: "0x79e6f452f1e491a7aF0382FA0a6EF9368691960D",
    axelarMessager: "0x6B2F3bc0A01cf07F69e906465c2a1c7ea83fd49d",
    debugMessager: "0x2e8D237226041FAFe3F66b6cfc54b064923D454E",
};

const mantleNetwork = {
    url: "https://rpc.testnet.mantle.xyz",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    chainId: 5001,
    defaultBridgeProxy: "0x54cc9716905ba8ebdD01E6364125cA338Cd0054E",
    oppositeBridgeProxy: "0x79e6f452f1e491a7aF0382FA0a6EF9368691960D",
    axelarMessager: "0xA50Ad777C803206F041622101f261168A0763066",
    debugMessager: "0x84f7a56483C100ECb12CbB4A31b7873dAE0d8E9B",
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
        console.log("source switch finished");
        const targetBridge = await ethers.getContractAt(bridgeName, targetNetwork.defaultBridgeProxy, targetWallet);
        await targetBridge.setReceiveService(sourceNetwork.chainId, sourceNetwork.defaultBridgeProxy, targetMessager);
        console.log("target switch finished");
    } else {
        const sourceBridge = await ethers.getContractAt(bridgeName, sourceNetwork.oppositeBridgeProxy, sourceWallet);
        await sourceBridge.setReceiveService(targetNetwork.chainId, targetNetwork.oppositeBridgeProxy, sourceMessager);
        console.log("source switch finished");
        const targetBridge = await ethers.getContractAt(bridgeName, targetNetwork.oppositeBridgeProxy, targetWallet);
        await targetBridge.setSendService(sourceNetwork.chainId, sourceNetwork.oppositeBridgeProxy, targetMessager);
        console.log("target switch finished");
    }
}

async function switchToDebug(bridgeName, network, remoteNetwork) {
    const w = wallet(network.url);
    if (bridgeName == 'LnDefaultBridge') {
        const bridge = await ethers.getContractAt(bridgeName, network.defaultBridgeProxy, w);
        await bridge.setSendService(remoteNetwork.chainId, remoteNetwork.defaultBridgeProxy, network.debugMessager);
        await bridge.setReceiveService(remoteNetwork.chainId, remoteNetwork.defaultBridgeProxy, network.debugMessager);
    } else {
        const bridge = await ethers.getContractAt(bridgeName, network.oppositeBridgeProxy, w);
        await bridge.setReceiveService(remoteNetwork.chainId, remoteNetwork.oppositeBridgeProxy, network.debugMessager);
    }
    console.log("switch to debug messager finished");
}

async function deploy() {
    const goerliWallet = wallet(goerliNetwork.url);
    const mantleWallet = wallet(mantleNetwork.url);
    //await switchToDebug("LnDefaultBridge", mantleNetwork, goerliNetwork);
    //return;
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
    
