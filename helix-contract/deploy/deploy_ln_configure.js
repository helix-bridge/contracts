const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');
const fs = require("fs");

var ProxyDeployer = require("./proxy.js");

const privateKey = process.env.PRIKEY

const kNativeTokenAddress = "0x0000000000000000000000000000000000000000";
const relayer = "0xB2a0654C6b2D0975846968D5a3e729F5006c2894";

const lineaGoerliNetwork = {
    name: "linea-goerli",
    url: "https://rpc.goerli.linea.build",
    chainId: 59140,
    eth: "0x0000000000000000000000000000000000000000",
}

const arbitrumGoerliNetwork = {
    name: "arbitrum-goerli",
    url: "https://goerli-rollup.arbitrum.io/rpc",
    chainId: 421613,
    eth: "0x0000000000000000000000000000000000000000",
};

const goerliNetwork = {
    name: "goerli",
    url: "https://rpc.ankr.com/eth_goerli",
    chainId: 5,
    eth: "0x0000000000000000000000000000000000000000",
    mnt: "0xc1dC2d65A2243c22344E725677A3E3BEBD26E604",
};

const mantleGoerliNetwork = {
    name: "mantle-goerli",
    url: "https://rpc.testnet.mantle.xyz",
    chainId: 5001,
    mnt: "0x0000000000000000000000000000000000000000",
}

const zkSyncGoerliNetwork = {
    name: "zksync-goerli",
    url: "https://zksync2-testnet.zksync.dev",
    chainId: 280,
    eth: "0x0000000000000000000000000000000000000000",
}

const messagers = {
    goerli: {
        Eth2ArbSendService: "0xa4eE139bE76d277D997aCf9D58053D8DaF7E050a",
        Eth2LineaSendService: "0x9878e74634544d92a043f1826a94465035FA51f4",
        layerzeroMessager: "0xca4490875739BEb1c4ec9ee5d6814774114e1973",
        axelarMessager: "0x037c7b64c80251Cf5C64Ed8f731c799Dc1856701"
    },
    arbitrumGoerli: {
        Eth2ArbReceiveService: "0x102F8D7Cfe692AA79c17E3958aB00D060Df0B88f",
        layerzeroMessager: "0x953bE65E685099277F1f09Ebe10746810dC0593D",
        axelarMessager: "0xBc30913CC01A2eC70483681841bbb43D2f77caEd"
    },
    lineaGoerli: {
        Eth2LineaReceiveService: "0x8200b3130416F633A696FB9bb0e689a356625075",
        layerzeroMessager: "0xfB09042050868594a54a59EdEAEa96e2765dAd0B",
        axelarMessager: "0x14DB1d462ED061b037C7920857Fc66522ed5bf85"
    },
    mantleGoerli: {
        layerzeroMessager: "0xBE4a32f37d11e8227444837DFb3c634d189ccEDc",
        axelarMessager: "0xbb593913a4f3E4eE77861f743c697A4cb95837eF"
    },
    zkSyncGoerli: {
        layerzeroMessager: "0x7e303b0A3F08F9fa5F5629Abb998B8Deba89049B"
    }
};

function wait(ms) {
    return new Promise(resolve => setTimeout(() => resolve(), ms));
};

function wallet(url) {
    const provider = new ethers.providers.JsonRpcProvider(url);
    const wallet = new ethers.Wallet(privateKey, provider);
    return wallet;
}

async function connectArbAndEth(configure, arbWallet, goerliWallet) {
    const eth2arbReceiveService = configure.messagers[arbitrumGoerliNetwork.name].Eth2ArbReceiveService;
    const eth2arbSendService = configure.messagers[goerliNetwork.name].Eth2ArbSendService;
    const arbOppositeBridgeProxy = configure.LnOppositeBridgeProxy;
    const goerliOppositeBridgeProxy = configure.LnOppositeBridgeProxy;
    const arbDefaultBridgeProxy = configure.LnDefaultBridgeProxy.others;
    const goerliDefaultBridgeProxy = configure.LnDefaultBridgeProxy.others;

    const arbitrumReceiveService = await ethers.getContractAt("Eth2ArbReceiveService", eth2arbReceiveService, arbWallet);
    const ethereumSendService = await ethers.getContractAt("Eth2ArbSendService", eth2arbSendService, goerliWallet);
    // arb<>eth
    // arb->eth opposite bridge using l1->l2 messager
    console.log("start to connect arb->eth using l1->l2 messager");
    const arb2ethSource = await ethers.getContractAt("LnOppositeBridge", arbOppositeBridgeProxy, arbWallet);
    const arb2ethTarget = await ethers.getContractAt("LnOppositeBridge", goerliOppositeBridgeProxy, goerliWallet);
    await arbitrumReceiveService.authoriseAppCaller(arb2ethSource.address, true);
    await ethereumSendService.authoriseAppCaller(arb2ethTarget.address, true);
    await arb2ethSource.setReceiveService(goerliNetwork.chainId, arb2ethTarget.address, eth2arbReceiveService);
    await arb2ethTarget.setSendService(arbitrumGoerliNetwork.chainId, arb2ethSource.address, eth2arbSendService);
    // eth->arb default bridge using l1->l2 messager
    console.log("start to connect eth->arb using l1->l2 messager");
    const eth2arbSource = await ethers.getContractAt("LnDefaultBridge", arbDefaultBridgeProxy, goerliWallet);
    const eth2arbTarget = await ethers.getContractAt("LnDefaultBridge", goerliDefaultBridgeProxy, arbWallet);
    await ethereumSendService.authoriseAppCaller(eth2arbSource.address, true);
    await arbitrumReceiveService.authoriseAppCaller(eth2arbTarget.address, true);
    await eth2arbSource.setSendService(arbitrumGoerliNetwork.chainId, eth2arbTarget.address, eth2arbSendService);
    await eth2arbTarget.setReceiveService(goerliNetwork.chainId, eth2arbSource.address, eth2arbReceiveService);
    console.log("finish connect arb<>eth token bridge");
}

async function connectLineaAndEth(configure, lineaWallet, goerliWallet) {
    const eth2lineaReceiveService = configure.messagers[lineaGoerliNetwork.name].Eth2LineaReceiveService;
    const eth2lineaSendService = configure.messagers[goerliNetwork.name].Eth2LineaSendService;
    const lineaOppositeBridgeProxy = configure.LnOppositeBridgeProxy;
    const goerliOppositeBridgeProxy = configure.LnOppositeBridgeProxy;
    const lineaDefaultBridgeProxy = configure.LnDefaultBridgeProxy.others;
    const goerliDefaultBridgeProxy = configure.LnDefaultBridgeProxy.others;

    const lineaReceiveService = await ethers.getContractAt("Eth2LineaReceiveService", eth2lineaReceiveService, lineaWallet);
    const ethereumSendService = await ethers.getContractAt("Eth2LineaSendService", eth2lineaSendService, goerliWallet);
    // linea<>eth
    // linea->eth opposite bridge using l1->l2 messager
    console.log("start to connect linea->eth using l1->l2 messager");
    const linea2ethSource = await ethers.getContractAt("LnOppositeBridge", lineaOppositeBridgeProxy, lineaWallet);
    const linea2ethTarget = await ethers.getContractAt("LnOppositeBridge", goerliOppositeBridgeProxy, goerliWallet);
    await lineaReceiveService.authoriseAppCaller(linea2ethSource.address, true);
    await ethereumSendService.authoriseAppCaller(linea2ethTarget.address, true);
    await linea2ethSource.setReceiveService(goerliNetwork.chainId, linea2ethTarget.address, eth2lineaReceiveService);
    await linea2ethTarget.setSendService(lineaGoerliNetwork.chainId, linea2ethSource.address, eth2lineaSendService);
    // eth->linea default bridge using l1->l2 messager
    console.log("start to connect eth->linea using l1->l2 messager");
    const eth2lineaSource = await ethers.getContractAt("LnDefaultBridge", goerliDefaultBridgeProxy, goerliWallet);
    const eth2lineaTarget = await ethers.getContractAt("LnDefaultBridge", lineaDefaultBridgeProxy, lineaWallet);
    await lineaReceiveService.authoriseAppCaller(eth2lineaTarget.address, true);
    await ethereumSendService.authoriseAppCaller(eth2lineaSource.address, true);
    await eth2lineaSource.setSendService(lineaGoerliNetwork.chainId, eth2lineaTarget.address, eth2lineaSendService);
    await eth2lineaTarget.setReceiveService(goerliNetwork.chainId, eth2lineaSource.address, eth2lineaReceiveService);
    console.log("finish connect linea<>eth token bridge");
}

async function connectUsingLayerzero(configure, leftWallet, rightWallet, leftNetwork, rightNetwork) {
    const leftMessagerAddess = configure.messagers[leftNetwork.name].layerzeroMessager;
    const rightMessagerAddress = configure.messagers[rightNetwork.name].layerzeroMessager;
    const leftBridgeProxy = leftNetwork.chainId === 280 ? configure.LnDefaultBridgeProxy.zkSync : configure.LnDefaultBridgeProxy.others;
    const rightBridgeProxy = rightNetwork.chainId === 280 ? configure.LnDefaultBridgeProxy.zkSync : configure.LnDefaultBridgeProxy.others;
    const leftMessager = await ethers.getContractAt("LayerZeroMessager", leftMessagerAddess, leftWallet);
    const rightMessager = await ethers.getContractAt("LayerZeroMessager", rightMessagerAddress, rightWallet);
    console.log("start to connect network by using layerzero");
    const left = await ethers.getContractAt("LnDefaultBridge", leftBridgeProxy, leftWallet);
    const right = await ethers.getContractAt("LnDefaultBridge", rightBridgeProxy, rightWallet);
    await leftMessager.authoriseAppCaller(left.address, true);
    await rightMessager.authoriseAppCaller(right.address, true);
    await left.setSendService(rightNetwork.chainId, right.address, leftMessagerAddess);
    await right.setReceiveService(leftNetwork.chainId, left.address, rightMessagerAddress);
    await left.setReceiveService(rightNetwork.chainId, right.address, leftMessagerAddess);
    await right.setSendService(leftNetwork.chainId, left.address, rightMessagerAddress);
}

async function connectUsingAxelar(configure, leftWallet, rightWallet, leftNetwork, rightNetwork) {
    const leftMessagerAddress = configure.messagers[leftNetwork.name].axelarMessager;
    const rightMessagerAddress = configure.messagers[rightNetwork.name].axelarMessager;
    const leftBridgeProxy = leftNetwork.chainId === 280 ? configure.LnDefaultBridgeProxy.zkSync : configure.LnDefaultBridgeProxy.others;
    const rightBridgeProxy = rightNetwork.chainId === 280 ? configure.LnDefaultBridgeProxy.zkSync : configure.LnDefaultBridgeProxy.others;

    const leftMessager = await ethers.getContractAt("AxelarMessager", leftMessagerAddress, leftWallet);
    const rightMessager = await ethers.getContractAt("AxelarMessager", rightMessagerAddress, rightWallet);
    console.log("start to connect network by using axelar");
    const left = await ethers.getContractAt("LnDefaultBridge", leftBridgeProxy, leftWallet);
    const right = await ethers.getContractAt("LnDefaultBridge", rightBridgeProxy, rightWallet);
    await leftMessager.authoriseAppCaller(left.address, true);
    await rightMessager.authoriseAppCaller(right.address, true);
    await left.setSendService(rightNetwork.chainId, right.address, leftMessagerAddress);
    await right.setReceiveService(leftNetwork.chainId, left.address, rightMessagerAddress);
    await left.setReceiveService(rightNetwork.chainId, right.address, leftMessagerAddress);
    await right.setSendService(leftNetwork.chainId, left.address, rightMessagerAddress);
}

async function connectAll(configure, arbWallet, lineaWallet, goerliWallet, mantleWallet, zkSyncWallet) {
    // arbitrum L2 message
    await connectArbAndEth(configure, arbWallet, goerliWallet);
    // linea L2 message
    await connectLineaAndEth(configure, lineaWallet, goerliWallet);
    await connectUsingLayerzero(configure, arbWallet, lineaWallet, arbitrumGoerliNetwork, lineaGoerliNetwork);
    await connectUsingLayerzero(configure, arbWallet, mantleWallet, arbitrumGoerliNetwork, mantleGoerliNetwork);
    await connectUsingLayerzero(configure, arbWallet, zkSyncWallet, arbitrumGoerliNetwork, zkSyncGoerliNetwork);
    await connectUsingLayerzero(configure, lineaWallet, mantleWallet, lineaGoerliNetwork, mantleGoerliNetwork);
    await connectUsingLayerzero(configure, lineaWallet, zkSyncWallet, lineaGoerliNetwork, zkSyncGoerliNetwork);
    await connectUsingLayerzero(configure, zkSyncWallet, mantleWallet, zkSyncGoerliNetwork, mantleGoerliNetwork);
    await connectUsingLayerzero(configure, zkSyncWallet, goerliWallet, zkSyncGoerliNetwork, goerliNetwork);
    await connectUsingAxelar(configure, mantleWallet, goerliWallet, mantleGoerliNetwork, goerliNetwork);
}

async function registerToken(configure, contractName, srcWallet, dstWallet, srcNetwork, dstNetwork, srcToken, dstToken) {
    
    let srcDecimals = 18;
    let dstDecimals = 18;
    let srcTokenAddress = srcNetwork[srcToken];
    let dstTokenAddress = dstNetwork[dstToken];
    if (srcToken !== 'eth' && srcToken !== 'mnt') {
        srcTokenAddress = configure[srcToken][srcNetwork.name];
    }
    if (dstToken !== 'eth' && dstToken !== 'mnt') {
        dstTokenAddress = configure[dstToken][dstNetwork.name];
    }
    if (srcTokenAddress != kNativeTokenAddress) {
        const sourceToken = await ethers.getContractAt("Erc20", srcTokenAddress, srcWallet);
        srcDecimals = await sourceToken.decimals();
    } 
    if (dstTokenAddress != kNativeTokenAddress) {
        const targetToken = await ethers.getContractAt("Erc20", dstTokenAddress, dstWallet);
        dstDecimals = await targetToken.decimals();
    }
    let fee = ethers.utils.parseUnits("100", srcDecimals);
    const penaltyDecimals = contractName == "LnOppositeBridge" ? srcDecimals : dstDecimals;
    let penalty = ethers.utils.parseUnits("1000", penaltyDecimals);
    if (srcTokenAddress == kNativeTokenAddress || dstTokenAddress == kNativeTokenAddress) {
        fee = ethers.utils.parseUnits("0.001", srcDecimals);
        penalty = ethers.utils.parseUnits("0.01", penaltyDecimals);
    }

    const defaultAddress = srcNetwork.chainId === 280 ? configure.LnDefaultBridgeProxy.zkSync : configure.LnDefaultBridgeProxy.others;
    const proxyAddress = contractName == "LnOppositeBridge" ? configure.LnOppositeBridgeProxy : defaultAddress;

    const source = await ethers.getContractAt(contractName, proxyAddress, srcWallet);
    await source.setTokenInfo(
        dstNetwork.chainId,
        srcTokenAddress,
        dstTokenAddress,
        fee,
        penalty,
        srcDecimals,
        dstDecimals);
    console.log(`finished register token bridge: ${contractName}, ${srcNetwork.chainId}->${dstNetwork.chainId}, ${srcToken}->${dstToken}`);
}

async function registerAllToken(configure, arbWallet, lineaWallet, goerliWallet, mantleWallet, zkSyncWallet) {
    //arb<>eth
    await registerToken(configure, "LnOppositeBridge", arbWallet, goerliWallet, arbitrumGoerliNetwork, goerliNetwork, "usdc", "usdc");
    await registerToken(configure, "LnDefaultBridge", goerliWallet, arbWallet, goerliNetwork, arbitrumGoerliNetwork, "usdc", "usdc");
    await registerToken(configure, "LnOppositeBridge", arbWallet, goerliWallet, arbitrumGoerliNetwork, goerliNetwork, "usdt", "usdt");
    await registerToken(configure, "LnDefaultBridge", goerliWallet, arbWallet, goerliNetwork, arbitrumGoerliNetwork, "usdt", "usdt");
    await registerToken(configure, "LnOppositeBridge", arbWallet, goerliWallet, arbitrumGoerliNetwork, goerliNetwork, "eth", "eth");
    await registerToken(configure, "LnDefaultBridge", goerliWallet, arbWallet, goerliNetwork, arbitrumGoerliNetwork, "eth", "eth");

    // linea<>eth
    await registerToken(configure, "LnOppositeBridge", lineaWallet, goerliWallet, lineaGoerliNetwork, goerliNetwork, "usdc", "usdc");
    await registerToken(configure, "LnDefaultBridge", goerliWallet, lineaWallet, goerliNetwork, lineaGoerliNetwork, "usdc", "usdc");
    await registerToken(configure, "LnOppositeBridge", lineaWallet, goerliWallet, lineaGoerliNetwork, goerliNetwork, "usdt", "usdt");
    await registerToken(configure, "LnDefaultBridge", goerliWallet, lineaWallet, goerliNetwork, lineaGoerliNetwork, "usdt", "usdt");
    await registerToken(configure, "LnOppositeBridge", lineaWallet, goerliWallet, lineaGoerliNetwork, goerliNetwork, "eth", "eth");
    await registerToken(configure, "LnDefaultBridge", goerliWallet, lineaWallet, goerliNetwork, lineaGoerliNetwork, "eth", "eth");

    //arb<>linea
    await registerToken(configure, "LnDefaultBridge", arbWallet, lineaWallet, arbitrumGoerliNetwork, lineaGoerliNetwork, "usdc", "usdc");
    await registerToken(configure, "LnDefaultBridge", lineaWallet, arbWallet, lineaGoerliNetwork, arbitrumGoerliNetwork, "usdc", "usdc");
    await registerToken(configure, "LnDefaultBridge", arbWallet, lineaWallet, arbitrumGoerliNetwork, lineaGoerliNetwork, "usdt", "usdt");
    await registerToken(configure, "LnDefaultBridge", lineaWallet, arbWallet, lineaGoerliNetwork, arbitrumGoerliNetwork, "usdt", "usdt");
    await registerToken(configure, "LnDefaultBridge", arbWallet, lineaWallet, arbitrumGoerliNetwork, lineaGoerliNetwork, "eth", "eth");
    await registerToken(configure, "LnDefaultBridge", lineaWallet, arbWallet, lineaGoerliNetwork, arbitrumGoerliNetwork, "eth", "eth");

    //arb<>mantle
    await registerToken(configure, "LnDefaultBridge", arbWallet, mantleWallet, arbitrumGoerliNetwork, mantleGoerliNetwork, "usdc", "usdc");
    await registerToken(configure, "LnDefaultBridge", mantleWallet, arbWallet, mantleGoerliNetwork, arbitrumGoerliNetwork, "usdc", "usdc");
    await registerToken(configure, "LnDefaultBridge", arbWallet, mantleWallet, arbitrumGoerliNetwork, mantleGoerliNetwork, "usdt", "usdt");
    await registerToken(configure, "LnDefaultBridge", mantleWallet, arbWallet, mantleGoerliNetwork, arbitrumGoerliNetwork, "usdt", "usdt");

    // mantle<>linea
    await registerToken(configure, "LnDefaultBridge", mantleWallet, lineaWallet, mantleGoerliNetwork, lineaGoerliNetwork, "usdc", "usdc");
    await registerToken(configure, "LnDefaultBridge", lineaWallet, mantleWallet, lineaGoerliNetwork, mantleGoerliNetwork, "usdc", "usdc");
    await registerToken(configure, "LnDefaultBridge", mantleWallet, lineaWallet, mantleGoerliNetwork, lineaGoerliNetwork, "usdt", "usdt");
    await registerToken(configure, "LnDefaultBridge", lineaWallet, mantleWallet, lineaGoerliNetwork, mantleGoerliNetwork, "usdt", "usdt");

    // mantle<>eth
    await registerToken(configure, "LnDefaultBridge", goerliWallet, mantleWallet, goerliNetwork, mantleGoerliNetwork, "usdc", "usdc");
    await registerToken(configure, "LnDefaultBridge", mantleWallet, goerliWallet, mantleGoerliNetwork, goerliNetwork, "usdc", "usdc");
    await registerToken(configure, "LnDefaultBridge", goerliWallet, mantleWallet, goerliNetwork, mantleGoerliNetwork, "usdt", "usdt");
    await registerToken(configure, "LnDefaultBridge", mantleWallet, goerliWallet, mantleGoerliNetwork, goerliNetwork, "usdt", "usdt");
    await registerToken(configure, "LnDefaultBridge", goerliWallet, mantleWallet, goerliNetwork, mantleGoerliNetwork, "mnt", "mnt");
    await registerToken(configure, "LnDefaultBridge", mantleWallet, goerliWallet, mantleGoerliNetwork, goerliNetwork, "mnt", "mnt");

    // zkSync<>eth
    await registerToken(configure, "LnDefaultBridge", zkSyncWallet, goerliWallet, zkSyncGoerliNetwork, goerliNetwork, "usdc", "usdc");
    await registerToken(configure, "LnDefaultBridge", goerliWallet, zkSyncWallet, goerliNetwork, zkSyncGoerliNetwork, "usdc", "usdc");
    await registerToken(configure, "LnDefaultBridge", zkSyncWallet, goerliWallet, zkSyncGoerliNetwork, goerliNetwork, "usdt", "usdt");
    await registerToken(configure, "LnDefaultBridge", goerliWallet, zkSyncWallet, goerliNetwork, zkSyncGoerliNetwork, "usdt", "usdt");
    await registerToken(configure, "LnDefaultBridge", zkSyncWallet, goerliWallet, zkSyncGoerliNetwork, goerliNetwork, "eth", "eth");
    await registerToken(configure, "LnDefaultBridge", goerliWallet, zkSyncWallet, goerliNetwork, zkSyncGoerliNetwork, "eth", "eth");

    // zkSync<>arb
    await registerToken(configure, "LnDefaultBridge", zkSyncWallet, arbWallet, zkSyncGoerliNetwork, arbitrumGoerliNetwork, "usdc", "usdc");
    await registerToken(configure, "LnDefaultBridge", arbWallet, zkSyncWallet, arbitrumGoerliNetwork, zkSyncGoerliNetwork, "usdc", "usdc");
    await registerToken(configure, "LnDefaultBridge", zkSyncWallet, arbWallet, zkSyncGoerliNetwork, arbitrumGoerliNetwork, "usdt", "usdt");
    await registerToken(configure, "LnDefaultBridge", arbWallet, zkSyncWallet, arbitrumGoerliNetwork, zkSyncGoerliNetwork, "usdt", "usdt");
    await registerToken(configure, "LnDefaultBridge", zkSyncWallet, arbWallet, zkSyncGoerliNetwork, arbitrumGoerliNetwork, "eth", "eth");
    await registerToken(configure, "LnDefaultBridge", arbWallet, zkSyncWallet, arbitrumGoerliNetwork, zkSyncGoerliNetwork, "eth", "eth");

    // zkSync<>linea
    await registerToken(configure, "LnDefaultBridge", zkSyncWallet, lineaWallet, zkSyncGoerliNetwork, lineaGoerliNetwork, "usdc", "usdc");
    await registerToken(configure, "LnDefaultBridge", lineaWallet, zkSyncWallet, lineaGoerliNetwork, zkSyncGoerliNetwork, "usdc", "usdc");
    await registerToken(configure, "LnDefaultBridge", zkSyncWallet, lineaWallet, zkSyncGoerliNetwork, lineaGoerliNetwork, "usdt", "usdt");
    await registerToken(configure, "LnDefaultBridge", lineaWallet, zkSyncWallet, lineaGoerliNetwork, zkSyncGoerliNetwork, "usdt", "usdt");
    await registerToken(configure, "LnDefaultBridge", zkSyncWallet, lineaWallet, zkSyncGoerliNetwork, lineaGoerliNetwork, "eth", "eth");
    await registerToken(configure, "LnDefaultBridge", lineaWallet, zkSyncWallet, lineaGoerliNetwork, zkSyncGoerliNetwork, "eth", "eth");

    // zkSync<>mantle
    await registerToken(configure, "LnDefaultBridge", zkSyncWallet, mantleWallet, zkSyncGoerliNetwork, mantleGoerliNetwork, "usdc", "usdc");
    await registerToken(configure, "LnDefaultBridge", mantleWallet, zkSyncWallet, mantleGoerliNetwork, zkSyncGoerliNetwork, "usdc", "usdc");
    await registerToken(configure, "LnDefaultBridge", zkSyncWallet, mantleWallet, zkSyncGoerliNetwork, mantleGoerliNetwork, "usdt", "usdt");
    await registerToken(configure, "LnDefaultBridge", mantleWallet, zkSyncWallet, mantleGoerliNetwork, zkSyncGoerliNetwork, "usdt", "usdt");
}

async function registerRelayer(configure, contractName, srcWallet, dstWallet, srcNetwork, dstNetwork, srcToken, dstToken, increaseMargin) {
    let srcTokenAddress = srcNetwork[srcToken];
    let dstTokenAddress = dstNetwork[dstToken];
    let srcDecimals = 18;
    let dstDecimals = 18;
    if (srcToken !== 'eth' && srcToken !== 'mnt') {
        srcTokenAddress = configure[srcToken][srcNetwork.name];
    }
    if (dstToken !== 'eth' && dstToken !== 'mnt') {
        dstTokenAddress = configure[dstToken][dstNetwork.name];
    }

    let baseFeeAmount = "0.001";
    if (srcTokenAddress != kNativeTokenAddress) {
        const sourceToken = await ethers.getContractAt("Erc20", srcTokenAddress, srcWallet);
        srcDecimals = await sourceToken.decimals();
        baseFeeAmount = "20";
    }
    if (dstTokenAddress != kNativeTokenAddress) {
        const targetToken = await ethers.getContractAt("Erc20", dstTokenAddress, dstWallet);
        dstDecimals = await targetToken.decimals();
        baseFeeAmount = "20";
    }
    let baseFee = ethers.utils.parseUnits(baseFeeAmount, srcDecimals);
    const liquidityFeeRate = 30;

    // default bridge
    if (contractName == "LnDefaultBridge") {
        const defaultAddress = srcNetwork.chainId === 280 ? configure.LnDefaultBridgeProxy.zkSync : configure.LnDefaultBridgeProxy.others;
        // set source network
        let margin = ethers.utils.parseUnits("1000000", dstDecimals);
        let value = 0;
        if (dstTokenAddress == kNativeTokenAddress) {
            margin = ethers.utils.parseUnits("0.1", dstDecimals);
            value = margin;
        }
        if (!increaseMargin) {
            margin = 0;
            value = 0;
        }
        const source = await ethers.getContractAt(contractName, defaultAddress, srcWallet);
        await source.setProviderFee(
            dstNetwork.chainId,
            srcTokenAddress,
            dstTokenAddress,
            baseFee,
            liquidityFeeRate
        );
        // set target network
        const target = await ethers.getContractAt(contractName, defaultAddress, dstWallet);
        await target.depositProviderMargin(
            srcNetwork.chainId,
            srcTokenAddress,
            dstTokenAddress,
            margin,
            {value: value},
        );
    } else {
        let margin = ethers.utils.parseUnits("1000000", srcDecimals);
        let value = 0;
        if (srcTokenAddress == kNativeTokenAddress) {
            margin = ethers.utils.parseUnits("0.1", dstDecimals);
            value = margin;
        }
        if (!increaseMargin) {
            margin = 0;
            value = 0;
        }
        const source = await ethers.getContractAt(contractName, configure.LnOppositeBridgeProxy, srcWallet);
        await source.updateProviderFeeAndMargin(
            dstNetwork.chainId,
            srcTokenAddress,
            dstTokenAddress,
            margin,
            baseFee,
            liquidityFeeRate,
            {value: value}
        );
    }
    console.log(`finished register relayer: ${contractName}, ${srcNetwork.chainId}->${dstNetwork.chainId}, ${srcToken}->${dstToken}`);
}

async function registerAllRelayer(configure, arbWallet, lineaWallet, goerliWallet, mantleWallet, zkSyncWallet) {
    //arb<>eth
    const increaseMargin = false;
    console.log("start to register arb<>eth relayer");
    await registerRelayer(configure, "LnOppositeBridge", arbWallet, goerliWallet, arbitrumGoerliNetwork, goerliNetwork, "usdc", "usdc", increaseMargin);
    await registerRelayer(configure, "LnDefaultBridge", goerliWallet, arbWallet, goerliNetwork, arbitrumGoerliNetwork, "usdc", "usdc", increaseMargin);
    await registerRelayer(configure, "LnOppositeBridge", arbWallet, goerliWallet, arbitrumGoerliNetwork, goerliNetwork, "usdt", "usdt", increaseMargin);
    await registerRelayer(configure, "LnDefaultBridge", goerliWallet, arbWallet, goerliNetwork, arbitrumGoerliNetwork, "usdt", "usdt", increaseMargin);
    await registerRelayer(configure, "LnOppositeBridge", arbWallet, goerliWallet, arbitrumGoerliNetwork, goerliNetwork, "eth", "eth", increaseMargin);
    await registerRelayer(configure, "LnDefaultBridge", goerliWallet, arbWallet, goerliNetwork, arbitrumGoerliNetwork, "eth", "eth", increaseMargin);

    // linea<>eth
    console.log("start to register linea<>eth relayer");
    await registerRelayer(configure, "LnOppositeBridge", lineaWallet, goerliWallet, lineaGoerliNetwork, goerliNetwork, "usdc", "usdc", increaseMargin);
    await registerRelayer(configure, "LnDefaultBridge", goerliWallet, lineaWallet, goerliNetwork, lineaGoerliNetwork, "usdc", "usdc", increaseMargin);
    await registerRelayer(configure, "LnOppositeBridge", lineaWallet, goerliWallet, lineaGoerliNetwork, goerliNetwork, "usdt", "usdt", increaseMargin);
    await registerRelayer(configure, "LnDefaultBridge", goerliWallet, lineaWallet, goerliNetwork, lineaGoerliNetwork, "usdt", "usdt", increaseMargin);
    await registerRelayer(configure, "LnOppositeBridge", lineaWallet, goerliWallet, lineaGoerliNetwork, goerliNetwork, "eth", "eth", increaseMargin);
    await registerRelayer(configure, "LnDefaultBridge", goerliWallet, lineaWallet, goerliNetwork, lineaGoerliNetwork, "eth", "eth", increaseMargin);

    //arb<>linea
    console.log("start to register linea<>arb relayer");
    await registerRelayer(configure, "LnDefaultBridge", arbWallet, lineaWallet, arbitrumGoerliNetwork, lineaGoerliNetwork, "usdc", "usdc", increaseMargin);
    await registerRelayer(configure, "LnDefaultBridge", lineaWallet, arbWallet, lineaGoerliNetwork, arbitrumGoerliNetwork, "usdc", "usdc", increaseMargin);
    await registerRelayer(configure, "LnDefaultBridge", arbWallet, lineaWallet, arbitrumGoerliNetwork, lineaGoerliNetwork, "usdt", "usdt", increaseMargin);
    await registerRelayer(configure, "LnDefaultBridge", lineaWallet, arbWallet, lineaGoerliNetwork, arbitrumGoerliNetwork, "usdt", "usdt", increaseMargin);
    await registerRelayer(configure, "LnDefaultBridge", arbWallet, lineaWallet, arbitrumGoerliNetwork, lineaGoerliNetwork, "eth", "eth", increaseMargin);
    await registerRelayer(configure, "LnDefaultBridge", lineaWallet, arbWallet, lineaGoerliNetwork, arbitrumGoerliNetwork, "eth", "eth", increaseMargin);

    //arb<>mantle
    console.log("start to register mantle<>arb relayer");
    await registerRelayer(configure, "LnDefaultBridge", arbWallet, mantleWallet, arbitrumGoerliNetwork, mantleGoerliNetwork, "usdc", "usdc", increaseMargin);
    await registerRelayer(configure, "LnDefaultBridge", mantleWallet, arbWallet, mantleGoerliNetwork, arbitrumGoerliNetwork, "usdc", "usdc", increaseMargin);
    await registerRelayer(configure, "LnDefaultBridge", arbWallet, mantleWallet, arbitrumGoerliNetwork, mantleGoerliNetwork, "usdt", "usdt", increaseMargin);
    await registerRelayer(configure, "LnDefaultBridge", mantleWallet, arbWallet, mantleGoerliNetwork, arbitrumGoerliNetwork, "usdt", "usdt", increaseMargin);

    // mantle<>linea
    console.log("start to register mantle<>linea relayer");
    await registerRelayer(configure, "LnDefaultBridge", mantleWallet, lineaWallet, mantleGoerliNetwork, lineaGoerliNetwork, "usdc", "usdc", increaseMargin);
    await registerRelayer(configure, "LnDefaultBridge", lineaWallet, mantleWallet, lineaGoerliNetwork, mantleGoerliNetwork, "usdc", "usdc", increaseMargin);
    await registerRelayer(configure, "LnDefaultBridge", mantleWallet, lineaWallet, mantleGoerliNetwork, lineaGoerliNetwork, "usdt", "usdt", increaseMargin);
    await registerRelayer(configure, "LnDefaultBridge", lineaWallet, mantleWallet, lineaGoerliNetwork, mantleGoerliNetwork, "usdt", "usdt", increaseMargin);

    // mantle<>eth
    console.log("start to register mantle<>eth relayer");
    await registerRelayer(configure, "LnDefaultBridge", goerliWallet, mantleWallet, goerliNetwork, mantleGoerliNetwork, "usdc", "usdc", increaseMargin);
    await registerRelayer(configure, "LnDefaultBridge", mantleWallet, goerliWallet, mantleGoerliNetwork, goerliNetwork, "usdc", "usdc", increaseMargin);
    await registerRelayer(configure, "LnDefaultBridge", goerliWallet, mantleWallet, goerliNetwork, mantleGoerliNetwork, "usdt", "usdt", increaseMargin);
    await registerRelayer(configure, "LnDefaultBridge", mantleWallet, goerliWallet, mantleGoerliNetwork, goerliNetwork, "usdt", "usdt", increaseMargin);
    await registerRelayer(configure, "LnDefaultBridge", goerliWallet, mantleWallet, goerliNetwork, mantleGoerliNetwork, "mnt", "mnt", increaseMargin);
    await registerRelayer(configure, "LnDefaultBridge", mantleWallet, goerliWallet, mantleGoerliNetwork, goerliNetwork, "mnt", "mnt", increaseMargin);

    // arb<>zkSync
    await registerRelayer(configure, "LnDefaultBridge", arbWallet, zkSyncWallet, arbitrumGoerliNetwork, zkSyncGoerliNetwork, "usdc", "usdc", increaseMargin);
    await registerRelayer(configure, "LnDefaultBridge", zkSyncWallet, arbWallet, zkSyncGoerliNetwork, arbitrumGoerliNetwork, "usdc", "usdc", increaseMargin);
    await registerRelayer(configure, "LnDefaultBridge", arbWallet, zkSyncWallet, arbitrumGoerliNetwork, zkSyncGoerliNetwork, "usdt", "usdt", increaseMargin);
    await registerRelayer(configure, "LnDefaultBridge", zkSyncWallet, arbWallet, zkSyncGoerliNetwork, arbitrumGoerliNetwork, "usdt", "usdt", increaseMargin);
    await registerRelayer(configure, "LnDefaultBridge", arbWallet, zkSyncWallet, arbitrumGoerliNetwork, zkSyncGoerliNetwork, "eth", "eth", increaseMargin);
    await registerRelayer(configure, "LnDefaultBridge", zkSyncWallet, arbWallet, zkSyncGoerliNetwork, arbitrumGoerliNetwork, "eth", "eth", increaseMargin);
    // eth<>zkSync
    await registerRelayer(configure, "LnDefaultBridge", goerliWallet, zkSyncWallet, goerliNetwork, zkSyncGoerliNetwork, "usdc", "usdc", increaseMargin);
    await registerRelayer(configure, "LnDefaultBridge", zkSyncWallet, goerliWallet, zkSyncGoerliNetwork, goerliNetwork, "usdc", "usdc", increaseMargin);
    await registerRelayer(configure, "LnDefaultBridge", goerliWallet, zkSyncWallet, goerliNetwork, zkSyncGoerliNetwork, "usdt", "usdt", increaseMargin);
    await registerRelayer(configure, "LnDefaultBridge", zkSyncWallet, goerliWallet, zkSyncGoerliNetwork, goerliNetwork, "usdt", "usdt", increaseMargin);
    await registerRelayer(configure, "LnDefaultBridge", goerliWallet, zkSyncWallet, goerliNetwork, zkSyncGoerliNetwork, "eth", "eth", increaseMargin);
    await registerRelayer(configure, "LnDefaultBridge", zkSyncWallet, goerliWallet, zkSyncGoerliNetwork, goerliNetwork, "eth", "eth", increaseMargin);
    // mantle<>zkSync                                                                                                 
    await registerRelayer(configure, "LnDefaultBridge", mantleWallet, zkSyncWallet, mantleGoerliNetwork, zkSyncGoerliNetwork, "usdc", "usdc", increaseMargin);
    await registerRelayer(configure, "LnDefaultBridge", zkSyncWallet, mantleWallet, zkSyncGoerliNetwork, mantleGoerliNetwork, "usdc", "usdc", increaseMargin);
    await registerRelayer(configure, "LnDefaultBridge", mantleWallet, zkSyncWallet, mantleGoerliNetwork, zkSyncGoerliNetwork, "usdt", "usdt", increaseMargin);
    await registerRelayer(configure, "LnDefaultBridge", zkSyncWallet, mantleWallet, zkSyncGoerliNetwork, mantleGoerliNetwork, "usdt", "usdt", increaseMargin);
    // linea<>zkSync
    await registerRelayer(configure, "LnDefaultBridge", lineaWallet, zkSyncWallet, lineaGoerliNetwork, zkSyncGoerliNetwork, "usdc", "usdc", increaseMargin);
    await registerRelayer(configure, "LnDefaultBridge", zkSyncWallet, lineaWallet, zkSyncGoerliNetwork, lineaGoerliNetwork, "usdc", "usdc", increaseMargin);
    await registerRelayer(configure, "LnDefaultBridge", lineaWallet, zkSyncWallet, lineaGoerliNetwork, zkSyncGoerliNetwork, "usdt", "usdt", increaseMargin);
    await registerRelayer(configure, "LnDefaultBridge", zkSyncWallet, lineaWallet, zkSyncGoerliNetwork, lineaGoerliNetwork, "usdt", "usdt", increaseMargin);
    await registerRelayer(configure, "LnDefaultBridge", lineaWallet, zkSyncWallet, lineaGoerliNetwork, zkSyncGoerliNetwork, "eth", "eth", increaseMargin);
    await registerRelayer(configure, "LnDefaultBridge", zkSyncWallet, lineaWallet, zkSyncGoerliNetwork, lineaGoerliNetwork, "eth", "eth", increaseMargin);
}

async function mintToken(configure, tokenSymbol, network, wallet, to) {
    const tokenAddress = configure[tokenSymbol][network.name];
    const token = await ethers.getContractAt("Erc20", tokenAddress, wallet);
    const decimals = await token.decimals();
    const amount = ethers.utils.parseUnits("9000000", decimals);
    console.log("start to mint token", tokenSymbol, amount);
    await token.mint(to, amount);
}

async function approveToken(configure, tokenSymbol, network, wallet) {
    const tokenAddress = configure[tokenSymbol][network.name];
    const token = await ethers.getContractAt("Erc20", tokenAddress, wallet);
    const decimals = await token.decimals();
    console.log("start to approve", tokenSymbol);

    const defaultAddress = network.chainId === 280 ? configure.LnDefaultBridgeProxy.zkSync : configure.LnDefaultBridgeProxy.others;

    await token.approve(defaultAddress, ethers.utils.parseUnits("10000000000000", decimals));
    await wait(5000);
    if (network.chainId !== 280) {
        await token.approve(configure.LnOppositeBridgeProxy, ethers.utils.parseUnits("10000000000000", decimals));
        await wait(5000);
    }
    console.log("finished to approve", tokenSymbol);
}

async function mintAll(configure, relayer, arbWallet, lineaWallet, goerliWallet, mantleWallet, zkSyncWallet) {
    await mintToken(configure, "usdc", goerliNetwork, goerliWallet, relayer);
    await mintToken(configure, "usdt", goerliNetwork, goerliWallet, relayer);
    await mintToken(configure, "usdc", lineaGoerliNetwork, lineaWallet, relayer);
    await mintToken(configure, "usdt", lineaGoerliNetwork, lineaWallet, relayer);
    await mintToken(configure, "usdc", arbitrumGoerliNetwork, arbWallet, relayer);
    await mintToken(configure, "usdt", arbitrumGoerliNetwork, arbWallet, relayer);
    await mintToken(configure, "usdc", mantleGoerliNetwork, mantleWallet, relayer);
    await mintToken(configure, "usdt", mantleGoerliNetwork, mantleWallet, relayer);
    await mintToken(configure, "usdt", zkSyncGoerliNetwork, zkSyncWallet, relayer);
    await mintToken(configure, "usdc", zkSyncGoerliNetwork, zkSyncWallet, relayer);
}

async function approveAll(configure, arbWallet, lineaWallet, goerliWallet, mantleWallet, zkSyncWallet) {
    await approveToken(configure, "usdc", goerliNetwork, goerliWallet);
    await approveToken(configure, "usdt", goerliNetwork, goerliWallet);
    await approveToken(configure, "mnt", goerliNetwork, goerliWallet);
    await approveToken(configure, "usdc", lineaGoerliNetwork, lineaWallet);
    await approveToken(configure, "usdt", lineaGoerliNetwork, lineaWallet);
    await approveToken(configure, "usdc", arbitrumGoerliNetwork, arbWallet);
    await approveToken(configure, "usdt", arbitrumGoerliNetwork, arbWallet);
    await approveToken(configure, "usdc", mantleGoerliNetwork, mantleWallet);
    await approveToken(configure, "usdt", mantleGoerliNetwork, mantleWallet);
    await approveToken(configure, "usdt", zkSyncGoerliNetwork, zkSyncWallet);
    await approveToken(configure, "usdc", zkSyncGoerliNetwork, zkSyncWallet);
}

// 2. deploy mapping token factory
async function main() {
    const pathConfig = "./address/ln-dev.json";
    const configure = JSON.parse(
        fs.readFileSync(pathConfig, "utf8")
    );

    const arbWallet = wallet(arbitrumGoerliNetwork.url);
    const lineaWallet = wallet(lineaGoerliNetwork.url);
    const goerliWallet = wallet(goerliNetwork.url);
    const mantleWallet = wallet(mantleGoerliNetwork.url);
    const zkSyncWallet = wallet(zkSyncGoerliNetwork.url);

    // set messager service
    //await connectAll(configure, arbWallet, lineaWallet, goerliWallet, mantleWallet, zkSyncWallet);
    //await registerAllToken(configure, arbWallet, lineaWallet, goerliWallet, mantleWallet, zkSyncWallet);
    //await mintAll(configure, relayer, arbWallet, lineaWallet, goerliWallet, mantleWallet, zkSyncWallet);
    //await approveAll(configure, arbWallet, lineaWallet, goerliWallet, mantleWallet, zkSyncWallet);
    //await registerAllRelayer(configure, arbWallet, lineaWallet, goerliWallet, mantleWallet, zkSyncWallet);
    console.log("finished!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
