const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');
const fs = require("fs");

var ProxyDeployer = require("./proxy.js");

const privateKey = process.env.PRIKEY

const lineaNetwork = {
    url: "https://rpc.goerli.linea.build",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    chainId: 59140,
    lzChainId: 10157,
    // layerzero used
    endpoint: "0x6aB5Ae6822647046626e83ee6dB8187151E1d5ab",
    messageService: "0xC499a572640B64eA1C8c194c43Bc3E19940719dC",
    axGateway: "0xe432150cce91c13a887f7D836923d5597adD8E31",
    axGasService: "0xbE406F0189A0B4cf3A05C286473D23791Dd44Cc6",
    axName: "linea",
};

// zkSync should be deployed first
const zkSyncNetwork = {
    url: "https://zksync2-testnet.zksync.dev",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    chainId: 280,
    lzChainId: 10165,
    //endpoint: "0x093D2CF57f764f09C3c2Ac58a42A2601B8C79281",
    layerzeroMessager: "0x7e303b0A3F08F9fa5F5629Abb998B8Deba89049B",
};

const arbitrumNetwork = {
    url: "https://goerli-rollup.arbitrum.io/rpc",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    chainId: 421613,
    lzChainId: 10143,
    endpoint: "0x6aB5Ae6822647046626e83ee6dB8187151E1d5ab",
    axGateway: "0xe432150cce91c13a887f7D836923d5597adD8E31",
    axGasService: "0xbE406F0189A0B4cf3A05C286473D23791Dd44Cc6",
    axName: "arbitrum",
};

const goerliNetwork = {
    url: "https://rpc.ankr.com/eth_goerli",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    chainId: 5,
    lzChainId: 10121,
    endpoint: "0xbfD2135BFfbb0B5378b56643c2Df8a87552Bfa23",
    messageService: "0x70BaD09280FD342D02fe64119779BC1f0791BAC2",
    inbox: "0x6BEbC4925716945D46F0Ec336D5C2564F419682C",
    axGateway: "0xe432150cce91c13a887f7D836923d5597adD8E31",
    axGasService: "0xbE406F0189A0B4cf3A05C286473D23791Dd44Cc6",
    axName: "ethereum-2",
};

const mantleNetwork = {
    url: "https://rpc.testnet.mantle.xyz",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    chainId: 5001,
    lzChainId: 10181,
    endpoint: "0x2cA20802fd1Fd9649bA8Aa7E50F0C82b479f35fe",
    axGateway: "0xe432150cce91c13a887f7D836923d5597adD8E31",
    axGasService: "0xbE406F0189A0B4cf3A05C286473D23791Dd44Cc6",
    axName: "mantle",
};

const crabNetwork = {
    url: "https://crab-rpc.darwinia.network",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    chainId: 44,
    msglineChainId: 44,
    msglineAddress: "0x000C61ca18583C9504691f43Ea43C2c638772487",
};

const arbitrumSepoliaNetwork = {
    url: "https://sepolia-rollup.arbitrum.io/rpc",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    chainId: 421614,
    msglineChainId: 421614,
    msglineAddress: "0x000C61ca18583C9504691f43Ea43C2c638772487",
    lzChainId: 10231,
    endpoint: "0x6098e96a28E02f27B1e6BD381f870F1C8Bd169d3",
    layerzeroMessager: "0x87A649246974732f7AbBe01F2DD81E3D829EF0B7",
};

const scrollNetwork = {
    url: "https://sepolia-rpc.scroll.io/",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    chainId: 534351,
    scrollMessager: "0xBa50f5340FB9F3Bd074bD638c9BE13eCB36E603d",
}

const sepoliaNetwork = {
    url: "https://rpc2.sepolia.org",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    chainId: 11155111,
    scrollMessager: "0x50c7d3e7f7c656493D1D76aaa1a836CedfCBB16A",
    lzChainId: 10161,
    endpoint: "0xae92d5aD7583AD66E49A0c67BAd18F6ba52dDDc1",
    layerzeroMessager: "0x33C9916a43507aa0a89a3e889522f840aa1245fE",
}

const zkSyncSepoliaNetwork = {
    url: "https://sepolia.era.zksync.dev",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    chainId: 300,
    lzChainId: 10165,
    endpoint: "0x093D2CF57f764f09C3c2Ac58a42A2601B8C79281",
    layerzeroMessager: "0xf29244511DA9242D8A452f7EB1264B52A19f5058",
}

function wait(ms) {
    return new Promise(resolve => setTimeout(() => resolve(), ms));
};

function wallet(url) {
    const provider = new ethers.providers.JsonRpcProvider(url);
    const wallet = new ethers.Wallet(privateKey, provider);
    return wallet;
}

async function deployContract(wallet, name, ...args) {
    const messagerContract = await ethers.getContractFactory(name, wallet);
    const messager = await messagerContract.deploy(...args);
    await messager.deployed();
    console.log("finish to deploy service", name, messager.address);
    return messager;
}

// 2. deploy mapping token factory
async function main() {
    const arbWallet = wallet(arbitrumNetwork.url);
    const lineaWallet = wallet(lineaNetwork.url);
    const goerliWallet = wallet(goerliNetwork.url);
    const mantleWallet = wallet(mantleNetwork.url);
    const zkSyncWallet = wallet(zkSyncNetwork.url);
    const crabWallet = wallet(crabNetwork.url);
    const arbSepoliaWallet = wallet(arbitrumSepoliaNetwork.url);
    const zkSyncSepoliaWallet = wallet(zkSyncSepoliaNetwork.url);
    const scrollWallet = wallet(scrollNetwork.url);
    const sepoliaWallet = wallet(sepoliaNetwork.url);

    // deploy arb<>eth
    /*
    console.log("deploy arb <> eth messager");
    const Eth2ArbReceiveService = await deployContract(arbWallet, "Eth2ArbReceiveService", arbitrumNetwork.dao, goerliNetwork.chainId);
    const Eth2ArbSendService = await deployContract(goerliWallet, "Eth2ArbSendService", goerliNetwork.dao, goerliNetwork.inbox, arbitrumNetwork.chainId);
    await wait(10000);
    await Eth2ArbReceiveService.setRemoteMessager(Eth2ArbSendService.address);
    await Eth2ArbSendService.setRemoteMessager(Eth2ArbReceiveService.address);
    await wait(10000);
    // deploy linea<>eth
    console.log("deploy linea <> eth messager");
    const Eth2LineaReceiveService = await deployContract(lineaWallet, "Eth2LineaReceiveService", lineaNetwork.dao, lineaNetwork.messageService, goerliNetwork.chainId);
    const Eth2LineaSendService = await deployContract(goerliWallet, "Eth2LineaSendService", goerliNetwork.dao, goerliNetwork.messageService, lineaNetwork.chainId);
    await wait(10000);
    await Eth2LineaReceiveService.setRemoteMessager(Eth2LineaSendService.address);
    await Eth2LineaSendService.setRemoteMessager(Eth2LineaReceiveService.address);
    await wait(10000);
    */
    // deploy layerZero
    //console.log("deploy layerzero messager");
    //const lzGoerli = await deployContract(goerliWallet, "LayerZeroMessager", goerliNetwork.dao, goerliNetwork.endpoint);
    //const lzArbitrum = await deployContract(arbWallet, "LayerZeroMessager", arbitrumNetwork.dao, arbitrumNetwork.endpoint);
    //const lzLinea = await deployContract(lineaWallet, "LayerZeroMessager", lineaNetwork.dao, lineaNetwork.endpoint);
    //const lzMantle = await deployContract(mantleWallet, "LayerZeroMessager", mantleNetwork.dao, mantleNetwork.endpoint);
    //// zkSync has been deployed
    //const lzZkSync = await ethers.getContractAt("LayerZeroMessager", zkSyncNetwork.layerzeroMessager, zkSyncWallet);

    //const lzSepolia = await deployContract(sepoliaWallet, "LayerZeroMessager", sepoliaNetwork.dao, sepoliaNetwork.endpoint);
    //const lzArbitrumSepolia = await deployContract(arbSepoliaWallet, "LayerZeroMessager", arbitrumSepoliaNetwork.dao, arbitrumSepoliaNetwork.endpoint);
    //await lzSepolia.setRemoteMessager(arbitrumSepoliaNetwork.chainId, arbitrumSepoliaNetwork.lzChainId, lzArbitrumSepolia.address);
    //await lzArbitrumSepolia.setRemoteMessager(sepoliaNetwork.chainId, sepoliaNetwork.lzChainId, lzSepolia.address);
    const lzzkSyncSepolia = await ethers.getContractAt("LayerZeroMessager", zkSyncSepoliaNetwork.layerzeroMessager, zkSyncSepoliaWallet);
    const lzArbitrumSepolia = await ethers.getContractAt("LayerZeroMessager", arbitrumSepoliaNetwork.layerzeroMessager, arbSepoliaWallet);
    const lzSepolia = await ethers.getContractAt("LayerZeroMessager", sepoliaNetwork.layerzeroMessager, sepoliaWallet);

    await lzSepolia.setRemoteMessager(zkSyncSepoliaNetwork.chainId, zkSyncSepoliaNetwork.lzChainId, lzzkSyncSepolia.address);
    await lzArbitrumSepolia.setRemoteMessager(zkSyncSepoliaNetwork.chainId, zkSyncSepoliaNetwork.lzChainId, lzzkSyncSepolia.address);
    await lzzkSyncSepolia.setRemoteMessager(arbitrumSepoliaNetwork.chainId, arbitrumSepoliaNetwork.lzChainId, lzArbitrumSepolia.address);
    await lzzkSyncSepolia.setRemoteMessager(sepoliaNetwork.chainId, sepoliaNetwork.lzChainId, lzSepolia.address);

    console.log("confgure layerzero messager");
    /*
    await lzGoerli.setRemoteMessager(arbitrumNetwork.chainId, arbitrumNetwork.lzChainId, lzArbitrum.address);
    await lzLinea.setRemoteMessager(arbitrumNetwork.chainId, arbitrumNetwork.lzChainId, lzArbitrum.address);
    await lzMantle.setRemoteMessager(arbitrumNetwork.chainId, arbitrumNetwork.lzChainId, lzArbitrum.address);
    await lzZkSync.setRemoteMessager(arbitrumNetwork.chainId, arbitrumNetwork.lzChainId, lzArbitrum.address);

    await lzGoerli.setRemoteMessager(lineaNetwork.chainId, lineaNetwork.lzChainId, lzLinea.address);
    await lzArbitrum.setRemoteMessager(lineaNetwork.chainId, lineaNetwork.lzChainId, lzLinea.address);
    await lzMantle.setRemoteMessager(lineaNetwork.chainId, lineaNetwork.lzChainId, lzLinea.address);
    await lzZkSync.setRemoteMessager(lineaNetwork.chainId, lineaNetwork.lzChainId, lzLinea.address);

    await lzGoerli.setRemoteMessager(mantleNetwork.chainId, mantleNetwork.lzChainId, lzMantle.address);
    await lzArbitrum.setRemoteMessager(mantleNetwork.chainId, mantleNetwork.lzChainId, lzMantle.address);
    await lzLinea.setRemoteMessager(mantleNetwork.chainId, mantleNetwork.lzChainId, lzMantle.address);
    await lzZkSync.setRemoteMessager(mantleNetwork.chainId, mantleNetwork.lzChainId, lzMantle.address);

    await lzGoerli.setRemoteMessager(zkSyncNetwork.chainId, zkSyncNetwork.lzChainId, lzZkSync.address);
    await lzArbitrum.setRemoteMessager(zkSyncNetwork.chainId, zkSyncNetwork.lzChainId, lzZkSync.address);
    await lzLinea.setRemoteMessager(zkSyncNetwork.chainId, zkSyncNetwork.lzChainId, lzZkSync.address);
    await lzMantle.setRemoteMessager(zkSyncNetwork.chainId, zkSyncNetwork.lzChainId, lzZkSync.address);

    await lzArbitrum.setRemoteMessager(goerliNetwork.chainId, goerliNetwork.lzChainId, lzGoerli.address);
    await lzLinea.setRemoteMessager(goerliNetwork.chainId, goerliNetwork.lzChainId, lzGoerli.address);
    await lzMantle.setRemoteMessager(goerliNetwork.chainId, goerliNetwork.lzChainId, lzGoerli.address);
    await lzZkSync.setRemoteMessager(goerliNetwork.chainId, goerliNetwork.lzChainId, lzGoerli.address);
    */
    // deploy axelar
    /*
    console.log("deploy axelar messager");
    const axGoerli = await deployContract(goerliWallet, "AxelarMessager", goerliNetwork.dao, goerliNetwork.axGateway, goerliNetwork.axGasService);
    const axArbitrum = await deployContract(arbWallet, "AxelarMessager", arbitrumNetwork.dao, arbitrumNetwork.axGateway, arbitrumNetwork.axGasService);
    const axLinea = await deployContract(lineaWallet, "AxelarMessager", lineaNetwork.dao, lineaNetwork.axGateway, lineaNetwork.axGasService);
    const axMantle = await deployContract(mantleWallet, "AxelarMessager", mantleNetwork.dao, mantleNetwork.axGateway, mantleNetwork.axGasService);
    console.log("configure axelar messager");
    await axGoerli.setRemoteMessager(arbitrumNetwork.chainId, arbitrumNetwork.axName, axArbitrum.address);
    await axArbitrum.setRemoteMessager(goerliNetwork.chainId, goerliNetwork.axName, axGoerli.address);
    await axLinea.setRemoteMessager(goerliNetwork.chainId, goerliNetwork.axName, axGoerli.address);
    await axMantle.setRemoteMessager(goerliNetwork.chainId, goerliNetwork.axName, axGoerli.address);

    await axGoerli.setRemoteMessager(lineaNetwork.chainId, lineaNetwork.axName, axLinea.address);
    await axArbitrum.setRemoteMessager(lineaNetwork.chainId, lineaNetwork.axName, axLinea.address);
    await axLinea.setRemoteMessager(arbitrumNetwork.chainId, arbitrumNetwork.axName, axArbitrum.address);
    await axMantle.setRemoteMessager(arbitrumNetwork.chainId, arbitrumNetwork.axName, axArbitrum.address);

    await axGoerli.setRemoteMessager(mantleNetwork.chainId, mantleNetwork.axName, axMantle.address);
    await axArbitrum.setRemoteMessager(mantleNetwork.chainId, mantleNetwork.axName, axMantle.address);
    await axLinea.setRemoteMessager(mantleNetwork.chainId, mantleNetwork.axName, axMantle.address);
    await axMantle.setRemoteMessager(lineaNetwork.chainId, lineaNetwork.axName, axLinea.address);
    */

    // deploy crab<>arbitrum sepolia
    /*
    const msglineCrab = await deployContract(crabWallet, "DarwiniaMsglineMessager", crabNetwork.dao, arbitrumSepoliaNetwork.msglineAddress);
    const msglineArbSepolia = await deployContract(arbSepoliaWallet, "DarwiniaMsglineMessager", arbitrumSepoliaNetwork.dao, crabNetwork.msglineAddress);
    await msglineCrab.setRemoteMessager(arbitrumSepoliaNetwork.chainId, arbitrumSepoliaNetwork.msglineChainId, msglineArbSepolia.address);
    await msglineArbSepolia.setRemoteMessager(crabNetwork.chainId, crabNetwork.msglineChainId, msglineCrab.address);

    // deploy scroll
    console.log("deploy scroll <> eth messager");
    const Eth2ScrollReceiveService = await deployContract(scrollWallet, "Eth2ScrollReceiveService", scrollNetwork.dao, scrollNetwork.scrollMessager, sepoliaNetwork.chainId);
    const Eth2ScrollSendService = await deployContract(sepoliaWallet, "Eth2ScrollSendService", sepoliaNetwork.dao, sepoliaNetwork.scrollMessager, scrollNetwork.chainId);
    await wait(10000);
    await Eth2ScrollReceiveService.setRemoteMessager(Eth2ScrollSendService.address);
    await Eth2ScrollSendService.setRemoteMessager(Eth2ScrollReceiveService.address);
    await wait(10000);
    */
    /*
    // deploy debug messager
    await deployContract(goerliWallet, "DebugMessager");
    await deployContract(arbWallet, "DebugMessager");
    await deployContract(lineaWallet, "DebugMessager");
    await deployContract(mantleWallet, "DebugMessager");
    */
    console.log("finished!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
