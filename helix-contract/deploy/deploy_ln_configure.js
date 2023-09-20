const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');

var ProxyDeployer = require("./proxy.js");

const privateKey = process.env.PRIKEY

const lineaNetwork = {
    url: "https://rpc.goerli.linea.build",
    chainId: 59140,
    defaultBridgeProxy: "0x54cc9716905ba8ebdD01E6364125cA338Cd0054E",
    oppositeBridgeProxy: "0x79e6f452f1e491a7aF0382FA0a6EF9368691960D",
    name: "lineaGoerli",
    usdc: "0xb5E028f980dF5533cB0e8F04530B76637383d993",
    usdt: "0xBC1A2f123Dc9CD2ec8d3cE42eF16c28F3C9bA686",
};

const arbitrumNetwork = {
    url: "https://goerli-rollup.arbitrum.io/rpc",
    chainId: 421613,
    defaultBridgeProxy: "0x54cc9716905ba8ebdD01E6364125cA338Cd0054E",
    oppositeBridgeProxy: "0x79e6f452f1e491a7aF0382FA0a6EF9368691960D",
    name: "arbitrumGoerli",
    usdc: "0x39dE82E1d9B8F62E11022FC3FC127a82F93fE47E",
    usdt: "0x6d828718c1097A4C573bc25c638Cc05bF10dFeAF",
};

const goerliNetwork = {
    url: "https://rpc.ankr.com/eth_goerli",
    chainId: 5,
    defaultBridgeProxy: "0x54cc9716905ba8ebdD01E6364125cA338Cd0054E",
    oppositeBridgeProxy: "0x79e6f452f1e491a7aF0382FA0a6EF9368691960D",
    name: "goerli",
    usdc: "0x1a70127284B774fF4A4dbfe0115114642f0eca65",
    usdt: "0x2303e4d55BF16a897Cb5Ab71c6225399509d9314",
};

const mantleNetwork = {
    url: "https://rpc.testnet.mantle.xyz",
    chainId: 5001,
    defaultBridgeProxy: "0x54cc9716905ba8ebdD01E6364125cA338Cd0054E",
    oppositeBridgeProxy: "0x79e6f452f1e491a7aF0382FA0a6EF9368691960D",
    name: "mantleGoerli",
    usdc: "0x0258Eb547bFEd540ed17843658C018569fe1E328",
    usdt: "0x5F8D4232367759bCe5d9488D3ade77FCFF6B9b6B",
}

const messagers = {
    goerli: {
        Eth2ArbSendService: "0x3A48cB99a052fe0176CA347B8A1d428DCDf21743",
        Eth2LineaSendService: "0x64f30477bb6e4964ab8Bc52B737BAA21Bbf5c0F8",
        layerzeroMessager: "0x35CC32798979f5BE7258006036d8855d1311BEFb",
        axelarMessager: "0x18675889c188Cbd1B631AD93214a70Bc5CAc3F0c"
    },
    arbitrumGoerli: {
        Eth2ArbReceiveService: "0xf214024C0bc123F8E109D3dF1D4A4ef9A3b87b61",
        layerzeroMessager: "0xd66FFAbf8766afB1957507382191381B570907db",
        axelarMessager: "0xB03dD202186d4b98BE607361DC451bE01b6543F9"
    },
    lineaGoerli: {
        Eth2LineaReceiveService: "0x7d86d2aA6342AcF09b3354591d59Eb888543f7c8",
        layerzeroMessager: "0x19fDb8B01B3e37B43B291DD24093cA17Ae43863E",
        axelarMessager: "0xaF421E2a796984E1eAFF34E3bBD47C9caAd60E82"
    },
    mantleGoerli: {
        layerzeroMessager: "0xB3D5ffebdf185Ad1EeA8bc90075FDED515Ba3077",
        axelarMessager: "0x258512bb76beA435aB353f3bdc187F4D5574289a"
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

async function connectAll(arbWallet, lineaWallet, goerliWallet, mantleWallet) {
    await connectArbAndEth(arbWallet, goerliWallet);
    await connectLineaAndEth(lineaWallet, goerliWallet);
    await connectUsingLayerzero(arbWallet, lineaWallet, arbitrumNetwork, lineaNetwork);
    await connectUsingLayerzero(arbWallet, mantleWallet, arbitrumNetwork, mantleNetwork);
    await connectUsingLayerzero(lineaWallet, mantleWallet, lineaNetwork, mantleNetwork);
    await connectUsingAxelar(mantleWallet, goerliWallet, mantleNetwork, goerliNetwork);
}

async function registerToken(contractName, srcWallet, dstWallet, srcNetwork, dstNetwork, token) {
    const sourceToken = await ethers.getContractAt("Erc20", srcNetwork[token], srcWallet);
    const targetToken = await ethers.getContractAt("Erc20", dstNetwork[token], dstWallet);
    const srcDecimals = await sourceToken.decimals();
    const dstDecimals = await targetToken.decimals();
    const fee = ethers.utils.parseUnits("100", srcDecimals);
    const penalty = ethers.utils.parseUnits("1000", srcDecimals);

    const proxyAddress = contractName == "LnOppositeBridge" ? srcNetwork.oppositeBridgeProxy : srcNetwork.defaultBridgeProxy;

    const source = await ethers.getContractAt(contractName, proxyAddress, srcWallet);
    await source.setTokenInfo(
        dstNetwork.chainId,
        sourceToken.address,
        targetToken.address,
        fee,
        penalty,
        srcDecimals,
        dstDecimals);
    console.log("finished register token", srcNetwork.chainId, dstNetwork.chainId, contractName, token);
}

async function registerAllToken(arbWallet, lineaWallet, goerliWallet, mantleWallet) {
    //arb<>eth
    await registerToken("LnOppositeBridge", arbWallet, goerliWallet, arbitrumNetwork, goerliNetwork, "usdc");
    await registerToken("LnDefaultBridge", goerliWallet, arbWallet, goerliNetwork, arbitrumNetwork, "usdc");
    await registerToken("LnOppositeBridge", arbWallet, goerliWallet, arbitrumNetwork, goerliNetwork, "usdt");
    await registerToken("LnDefaultBridge", goerliWallet, arbWallet, goerliNetwork, arbitrumNetwork, "usdt");

    // linea<>eth
    await registerToken("LnOppositeBridge", lineaWallet, goerliWallet, lineaNetwork, goerliNetwork, "usdc");
    await registerToken("LnDefaultBridge", goerliWallet, lineaWallet, goerliNetwork, lineaNetwork, "usdc");
    await registerToken("LnOppositeBridge", lineaWallet, goerliWallet, lineaNetwork, goerliNetwork, "usdt");
    await registerToken("LnDefaultBridge", goerliWallet, lineaWallet, goerliNetwork, lineaNetwork, "usdt");

    //arb<>linea
    await registerToken("LnDefaultBridge", arbWallet, lineaWallet, arbitrumNetwork, lineaNetwork, "usdc");
    await registerToken("LnDefaultBridge", lineaWallet, arbWallet, lineaNetwork, arbitrumNetwork, "usdc");
    await registerToken("LnDefaultBridge", arbWallet, lineaWallet, arbitrumNetwork, lineaNetwork, "usdt");
    await registerToken("LnDefaultBridge", lineaWallet, arbWallet, lineaNetwork, arbitrumNetwork, "usdt");

    //arb<>mantle
    await registerToken("LnDefaultBridge", arbWallet, mantleWallet, arbitrumNetwork, mantleNetwork, "usdc");
    await registerToken("LnDefaultBridge", mantleWallet, arbWallet, mantleNetwork, arbitrumNetwork, "usdc");
    await registerToken("LnDefaultBridge", arbWallet, mantleWallet, arbitrumNetwork, mantleNetwork, "usdt");
    await registerToken("LnDefaultBridge", mantleWallet, arbWallet, mantleNetwork, arbitrumNetwork, "usdt");

    // mantle<>linea
    await registerToken("LnDefaultBridge", mantleWallet, lineaWallet, mantleNetwork, lineaNetwork, "usdc");
    await registerToken("LnDefaultBridge", lineaWallet, mantleWallet, lineaNetwork, mantleNetwork, "usdc");
    await registerToken("LnDefaultBridge", mantleWallet, lineaWallet, mantleNetwork, lineaNetwork, "usdt");
    await registerToken("LnDefaultBridge", lineaWallet, mantleWallet, lineaNetwork, mantleNetwork, "usdt");

    // mantle<>eth
    await registerToken("LnDefaultBridge", goerliWallet, mantleWallet, goerliNetwork, mantleNetwork, "usdc");
    await registerToken("LnDefaultBridge", mantleWallet, goerliWallet, mantleNetwork, goerliNetwork, "usdc");
    await registerToken("LnDefaultBridge", goerliWallet, mantleWallet, goerliNetwork, mantleNetwork, "usdt");
    await registerToken("LnDefaultBridge", mantleWallet, goerliWallet, mantleNetwork, goerliNetwork, "usdt");
}

async function registerRelayer(contractName, srcWallet, dstWallet, srcNetwork, dstNetwork, token) {
    const sourceToken = await ethers.getContractAt("Erc20", srcNetwork[token], srcWallet);
    const targetToken = await ethers.getContractAt("Erc20", dstNetwork[token], dstWallet);
    const srcDecimals = await sourceToken.decimals();
    const dstDecimals = await targetToken.decimals();
    const baseFee = ethers.utils.parseUnits("20", srcDecimals);
    const liquidityFeeRate = 30;

    // default bridge
    if (contractName == "LnDefaultBridge") {
        // set source network
        const margin = ethers.utils.parseUnits("1000000", dstDecimals);
        const source = await ethers.getContractAt(contractName, srcNetwork.defaultBridgeProxy, srcWallet);
        await source.setProviderFee(
            dstNetwork.chainId,
            sourceToken.address,
            targetToken.address,
            baseFee,
            liquidityFeeRate
        );
        // set target network
        const target = await ethers.getContractAt(contractName, dstNetwork.defaultBridgeProxy, dstWallet);
        await target.depositProviderMargin(
            srcNetwork.chainId,
            sourceToken.address,
            targetToken.address,
            margin
        );
    } else {
        const margin = ethers.utils.parseUnits("1000000", srcDecimals);
        const source = await ethers.getContractAt(contractName, srcNetwork.oppositeBridgeProxy, srcWallet);
        await source.updateProviderFeeAndMargin(
            dstNetwork.chainId,
            sourceToken.address,
            targetToken.address,
            margin,
            baseFee,
            liquidityFeeRate
        );
    }
    console.log("finished register relayer", srcNetwork.chainId, dstNetwork.chainId, contractName, token);

}

async function registerAllRelayer(arbWallet, lineaWallet, goerliWallet, mantleWallet) {
    //arb<>eth
    console.log("start to register arb<>eth relayer");
    await registerRelayer("LnOppositeBridge", arbWallet, goerliWallet, arbitrumNetwork, goerliNetwork, "usdc");
    await registerRelayer("LnDefaultBridge", goerliWallet, arbWallet, goerliNetwork, arbitrumNetwork, "usdc");
    await registerRelayer("LnOppositeBridge", arbWallet, goerliWallet, arbitrumNetwork, goerliNetwork, "usdt");
    await registerRelayer("LnDefaultBridge", goerliWallet, arbWallet, goerliNetwork, arbitrumNetwork, "usdt");

    // linea<>eth
    console.log("start to register linea<>eth relayer");
    await registerRelayer("LnOppositeBridge", lineaWallet, goerliWallet, lineaNetwork, goerliNetwork, "usdc");
    await registerRelayer("LnDefaultBridge", goerliWallet, lineaWallet, goerliNetwork, lineaNetwork, "usdc");
    await registerRelayer("LnOppositeBridge", lineaWallet, goerliWallet, lineaNetwork, goerliNetwork, "usdt");
    await registerRelayer("LnDefaultBridge", goerliWallet, lineaWallet, goerliNetwork, lineaNetwork, "usdt");

    //arb<>linea
    console.log("start to register linea<>arb relayer");
    await registerRelayer("LnDefaultBridge", arbWallet, lineaWallet, arbitrumNetwork, lineaNetwork, "usdc");
    await registerRelayer("LnDefaultBridge", lineaWallet, arbWallet, lineaNetwork, arbitrumNetwork, "usdc");
    await registerRelayer("LnDefaultBridge", arbWallet, lineaWallet, arbitrumNetwork, lineaNetwork, "usdt");
    await registerRelayer("LnDefaultBridge", lineaWallet, arbWallet, lineaNetwork, arbitrumNetwork, "usdt");

    //arb<>mantle
    console.log("start to register mantle<>arb relayer");
    await registerRelayer("LnDefaultBridge", arbWallet, mantleWallet, arbitrumNetwork, mantleNetwork, "usdc");
    await registerRelayer("LnDefaultBridge", mantleWallet, arbWallet, mantleNetwork, arbitrumNetwork, "usdc");
    await registerRelayer("LnDefaultBridge", arbWallet, mantleWallet, arbitrumNetwork, mantleNetwork, "usdt");
    await registerRelayer("LnDefaultBridge", mantleWallet, arbWallet, mantleNetwork, arbitrumNetwork, "usdt");

    // mantle<>linea
    console.log("start to register mantle<>linea relayer");
    await registerRelayer("LnDefaultBridge", mantleWallet, lineaWallet, mantleNetwork, lineaNetwork, "usdc");
    await registerRelayer("LnDefaultBridge", lineaWallet, mantleWallet, lineaNetwork, mantleNetwork, "usdc");
    await registerRelayer("LnDefaultBridge", mantleWallet, lineaWallet, mantleNetwork, lineaNetwork, "usdt");
    await registerRelayer("LnDefaultBridge", lineaWallet, mantleWallet, lineaNetwork, mantleNetwork, "usdt");

    // mantle<>eth
    console.log("start to register mantle<>eth relayer");
    await registerRelayer("LnDefaultBridge", goerliWallet, mantleWallet, goerliNetwork, mantleNetwork, "usdc");
    await registerRelayer("LnDefaultBridge", mantleWallet, goerliWallet, mantleNetwork, goerliNetwork, "usdc");
    await registerRelayer("LnDefaultBridge", goerliWallet, mantleWallet, goerliNetwork, mantleNetwork, "usdt");
    await registerRelayer("LnDefaultBridge", mantleWallet, goerliWallet, mantleNetwork, goerliNetwork, "usdt");
}

async function mintAndApproveToken(tokenAddress, network, wallet) {
    const token = await ethers.getContractAt("Erc20", network[tokenAddress], wallet);
    const decimals = await token.decimals();
    const amount = ethers.utils.parseUnits("10000000", decimals);
    //console.log("start to mint token", tokenAddress, amount);
    //await token.mint(wallet.address, amount);
    await wait(5000);
    console.log("start to approve", tokenAddress);
    await token.approve(network.defaultBridgeProxy, ethers.utils.parseUnits("10000000000000", decimals));
    await wait(5000);
    await token.approve(network.oppositeBridgeProxy, ethers.utils.parseUnits("10000000000000", decimals));
    await wait(5000);
    console.log("finished to approve", tokenAddress);
}

async function mintAndApproveAll(arbWallet, lineaWallet, goerliWallet, mantleWallet) {
    await mintAndApproveToken("usdc", goerliNetwork, goerliWallet);
    await mintAndApproveToken("usdt", goerliNetwork, goerliWallet);
    await mintAndApproveToken("usdc", lineaNetwork, lineaWallet);
    await mintAndApproveToken("usdt", lineaNetwork, lineaWallet);
    await mintAndApproveToken("usdc", arbitrumNetwork, arbWallet);
    await mintAndApproveToken("usdt", arbitrumNetwork, arbWallet);
    await mintAndApproveToken("usdc", mantleNetwork, mantleWallet);
    await mintAndApproveToken("usdt", mantleNetwork, mantleWallet);
}

// 2. deploy mapping token factory
async function main() {
    const arbWallet = wallet(arbitrumNetwork.url);
    const lineaWallet = wallet(lineaNetwork.url);
    const goerliWallet = wallet(goerliNetwork.url);
    const mantleWallet = wallet(mantleNetwork.url);

    // set messager service
    await connectAll(arbWallet, lineaWallet, goerliWallet, mantleWallet);
    //await registerAllToken(arbWallet, lineaWallet, goerliWallet, mantleWallet);
    //await mintAndApproveAll(arbWallet, lineaWallet, goerliWallet, mantleWallet);
    //await registerRelayer("LnDefaultBridge", goerliWallet, lineaWallet, goerliNetwork, lineaNetwork, "usdt");
    //await registerAllRelayer(arbWallet, lineaWallet, goerliWallet, mantleWallet);
    console.log("finished!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
