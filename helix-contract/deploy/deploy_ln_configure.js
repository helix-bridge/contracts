const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');

var ProxyDeployer = require("./proxy.js");

const privateKey = process.env.PRIKEY

const lineaNetwork = {
    url: "https://rpc.goerli.linea.build",
    chainId: 59140,
    defaultBridgeProxy: "0x04c7F678cD8F244461d7d6126839D57dFed7EF59",
    oppositeBridgeProxy: "0x12D4DA4619fB3d1CF2D416BF477684539F05342B",
    name: "lineaGoerli",
    usdc: "0xb5E028f980dF5533cB0e8F04530B76637383d993",
    usdt: "0xBC1A2f123Dc9CD2ec8d3cE42eF16c28F3C9bA686",
};

const arbitrumNetwork = {
    url: "https://goerli-rollup.arbitrum.io/rpc",
    chainId: 421613,
    defaultBridgeProxy: "0x04c7F678cD8F244461d7d6126839D57dFed7EF59",
    oppositeBridgeProxy: "0x12D4DA4619fB3d1CF2D416BF477684539F05342B",
    name: "arbitrumGoerli",
    usdc: "0x39dE82E1d9B8F62E11022FC3FC127a82F93fE47E",
    usdt: "0x6d828718c1097A4C573bc25c638Cc05bF10dFeAF",
};

const goerliNetwork = {
    url: "https://rpc.ankr.com/eth_goerli",
    chainId: 5,
    defaultBridgeProxy: "0x04c7F678cD8F244461d7d6126839D57dFed7EF59",
    oppositeBridgeProxy: "0x12D4DA4619fB3d1CF2D416BF477684539F05342B",
    name: "goerli",
    usdc: "0x1a70127284B774fF4A4dbfe0115114642f0eca65",
    usdt: "0x2303e4d55BF16a897Cb5Ab71c6225399509d9314",
};

const mantleNetwork = {
    url: "https://rpc.testnet.mantle.xyz",
    chainId: 5001,
    defaultBridgeProxy: "0x04c7F678cD8F244461d7d6126839D57dFed7EF59",
    oppositeBridgeProxy: "0x12D4DA4619fB3d1CF2D416BF477684539F05342B",
    name: "mantleGoerli",
    usdc: "0x0258Eb547bFEd540ed17843658C018569fe1E328",
    usdt: "0x5F8D4232367759bCe5d9488D3ade77FCFF6B9b6B",
}

const messagers = {
    goerli: {
        Eth2ArbSendService: "0x4828Bb749469Cd8a3d8357A6CF0970517538Da2e",
        Eth2LineaSendService: "0xf68574f974634e72CCD280991A7A7660F8008A28",
        layerzeroMessager: "0xf8ec3b0c834a07CC9381c4265CC8469716A1D0f3"
    },
    arbitrumGoerli: {
        Eth2ArbReceiveService: "0x1556514f6D56eD991E19A30C822d7fC51E22C571",
        layerzeroMessager: "0x52f77d33cc830d6E927e637EC93B25ac025d29C6"
    },
    lineaGoerli: {
        Eth2LineaReceiveService: "0x5dcdF43d3aa318CedE2b89f6f576b8Af096c83a0",
        layerzeroMessager: "0x761731CD0BFeBED233648369053FF999704D6229"
    },
    mantleGoerli: {
        layerzeroMessager: "0xBc42F098a8f4fF1cE56b4E49E61A1B0cB52cA300"
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
    // arb<>eth
    // arb->eth opposite bridge using l1->l2 messager
    console.log("start to connect arb->eth using l1->l2 messager");
    const arb2ethSource = await ethers.getContractAt("LnOppositeBridge", arbitrumNetwork.oppositeBridgeProxy, arbWallet);
    const arb2ethTarget = await ethers.getContractAt("LnOppositeBridge", goerliNetwork.oppositeBridgeProxy, goerliWallet);
    await arb2ethSource.setReceiveService(goerliNetwork.chainId, arb2ethTarget.address, messagers.arbitrumGoerli.Eth2ArbReceiveService);
    await arb2ethTarget.setSendService(arbitrumNetwork.chainId, arb2ethSource.address, messagers.goerli.Eth2ArbSendService);
    // eth->arb default bridge using l1->l2 messager
    console.log("start to connect eth->arb using l1->l2 messager");
    const eth2arbSource = await ethers.getContractAt("LnDefaultBridge", goerliNetwork.defaultBridgeProxy, goerliWallet);
    const eth2arbTarget = await ethers.getContractAt("LnDefaultBridge", arbitrumNetwork.defaultBridgeProxy, arbWallet);
    await eth2arbSource.setSendService(arbitrumNetwork.chainId, eth2arbTarget.address, messagers.goerli.Eth2ArbSendService);
    await eth2arbTarget.setReceiveService(goerliNetwork.chainId, eth2arbSource.address, messagers.arbitrumGoerli.Eth2ArbReceiveService);
    console.log("finish connect arb<>eth token bridge");
}


async function connectLineaAndEth(lineaWallet, goerliWallet) {
    // linea<>eth
    // linea->eth opposite bridge using l1->l2 messager
    console.log("start to connect linea->eth using l1->l2 messager");
    const linea2ethSource = await ethers.getContractAt("LnOppositeBridge", lineaNetwork.oppositeBridgeProxy, lineaWallet);
    const linea2ethTarget = await ethers.getContractAt("LnOppositeBridge", goerliNetwork.oppositeBridgeProxy, goerliWallet);
    await linea2ethSource.setReceiveService(goerliNetwork.chainId, linea2ethTarget.address, messagers.lineaGoerli.Eth2LineaReceiveService);
    await linea2ethTarget.setSendService(lineaNetwork.chainId, linea2ethSource.address, messagers.goerli.Eth2LineaSendService);
    // eth->linea default bridge using l1->l2 messager
    console.log("start to connect eth->linea using l1->l2 messager");
    const eth2lineaSource = await ethers.getContractAt("LnDefaultBridge", goerliNetwork.defaultBridgeProxy, goerliWallet);
    const eth2lineaTarget = await ethers.getContractAt("LnDefaultBridge", lineaNetwork.defaultBridgeProxy, lineaWallet);
    await eth2lineaSource.setSendService(lineaNetwork.chainId, eth2lineaTarget.address, messagers.goerli.Eth2LineaSendService);
    await eth2lineaTarget.setReceiveService(goerliNetwork.chainId, eth2lineaSource.address, messagers.lineaGoerli.Eth2LineaReceiveService);
    console.log("finish connect linea<>eth token bridge");
}

async function connectUsingLayerzero(leftWallet, rightWallet, leftNetwork, rightNetwork) {
    console.log("start to connect network by using layerzero");
    const left = await ethers.getContractAt("LnDefaultBridge", leftNetwork.defaultBridgeProxy, leftWallet);
    const right = await ethers.getContractAt("LnDefaultBridge", rightNetwork.defaultBridgeProxy, rightWallet);
    await left.setSendService(rightNetwork.chainId, right.address, messagers[leftNetwork.name].layerzeroMessager);
    await right.setReceiveService(leftNetwork.chainId, left.address, messagers[rightNetwork.name].layerzeroMessager);
    await left.setReceiveService(rightNetwork.chainId, right.address, messagers[leftNetwork.name].layerzeroMessager);
    await right.setSendService(leftNetwork.chainId, left.address, messagers[rightNetwork.name].layerzeroMessager);
}

async function connectAll(arbWallet, lineaWallet, goerliWallet, mantleWallet) {
    await connectArbAndEth(arbWallet, goerliWallet);
    await connectLineaAndEth(lineaWallet, goerliWallet);
    await connectUsingLayerzero(arbWallet, lineaWallet, arbitrumNetwork, lineaNetwork);
    await connectUsingLayerzero(arbWallet, mantleWallet, arbitrumNetwork, mantleNetwork);
    await connectUsingLayerzero(lineaWallet, mantleWallet, lineaNetwork, mantleNetwork);
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
        const margin = ethers.utils.parseUnits("100000", srcDecimals);
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
        const margin = ethers.utils.parseUnits("100000", dstDecimals);
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
    console.log("start to mint token", tokenAddress, amount);
    await token.mint(wallet.address, amount);
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
    //await connectAll(arbWallet, lineaWallet, goerliWallet, mantleWallet);
    //await registerAllToken(arbWallet, lineaWallet, goerliWallet, mantleWallet);
    //await mintAndApproveAll(arbWallet, lineaWallet, goerliWallet, mantleWallet);
    //await registerAllRelayer(arbWallet, lineaWallet, goerliWallet, mantleWallet);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
