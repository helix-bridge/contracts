const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');

var ProxyDeployer = require("./proxy.js");

const privateKey = process.env.PRIKEY

const kNativeTokenAddress = "0x0000000000000000000000000000000000000000";
const relayer = "0xB2a0654C6b2D0975846968D5a3e729F5006c2894";

const lineaNetwork = {
    url: "https://rpc.goerli.linea.build",
    chainId: 59140,
    defaultBridgeProxy: "0x7e101911E5FB461d78FBde3992f76F3Bf8BbA829",
    oppositeBridgeProxy: "0x4C538EfA6e3f9Dfb939AA4F0B224577DA665923a",
    name: "lineaGoerli",
    usdt: "0x8f3663930211f3DE17619FEB2eeB44c9c3F44a06",
    usdc: "0xeC89AF5FF618bbF667755BE9d63C69F21F1c00C8",
    eth: "0x0000000000000000000000000000000000000000",
};

const arbitrumNetwork = {
    url: "https://goerli-rollup.arbitrum.io/rpc",
    chainId: 421613,
    defaultBridgeProxy: "0x7e101911E5FB461d78FBde3992f76F3Bf8BbA829",
    oppositeBridgeProxy: "0x4C538EfA6e3f9Dfb939AA4F0B224577DA665923a",
    name: "arbitrumGoerli",
    usdt: "0x543bf1AC41485dc78039b9351563E4Dd13A288cb",
    usdc: "0xBAD026e314a77e727dF643B02f63adA573a3757c",
    eth: "0x0000000000000000000000000000000000000000",
};

const goerliNetwork = {
    url: "https://rpc.ankr.com/eth_goerli",
    chainId: 5,
    defaultBridgeProxy: "0x7e101911E5FB461d78FBde3992f76F3Bf8BbA829",
    oppositeBridgeProxy: "0x4C538EfA6e3f9Dfb939AA4F0B224577DA665923a",
    name: "goerli",
    usdc: "0xe9784E0d9A939dbe966b021DE3cd877284DB1B99",
    usdt: "0xa39cffE89567eBfb5c306a07dfb6e5B3ba41F358",
    eth: "0x0000000000000000000000000000000000000000",
    mnt: "0xc1dC2d65A2243c22344E725677A3E3BEBD26E604",
};

const mantleNetwork = {
    url: "https://rpc.testnet.mantle.xyz",
    chainId: 5001,
    defaultBridgeProxy: "0x7e101911E5FB461d78FBde3992f76F3Bf8BbA829",
    oppositeBridgeProxy: "0x4C538EfA6e3f9Dfb939AA4F0B224577DA665923a",
    name: "mantleGoerli",
    usdt: "0xDb06D904AC5Bdff3b8E6Ac96AFedd3381d94CFDD",
    usdc: "0xD610DE267f7590D5bCCE89489ECd2C1A4AfdF76B",
    mnt: "0x0000000000000000000000000000000000000000",
}

const zkSyncNetwork = {
    url: "https://zksync2-testnet.zksync.dev",
    chainId: 280,
    defaultBridgeProxy: "0xe8d55759c32fb608fD092aB2C0ef8A1F52B254d4",
    // unused
    oppositeBridgeProxy: "0xe8d55759c32fb608fD092aB2C0ef8A1F52B254d4",
    name: "zkSyncGoerli",
    usdt: "0xb5372ed3bb2CbA63e7908066ac10ee94d30eA839",
    usdc: "0xAe60e005C560E869a2bad271e38e3C9D78381aFF",
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

async function connectArbAndEth(arbWallet, goerliWallet) {
    const arbitrumReceiveService = await ethers.getContractAt("Eth2ArbReceiveService", messagers.arbitrumGoerli.Eth2ArbReceiveService, arbWallet);
    const ethereumSendService = await ethers.getContractAt("Eth2ArbSendService", messagers.goerli.Eth2ArbSendService, goerliWallet);
    // arb<>eth
    // arb->eth opposite bridge using l1->l2 messager
    console.log("start to connect arb->eth using l1->l2 messager");
    const arb2ethSource = await ethers.getContractAt("LnOppositeBridge", arbitrumNetwork.oppositeBridgeProxy, arbWallet);
    const arb2ethTarget = await ethers.getContractAt("LnOppositeBridge", goerliNetwork.oppositeBridgeProxy, goerliWallet);
    await arbitrumReceiveService.authoriseAppCaller(arb2ethSource.address, true);
    await ethereumSendService.authoriseAppCaller(arb2ethTarget.address, true);
    await arb2ethSource.setReceiveService(goerliNetwork.chainId, arb2ethTarget.address, messagers.arbitrumGoerli.Eth2ArbReceiveService);
    await arb2ethTarget.setSendService(arbitrumNetwork.chainId, arb2ethSource.address, messagers.goerli.Eth2ArbSendService);
    // eth->arb default bridge using l1->l2 messager
    console.log("start to connect eth->arb using l1->l2 messager");
    const eth2arbSource = await ethers.getContractAt("LnDefaultBridge", goerliNetwork.defaultBridgeProxy, goerliWallet);
    const eth2arbTarget = await ethers.getContractAt("LnDefaultBridge", arbitrumNetwork.defaultBridgeProxy, arbWallet);
    await ethereumSendService.authoriseAppCaller(eth2arbSource.address, true);
    await arbitrumReceiveService.authoriseAppCaller(eth2arbTarget.address, true);
    await eth2arbSource.setSendService(arbitrumNetwork.chainId, eth2arbTarget.address, messagers.goerli.Eth2ArbSendService);
    await eth2arbTarget.setReceiveService(goerliNetwork.chainId, eth2arbSource.address, messagers.arbitrumGoerli.Eth2ArbReceiveService);
    console.log("finish connect arb<>eth token bridge");
}


async function connectLineaAndEth(lineaWallet, goerliWallet) {
    const lineaReceiveService = await ethers.getContractAt("Eth2LineaReceiveService", messagers.lineaGoerli.Eth2LineaReceiveService, lineaWallet);
    const ethereumSendService = await ethers.getContractAt("Eth2LineaSendService", messagers.goerli.Eth2LineaSendService, goerliWallet);
    // linea<>eth
    // linea->eth opposite bridge using l1->l2 messager
    console.log("start to connect linea->eth using l1->l2 messager");
    const linea2ethSource = await ethers.getContractAt("LnOppositeBridge", lineaNetwork.oppositeBridgeProxy, lineaWallet);
    const linea2ethTarget = await ethers.getContractAt("LnOppositeBridge", goerliNetwork.oppositeBridgeProxy, goerliWallet);
    await lineaReceiveService.authoriseAppCaller(linea2ethSource.address, true);
    await ethereumSendService.authoriseAppCaller(linea2ethTarget.address, true);
    await linea2ethSource.setReceiveService(goerliNetwork.chainId, linea2ethTarget.address, messagers.lineaGoerli.Eth2LineaReceiveService);
    await linea2ethTarget.setSendService(lineaNetwork.chainId, linea2ethSource.address, messagers.goerli.Eth2LineaSendService);
    // eth->linea default bridge using l1->l2 messager
    console.log("start to connect eth->linea using l1->l2 messager");
    const eth2lineaSource = await ethers.getContractAt("LnDefaultBridge", goerliNetwork.defaultBridgeProxy, goerliWallet);
    const eth2lineaTarget = await ethers.getContractAt("LnDefaultBridge", lineaNetwork.defaultBridgeProxy, lineaWallet);
    await lineaReceiveService.authoriseAppCaller(eth2lineaTarget.address, true);
    await ethereumSendService.authoriseAppCaller(eth2lineaSource.address, true);
    await eth2lineaSource.setSendService(lineaNetwork.chainId, eth2lineaTarget.address, messagers.goerli.Eth2LineaSendService);
    await eth2lineaTarget.setReceiveService(goerliNetwork.chainId, eth2lineaSource.address, messagers.lineaGoerli.Eth2LineaReceiveService);
    console.log("finish connect linea<>eth token bridge");
}

async function connectUsingLayerzero(leftWallet, rightWallet, leftNetwork, rightNetwork) {
    const leftMessager = await ethers.getContractAt("LayerZeroMessager", messagers[leftNetwork.name].layerzeroMessager, leftWallet);
    const rightMessager = await ethers.getContractAt("LayerZeroMessager", messagers[rightNetwork.name].layerzeroMessager, rightWallet);
    console.log("start to connect network by using layerzero");
    const left = await ethers.getContractAt("LnDefaultBridge", leftNetwork.defaultBridgeProxy, leftWallet);
    const right = await ethers.getContractAt("LnDefaultBridge", rightNetwork.defaultBridgeProxy, rightWallet);
    await leftMessager.authoriseAppCaller(left.address, true);
    await rightMessager.authoriseAppCaller(right.address, true);
    await left.setSendService(rightNetwork.chainId, right.address, messagers[leftNetwork.name].layerzeroMessager);
    await right.setReceiveService(leftNetwork.chainId, left.address, messagers[rightNetwork.name].layerzeroMessager);
    await left.setReceiveService(rightNetwork.chainId, right.address, messagers[leftNetwork.name].layerzeroMessager);
    await right.setSendService(leftNetwork.chainId, left.address, messagers[rightNetwork.name].layerzeroMessager);
}

async function connectUsingAxelar(leftWallet, rightWallet, leftNetwork, rightNetwork) {
    const leftMessager = await ethers.getContractAt("AxelarMessager", messagers[leftNetwork.name].axelarMessager, leftWallet);
    const rightMessager = await ethers.getContractAt("AxelarMessager", messagers[rightNetwork.name].axelarMessager, rightWallet);
    console.log("start to connect network by using axelar");
    const left = await ethers.getContractAt("LnDefaultBridge", leftNetwork.defaultBridgeProxy, leftWallet);
    const right = await ethers.getContractAt("LnDefaultBridge", rightNetwork.defaultBridgeProxy, rightWallet);
    await leftMessager.authoriseAppCaller(left.address, true);
    await rightMessager.authoriseAppCaller(right.address, true);
    await left.setSendService(rightNetwork.chainId, right.address, messagers[leftNetwork.name].axelarMessager);
    await right.setReceiveService(leftNetwork.chainId, left.address, messagers[rightNetwork.name].axelarMessager);
    await left.setReceiveService(rightNetwork.chainId, right.address, messagers[leftNetwork.name].axelarMessager);
    await right.setSendService(leftNetwork.chainId, left.address, messagers[rightNetwork.name].axelarMessager);
}

async function connectAll(arbWallet, lineaWallet, goerliWallet, mantleWallet, zkSyncWallet) {
    await connectArbAndEth(arbWallet, goerliWallet);
    await connectLineaAndEth(lineaWallet, goerliWallet);
    await connectUsingLayerzero(arbWallet, lineaWallet, arbitrumNetwork, lineaNetwork);
    await connectUsingLayerzero(arbWallet, mantleWallet, arbitrumNetwork, mantleNetwork);
    await connectUsingLayerzero(arbWallet, zkSyncWallet, arbitrumNetwork, zkSyncNetwork);
    await connectUsingLayerzero(lineaWallet, mantleWallet, lineaNetwork, mantleNetwork);
    await connectUsingLayerzero(lineaWallet, zkSyncWallet, lineaNetwork, zkSyncNetwork);
    await connectUsingLayerzero(zkSyncWallet, mantleWallet, zkSyncNetwork, mantleNetwork);
    await connectUsingLayerzero(zkSyncWallet, goerliWallet, zkSyncNetwork, goerliNetwork);
    await connectUsingAxelar(mantleWallet, goerliWallet, mantleNetwork, goerliNetwork);
}

async function registerToken(contractName, srcWallet, dstWallet, srcNetwork, dstNetwork, srcToken, dstToken) {
    let srcDecimals = 18;
    let dstDecimals = 18;
    const srcTokenAddress = srcNetwork[srcToken];
    const dstTokenAddress = dstNetwork[dstToken];
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

    const proxyAddress = contractName == "LnOppositeBridge" ? srcNetwork.oppositeBridgeProxy : srcNetwork.defaultBridgeProxy;

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

async function registerAllToken(arbWallet, lineaWallet, goerliWallet, mantleWallet, zkSyncWallet) {
    //arb<>eth
    await registerToken("LnOppositeBridge", arbWallet, goerliWallet, arbitrumNetwork, goerliNetwork, "usdc", "usdc");
    await registerToken("LnDefaultBridge", goerliWallet, arbWallet, goerliNetwork, arbitrumNetwork, "usdc", "usdc");
    await registerToken("LnOppositeBridge", arbWallet, goerliWallet, arbitrumNetwork, goerliNetwork, "usdt", "usdt");
    await registerToken("LnDefaultBridge", goerliWallet, arbWallet, goerliNetwork, arbitrumNetwork, "usdt", "usdt");
    await registerToken("LnOppositeBridge", arbWallet, goerliWallet, arbitrumNetwork, goerliNetwork, "eth", "eth");
    await registerToken("LnDefaultBridge", goerliWallet, arbWallet, goerliNetwork, arbitrumNetwork, "eth", "eth");

    // linea<>eth
    await registerToken("LnOppositeBridge", lineaWallet, goerliWallet, lineaNetwork, goerliNetwork, "usdc", "usdc");
    await registerToken("LnDefaultBridge", goerliWallet, lineaWallet, goerliNetwork, lineaNetwork, "usdc", "usdc");
    await registerToken("LnOppositeBridge", lineaWallet, goerliWallet, lineaNetwork, goerliNetwork, "usdt", "usdt");
    await registerToken("LnDefaultBridge", goerliWallet, lineaWallet, goerliNetwork, lineaNetwork, "usdt", "usdt");
    await registerToken("LnOppositeBridge", lineaWallet, goerliWallet, lineaNetwork, goerliNetwork, "eth", "eth");
    await registerToken("LnDefaultBridge", goerliWallet, lineaWallet, goerliNetwork, lineaNetwork, "eth", "eth");

    //arb<>linea
    await registerToken("LnDefaultBridge", arbWallet, lineaWallet, arbitrumNetwork, lineaNetwork, "usdc", "usdc");
    await registerToken("LnDefaultBridge", lineaWallet, arbWallet, lineaNetwork, arbitrumNetwork, "usdc", "usdc");
    await registerToken("LnDefaultBridge", arbWallet, lineaWallet, arbitrumNetwork, lineaNetwork, "usdt", "usdt");
    await registerToken("LnDefaultBridge", lineaWallet, arbWallet, lineaNetwork, arbitrumNetwork, "usdt", "usdt");
    await registerToken("LnDefaultBridge", arbWallet, lineaWallet, arbitrumNetwork, lineaNetwork, "eth", "eth");
    await registerToken("LnDefaultBridge", lineaWallet, arbWallet, lineaNetwork, arbitrumNetwork, "eth", "eth");

    //arb<>mantle
    await registerToken("LnDefaultBridge", arbWallet, mantleWallet, arbitrumNetwork, mantleNetwork, "usdc", "usdc");
    await registerToken("LnDefaultBridge", mantleWallet, arbWallet, mantleNetwork, arbitrumNetwork, "usdc", "usdc");
    await registerToken("LnDefaultBridge", arbWallet, mantleWallet, arbitrumNetwork, mantleNetwork, "usdt", "usdt");
    await registerToken("LnDefaultBridge", mantleWallet, arbWallet, mantleNetwork, arbitrumNetwork, "usdt", "usdt");

    // mantle<>linea
    await registerToken("LnDefaultBridge", mantleWallet, lineaWallet, mantleNetwork, lineaNetwork, "usdc", "usdc");
    await registerToken("LnDefaultBridge", lineaWallet, mantleWallet, lineaNetwork, mantleNetwork, "usdc", "usdc");
    await registerToken("LnDefaultBridge", mantleWallet, lineaWallet, mantleNetwork, lineaNetwork, "usdt", "usdt");
    await registerToken("LnDefaultBridge", lineaWallet, mantleWallet, lineaNetwork, mantleNetwork, "usdt", "usdt");

    // mantle<>eth
    await registerToken("LnDefaultBridge", goerliWallet, mantleWallet, goerliNetwork, mantleNetwork, "usdc", "usdc");
    await registerToken("LnDefaultBridge", mantleWallet, goerliWallet, mantleNetwork, goerliNetwork, "usdc", "usdc");
    await registerToken("LnDefaultBridge", goerliWallet, mantleWallet, goerliNetwork, mantleNetwork, "usdt", "usdt");
    await registerToken("LnDefaultBridge", mantleWallet, goerliWallet, mantleNetwork, goerliNetwork, "usdt", "usdt");
    await registerToken("LnDefaultBridge", goerliWallet, mantleWallet, goerliNetwork, mantleNetwork, "mnt", "mnt");
    await registerToken("LnDefaultBridge", mantleWallet, goerliWallet, mantleNetwork, goerliNetwork, "mnt", "mnt");

    // zkSync<>eth
    await registerToken("LnDefaultBridge", zkSyncWallet, goerliWallet, zkSyncNetwork, goerliNetwork, "usdc", "usdc");
    await registerToken("LnDefaultBridge", goerliWallet, zkSyncWallet, goerliNetwork, zkSyncNetwork, "usdc", "usdc");
    await registerToken("LnDefaultBridge", zkSyncWallet, goerliWallet, zkSyncNetwork, goerliNetwork, "usdt", "usdt");
    await registerToken("LnDefaultBridge", goerliWallet, zkSyncWallet, goerliNetwork, zkSyncNetwork, "usdt", "usdt");
    await registerToken("LnDefaultBridge", zkSyncWallet, goerliWallet, zkSyncNetwork, goerliNetwork, "eth", "eth");
    await registerToken("LnDefaultBridge", goerliWallet, zkSyncWallet, goerliNetwork, zkSyncNetwork, "eth", "eth");

    // zkSync<>arb
    await registerToken("LnDefaultBridge", zkSyncWallet, arbWallet, zkSyncNetwork, arbitrumNetwork, "usdc", "usdc");
    await registerToken("LnDefaultBridge", arbWallet, zkSyncWallet, arbitrumNetwork, zkSyncNetwork, "usdc", "usdc");
    await registerToken("LnDefaultBridge", zkSyncWallet, arbWallet, zkSyncNetwork, arbitrumNetwork, "usdt", "usdt");
    await registerToken("LnDefaultBridge", arbWallet, zkSyncWallet, arbitrumNetwork, zkSyncNetwork, "usdt", "usdt");
    await registerToken("LnDefaultBridge", zkSyncWallet, arbWallet, zkSyncNetwork, arbitrumNetwork, "eth", "eth");
    await registerToken("LnDefaultBridge", arbWallet, zkSyncWallet, arbitrumNetwork, zkSyncNetwork, "eth", "eth");

    // zkSync<>linea
    await registerToken("LnDefaultBridge", zkSyncWallet, lineaWallet, zkSyncNetwork, lineaNetwork, "usdc", "usdc");
    await registerToken("LnDefaultBridge", lineaWallet, zkSyncWallet, lineaNetwork, zkSyncNetwork, "usdc", "usdc");
    await registerToken("LnDefaultBridge", zkSyncWallet, lineaWallet, zkSyncNetwork, lineaNetwork, "usdt", "usdt");
    await registerToken("LnDefaultBridge", lineaWallet, zkSyncWallet, lineaNetwork, zkSyncNetwork, "usdt", "usdt");
    await registerToken("LnDefaultBridge", zkSyncWallet, lineaWallet, zkSyncNetwork, lineaNetwork, "eth", "eth");
    await registerToken("LnDefaultBridge", lineaWallet, zkSyncWallet, lineaNetwork, zkSyncNetwork, "eth", "eth");

    // zkSync<>mantle
    await registerToken("LnDefaultBridge", zkSyncWallet, mantleWallet, zkSyncNetwork, mantleNetwork, "usdc", "usdc");
    await registerToken("LnDefaultBridge", mantleWallet, zkSyncWallet, mantleNetwork, zkSyncNetwork, "usdc", "usdc");
    await registerToken("LnDefaultBridge", zkSyncWallet, mantleWallet, zkSyncNetwork, mantleNetwork, "usdt", "usdt");
    await registerToken("LnDefaultBridge", mantleWallet, zkSyncWallet, mantleNetwork, zkSyncNetwork, "usdt", "usdt");
}

async function registerRelayer(contractName, srcWallet, dstWallet, srcNetwork, dstNetwork, srcToken, dstToken) {
    const srcTokenAddress = srcNetwork[srcToken];
    const dstTokenAddress = dstNetwork[dstToken];
    let srcDecimals = 18;
    let dstDecimals = 18;

    if (srcTokenAddress != kNativeTokenAddress) {
        const sourceToken = await ethers.getContractAt("Erc20", srcTokenAddress, srcWallet);
        srcDecimals = await sourceToken.decimals();
    }
    if (dstTokenAddress != kNativeTokenAddress) {
        const targetToken = await ethers.getContractAt("Erc20", dstTokenAddress, dstWallet);
        dstDecimals = await targetToken.decimals();
    }
    const baseFee = ethers.utils.parseUnits("20", srcDecimals);
    const liquidityFeeRate = 30;

    // default bridge
    if (contractName == "LnDefaultBridge") {
        // set source network
        let margin = ethers.utils.parseUnits("1000000", dstDecimals);
        let value = 0;
        if (dstTokenAddress == kNativeTokenAddress) {
            margin = ethers.utils.parseUnits("0.1", dstDecimals);
            value = margin;
        }
        const source = await ethers.getContractAt(contractName, srcNetwork.defaultBridgeProxy, srcWallet);
        await source.setProviderFee(
            dstNetwork.chainId,
            srcTokenAddress,
            dstTokenAddress,
            baseFee,
            liquidityFeeRate
        );
        // set target network
        const target = await ethers.getContractAt(contractName, dstNetwork.defaultBridgeProxy, dstWallet);
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
        const source = await ethers.getContractAt(contractName, srcNetwork.oppositeBridgeProxy, srcWallet);
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

async function registerAllRelayer(arbWallet, lineaWallet, goerliWallet, mantleWallet, zkSyncWallet) {
    //arb<>eth
    console.log("start to register arb<>eth relayer");
    await registerRelayer("LnOppositeBridge", arbWallet, goerliWallet, arbitrumNetwork, goerliNetwork, "usdc", "usdc");
    await registerRelayer("LnDefaultBridge", goerliWallet, arbWallet, goerliNetwork, arbitrumNetwork, "usdc", "usdc");
    await registerRelayer("LnOppositeBridge", arbWallet, goerliWallet, arbitrumNetwork, goerliNetwork, "usdt", "usdt");
    await registerRelayer("LnDefaultBridge", goerliWallet, arbWallet, goerliNetwork, arbitrumNetwork, "usdt", "usdt");
    await registerRelayer("LnOppositeBridge", arbWallet, goerliWallet, arbitrumNetwork, goerliNetwork, "eth", "eth");
    await registerRelayer("LnDefaultBridge", goerliWallet, arbWallet, goerliNetwork, arbitrumNetwork, "eth", "eth");

    // linea<>eth
    console.log("start to register linea<>eth relayer");
    await registerRelayer("LnOppositeBridge", lineaWallet, goerliWallet, lineaNetwork, goerliNetwork, "usdc", "usdc");
    await registerRelayer("LnDefaultBridge", goerliWallet, lineaWallet, goerliNetwork, lineaNetwork, "usdc", "usdc");
    await registerRelayer("LnOppositeBridge", lineaWallet, goerliWallet, lineaNetwork, goerliNetwork, "usdt", "usdt");
    await registerRelayer("LnDefaultBridge", goerliWallet, lineaWallet, goerliNetwork, lineaNetwork, "usdt", "usdt");
    await registerRelayer("LnOppositeBridge", lineaWallet, goerliWallet, lineaNetwork, goerliNetwork, "eth", "eth");
    await registerRelayer("LnDefaultBridge", goerliWallet, lineaWallet, goerliNetwork, lineaNetwork, "eth", "eth");

    //arb<>linea
    console.log("start to register linea<>arb relayer");
    await registerRelayer("LnDefaultBridge", arbWallet, lineaWallet, arbitrumNetwork, lineaNetwork, "usdc", "usdc");
    await registerRelayer("LnDefaultBridge", lineaWallet, arbWallet, lineaNetwork, arbitrumNetwork, "usdc", "usdc");
    await registerRelayer("LnDefaultBridge", arbWallet, lineaWallet, arbitrumNetwork, lineaNetwork, "usdt", "usdt");
    await registerRelayer("LnDefaultBridge", lineaWallet, arbWallet, lineaNetwork, arbitrumNetwork, "usdt", "usdt");
    await registerRelayer("LnDefaultBridge", arbWallet, lineaWallet, arbitrumNetwork, lineaNetwork, "eth", "eth");
    await registerRelayer("LnDefaultBridge", lineaWallet, arbWallet, lineaNetwork, arbitrumNetwork, "eth", "eth");

    //arb<>mantle
    console.log("start to register mantle<>arb relayer");
    await registerRelayer("LnDefaultBridge", arbWallet, mantleWallet, arbitrumNetwork, mantleNetwork, "usdc", "usdc");
    await registerRelayer("LnDefaultBridge", mantleWallet, arbWallet, mantleNetwork, arbitrumNetwork, "usdc", "usdc");
    await registerRelayer("LnDefaultBridge", arbWallet, mantleWallet, arbitrumNetwork, mantleNetwork, "usdt", "usdt");
    await registerRelayer("LnDefaultBridge", mantleWallet, arbWallet, mantleNetwork, arbitrumNetwork, "usdt", "usdt");

    // mantle<>linea
    console.log("start to register mantle<>linea relayer");
    await registerRelayer("LnDefaultBridge", mantleWallet, lineaWallet, mantleNetwork, lineaNetwork, "usdc", "usdc");
    await registerRelayer("LnDefaultBridge", lineaWallet, mantleWallet, lineaNetwork, mantleNetwork, "usdc", "usdc");
    await registerRelayer("LnDefaultBridge", mantleWallet, lineaWallet, mantleNetwork, lineaNetwork, "usdt", "usdt");
    await registerRelayer("LnDefaultBridge", lineaWallet, mantleWallet, lineaNetwork, mantleNetwork, "usdt", "usdt");

    // mantle<>eth
    console.log("start to register mantle<>eth relayer");
    await registerRelayer("LnDefaultBridge", goerliWallet, mantleWallet, goerliNetwork, mantleNetwork, "usdc", "usdc");
    await registerRelayer("LnDefaultBridge", mantleWallet, goerliWallet, mantleNetwork, goerliNetwork, "usdc", "usdc");
    await registerRelayer("LnDefaultBridge", goerliWallet, mantleWallet, goerliNetwork, mantleNetwork, "usdt", "usdt");
    await registerRelayer("LnDefaultBridge", mantleWallet, goerliWallet, mantleNetwork, goerliNetwork, "usdt", "usdt");
    await registerRelayer("LnDefaultBridge", goerliWallet, mantleWallet, goerliNetwork, mantleNetwork, "mnt", "mnt");
    await registerRelayer("LnDefaultBridge", mantleWallet, goerliWallet, mantleNetwork, goerliNetwork, "mnt", "mnt");

    // arb<>zkSync
    await registerRelayer("LnDefaultBridge", arbWallet, zkSyncWallet, arbitrumNetwork, zkSyncNetwork, "usdc", "usdc");
    await registerRelayer("LnDefaultBridge", zkSyncWallet, arbWallet, zkSyncNetwork, arbitrumNetwork, "usdc", "usdc");
    await registerRelayer("LnDefaultBridge", arbWallet, zkSyncWallet, arbitrumNetwork, zkSyncNetwork, "usdt", "usdt");
    await registerRelayer("LnDefaultBridge", zkSyncWallet, arbWallet, zkSyncNetwork, arbitrumNetwork, "usdt", "usdt");
    await registerRelayer("LnDefaultBridge", arbWallet, zkSyncWallet, arbitrumNetwork, zkSyncNetwork, "eth", "eth");
    await registerRelayer("LnDefaultBridge", zkSyncWallet, arbWallet, zkSyncNetwork, arbitrumNetwork, "eth", "eth");
    // eth<>zkSync
    await registerRelayer("LnDefaultBridge", goerliWallet, zkSyncWallet, goerliNetwork, zkSyncNetwork, "usdc", "usdc");
    await registerRelayer("LnDefaultBridge", zkSyncWallet, goerliWallet, zkSyncNetwork, goerliNetwork, "usdc", "usdc");
    await registerRelayer("LnDefaultBridge", goerliWallet, zkSyncWallet, goerliNetwork, zkSyncNetwork, "usdt", "usdt");
    await registerRelayer("LnDefaultBridge", zkSyncWallet, goerliWallet, zkSyncNetwork, goerliNetwork, "usdt", "usdt");
    await registerRelayer("LnDefaultBridge", goerliWallet, zkSyncWallet, goerliNetwork, zkSyncNetwork, "eth", "eth");
    await registerRelayer("LnDefaultBridge", zkSyncWallet, goerliWallet, zkSyncNetwork, goerliNetwork, "eth", "eth");
    // mantle<>zkSync                                                                                                 
    await registerRelayer("LnDefaultBridge", mantleWallet, zkSyncWallet, mantleNetwork, zkSyncNetwork, "usdc", "usdc");
    await registerRelayer("LnDefaultBridge", zkSyncWallet, mantleWallet, zkSyncNetwork, mantleNetwork, "usdc", "usdc");
    await registerRelayer("LnDefaultBridge", mantleWallet, zkSyncWallet, mantleNetwork, zkSyncNetwork, "usdt", "usdt");
    await registerRelayer("LnDefaultBridge", zkSyncWallet, mantleWallet, zkSyncNetwork, mantleNetwork, "usdt", "usdt");
    // linea<>zkSync
    await registerRelayer("LnDefaultBridge", lineaWallet, zkSyncWallet, lineaNetwork, zkSyncNetwork, "usdc", "usdc");
    await registerRelayer("LnDefaultBridge", zkSyncWallet, lineaWallet, zkSyncNetwork, lineaNetwork, "usdc", "usdc");
    await registerRelayer("LnDefaultBridge", lineaWallet, zkSyncWallet, lineaNetwork, zkSyncNetwork, "usdt", "usdt");
    await registerRelayer("LnDefaultBridge", zkSyncWallet, lineaWallet, zkSyncNetwork, lineaNetwork, "usdt", "usdt");
    await registerRelayer("LnDefaultBridge", lineaWallet, zkSyncWallet, lineaNetwork, zkSyncNetwork, "eth", "eth");
    await registerRelayer("LnDefaultBridge", zkSyncWallet, lineaWallet, zkSyncNetwork, lineaNetwork, "eth", "eth");
}

async function mintToken(tokenAddress, network, wallet, to) {
    const token = await ethers.getContractAt("Erc20", network[tokenAddress], wallet);
    const decimals = await token.decimals();
    const amount = ethers.utils.parseUnits("9000000", decimals);
    console.log("start to mint token", tokenAddress, amount);
    await token.mint(to, amount);
}

async function approveToken(tokenAddress, network, wallet) {
    const token = await ethers.getContractAt("Erc20", network[tokenAddress], wallet);
    const decimals = await token.decimals();
    console.log("start to approve", tokenAddress);
    await token.approve(network.defaultBridgeProxy, ethers.utils.parseUnits("10000000000000", decimals));
    await wait(5000);
    await token.approve(network.oppositeBridgeProxy, ethers.utils.parseUnits("10000000000000", decimals));
    await wait(5000);
    console.log("finished to approve", tokenAddress);
}

async function mintAll(relayer, arbWallet, lineaWallet, goerliWallet, mantleWallet, zkSyncWallet) {
    await mintToken("usdc", goerliNetwork, goerliWallet, relayer);
    await mintToken("usdt", goerliNetwork, goerliWallet, relayer);
    await mintToken("usdc", lineaNetwork, lineaWallet, relayer);
    await mintToken("usdt", lineaNetwork, lineaWallet, relayer);
    await mintToken("usdc", arbitrumNetwork, arbWallet, relayer);
    await mintToken("usdt", arbitrumNetwork, arbWallet, relayer);
    await mintToken("usdc", mantleNetwork, mantleWallet, relayer);
    await mintToken("usdt", mantleNetwork, mantleWallet, relayer);
    await mintToken("usdt", zkSyncNetwork, zkSyncWallet, relayer);
    await mintToken("usdc", zkSyncNetwork, zkSyncWallet, relayer);
}

async function approveAll(arbWallet, lineaWallet, goerliWallet, mantleWallet, zkSyncWallet) {
    await approveToken("usdc", goerliNetwork, goerliWallet);
    await approveToken("usdt", goerliNetwork, goerliWallet);
    await approveToken("mnt", goerliNetwork, goerliWallet);
    await approveToken("usdc", lineaNetwork, lineaWallet);
    await approveToken("usdt", lineaNetwork, lineaWallet);
    await approveToken("usdc", arbitrumNetwork, arbWallet);
    await approveToken("usdt", arbitrumNetwork, arbWallet);
    await approveToken("usdc", mantleNetwork, mantleWallet);
    await approveToken("usdt", mantleNetwork, mantleWallet);
    await approveToken("usdt", zkSyncNetwork, zkSyncWallet);
    await approveToken("usdc", zkSyncNetwork, zkSyncWallet);
}

// 2. deploy mapping token factory
async function main() {
    const arbWallet = wallet(arbitrumNetwork.url);
    const lineaWallet = wallet(lineaNetwork.url);
    const goerliWallet = wallet(goerliNetwork.url);
    const mantleWallet = wallet(mantleNetwork.url);
    const zkSyncWallet = wallet(zkSyncNetwork.url);

    // set messager service
    //await connectAll(arbWallet, lineaWallet, goerliWallet, mantleWallet, zkSyncWallet);
    await registerAllToken(arbWallet, lineaWallet, goerliWallet, mantleWallet, zkSyncWallet);
    //await mintAll(relayer, arbWallet, lineaWallet, goerliWallet, mantleWallet, zkSyncWallet);
    //await approveAll(arbWallet, lineaWallet, goerliWallet, mantleWallet, zkSyncWallet);
    //await registerAllRelayer(arbWallet, lineaWallet, goerliWallet, mantleWallet, zkSyncWallet);
    console.log("finished!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
