const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');
const fs = require("fs");

var ProxyDeployer = require("./proxy.js");

const privateKey = process.env.PRIKEY

const kNativeTokenAddress = "0x0000000000000000000000000000000000000000";
const relayer = "0xB2a0654C6b2D0975846968D5a3e729F5006c2894";

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

async function connectUsingLayerzero(configure, pair) {
    const leftNetwork = pair.networks[0];
    const rightNetwork = pair.networks[1];
    const leftWallet = pair.wallets[0];
    const rightWallet = pair.wallets[1];

    const leftGasLimit = leftNetwork.name == 'sepolia' ? 2000000 : null;
    const rightGasLimit = rightNetwork.name == 'sepolia' ? 2000000 : null;

    const leftMessagerAddess = configure.messagers[leftNetwork.name].layerzeroMessager;
    const rightMessagerAddress = configure.messagers[rightNetwork.name].layerzeroMessager;
    const leftBridgeProxy = leftNetwork.chainId === 300 ? configure.LnDefaultBridgeProxy.zksync : configure.LnDefaultBridgeProxy.others;
    const rightBridgeProxy = rightNetwork.chainId === 300 ? configure.LnDefaultBridgeProxy.zksync : configure.LnDefaultBridgeProxy.others;
    const leftMessager = await ethers.getContractAt("LayerZeroMessager", leftMessagerAddess, leftWallet);
    const rightMessager = await ethers.getContractAt("LayerZeroMessager", rightMessagerAddress, rightWallet);
    console.log("start to connect network by using layerzero");
    const left = await ethers.getContractAt("LnDefaultBridge", leftBridgeProxy, leftWallet);
    const right = await ethers.getContractAt("LnDefaultBridge", rightBridgeProxy, rightWallet);

    await leftMessager.authoriseAppCaller(left.address, true, {gasLimit: leftGasLimit});
    await rightMessager.authoriseAppCaller(right.address, true, {gasLimit: rightGasLimit});
    await left.setSendService(rightNetwork.chainId, right.address, leftMessagerAddess, {gasLimit: leftGasLimit});
    await right.setReceiveService(leftNetwork.chainId, left.address, rightMessagerAddress, {gasLimit: rightGasLimit});
    await left.setReceiveService(rightNetwork.chainId, right.address, leftMessagerAddess, {gasLimit: leftGasLimit});
    await right.setSendService(leftNetwork.chainId, left.address, rightMessagerAddress, {gasLimit: rightGasLimit});
}

async function connectUsingAxelar(configure, leftWallet, rightWallet, leftNetwork, rightNetwork) {
    const leftMessagerAddress = configure.messagers[leftNetwork.name].axelarMessager;
    const rightMessagerAddress = configure.messagers[rightNetwork.name].axelarMessager;
    const leftBridgeProxy = leftNetwork.chainId === 300 ? configure.LnDefaultBridgeProxy.zksync : configure.LnDefaultBridgeProxy.others;
    const rightBridgeProxy = rightNetwork.chainId === 300 ? configure.LnDefaultBridgeProxy.zksync : configure.LnDefaultBridgeProxy.others;

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

async function connectUsingDarwiniaMsgport(configure, leftWallet, rightWallet, leftNetwork, rightNetwork) {
    const leftMessagerAddress = configure.messagers[leftNetwork.name].darwiniaMsglineMessager;
    const rightMessagerAddress = configure.messagers[rightNetwork.name].darwiniaMsglineMessager;
    const leftBridgeProxy = leftNetwork.chainId === 300 ? configure.LnDefaultBridgeProxy.zksync : configure.LnDefaultBridgeProxy.others;
    const rightBridgeProxy = rightNetwork.chainId === 300 ? configure.LnDefaultBridgeProxy.zksync : configure.LnDefaultBridgeProxy.others;

    const leftMessager = await ethers.getContractAt("DarwiniaMsglineMessager", leftMessagerAddress, leftWallet);
    const rightMessager = await ethers.getContractAt("DarwiniaMsglineMessager", rightMessagerAddress, rightWallet);
    console.log("start to connect network by using darwinia message port");
    const left = await ethers.getContractAt("LnDefaultBridge", leftBridgeProxy, leftWallet);
    const right = await ethers.getContractAt("LnDefaultBridge", rightBridgeProxy, rightWallet);
    await leftMessager.authoriseAppCaller(left.address, true);
    await rightMessager.authoriseAppCaller(right.address, true);
    await left.setSendService(rightNetwork.chainId, right.address, leftMessagerAddress);
    await right.setReceiveService(leftNetwork.chainId, left.address, rightMessagerAddress);
    await left.setReceiveService(rightNetwork.chainId, right.address, leftMessagerAddress);
    await right.setSendService(leftNetwork.chainId, left.address, rightMessagerAddress);
}

async function registerToken(configure, contractName, srcWallet, dstWallet, srcNetwork, dstNetwork, srcToken, dstToken) {
    let srcDecimals = 18;
    let dstDecimals = 18;
    let srcTokenAddress = kNativeTokenAddress;
    let dstTokenAddress = kNativeTokenAddress;
    if (srcToken !== 'eth') {
        srcTokenAddress = configure[srcToken][srcNetwork.name];
    }
    if (dstToken !== 'eth') {
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

    const defaultAddress = srcNetwork.chainId === 300 ? configure.LnDefaultBridgeProxy.zksync : configure.LnDefaultBridgeProxy.others;
    const proxyAddress = contractName == "LnOppositeBridge" ? configure.LnOppositeBridgeProxy : defaultAddress;

    const source = await ethers.getContractAt(contractName, proxyAddress, srcWallet);
    await source.setTokenInfo(
        dstNetwork.chainId,
        srcTokenAddress,
        dstTokenAddress,
        fee,
        penalty,
        srcDecimals,
        dstDecimals,
        { gasLimit: 2000000 }
    );
    console.log(`finished register token bridge: ${contractName}, ${srcNetwork.chainId}->${dstNetwork.chainId}, ${srcToken}->${dstToken}`);
}

async function registerAllToken(configure, pair, bridgeType) {
    const leftNetwork = pair.networks[0];
    const rightNetwork = pair.networks[1];
    const leftWallet = pair.wallets[0];
    const rightWallet = pair.wallets[1];
    //arb<>eth
    await registerToken(configure, bridgeType, leftWallet, rightWallet, leftNetwork, rightNetwork, "usdc", "usdc");
    await registerToken(configure, bridgeType, leftWallet, rightWallet, leftNetwork, rightNetwork, "usdt", "usdt");
    await registerToken(configure, bridgeType, leftWallet, rightWallet, leftNetwork, rightNetwork, "eth", "eth");
    await registerToken(configure, bridgeType, rightWallet, leftWallet, rightNetwork, leftNetwork, "usdc", "usdc");
    await registerToken(configure, bridgeType, rightWallet, leftWallet, rightNetwork, leftNetwork, "usdt", "usdt");
    await registerToken(configure, bridgeType, rightWallet, leftWallet, rightNetwork, leftNetwork, "eth", "eth");
}

async function registerRelayer(configure, contractName, srcWallet, dstWallet, srcNetwork, dstNetwork, srcToken, dstToken, increaseMargin) {
    let srcTokenAddress = kNativeTokenAddress;
    let dstTokenAddress = kNativeTokenAddress;
    let srcDecimals = 18;
    let dstDecimals = 18;
    if (srcToken !== 'eth') {
        srcTokenAddress = configure[srcToken][srcNetwork.name];
    }
    if (dstToken !== 'eth') {
        dstTokenAddress = configure[dstToken][dstNetwork.name];
    }

    const srcGasLimit = srcNetwork.name == 'sepolia' ? 2000000 : null;
    const dstGasLimit = dstNetwork.name == 'sepolia' ? 2000000 : null;

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
        const sourceAddress = srcNetwork.chainId === 300 ? configure.LnDefaultBridgeProxy.zksync : configure.LnDefaultBridgeProxy.others;
        const targetAddress = dstNetwork.chainId === 300 ? configure.LnDefaultBridgeProxy.zksync : configure.LnDefaultBridgeProxy.others;
        // set source network
        let margin = ethers.utils.parseUnits("1000000", dstDecimals);
        let value = 0;
        if (dstTokenAddress == kNativeTokenAddress) {
            margin = ethers.utils.parseUnits("0.01", dstDecimals);
            value = margin;
        }
        if (!increaseMargin) {
            margin = 0;
            value = 0;
        }
        const source = await ethers.getContractAt(contractName, sourceAddress, srcWallet);
        await source.setProviderFee(
            dstNetwork.chainId,
            srcTokenAddress,
            dstTokenAddress,
            baseFee,
            liquidityFeeRate,
            { gasLimit: srcGasLimit }
        );
        // set target network
        const target = await ethers.getContractAt(contractName, targetAddress, dstWallet);
        await target.depositProviderMargin(
            srcNetwork.chainId,
            srcTokenAddress,
            dstTokenAddress,
            margin,
            {
                value: value,
                gasLimit: dstGasLimit
            },
        );
    } else {
        let margin = ethers.utils.parseUnits("1000000", srcDecimals);
        let value = 0;
        if (srcTokenAddress == kNativeTokenAddress) {
            margin = ethers.utils.parseUnits("0.01", dstDecimals);
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
            {
                value: value,
                gasLimit: srcGasLimit
            }
        );
    }
    console.log(`finished register relayer: ${contractName}, ${srcNetwork.chainId}->${dstNetwork.chainId}, ${srcToken}->${dstToken}`);
}

async function registerAllRelayer(configure, pair, bridgeType) {
    const leftNetwork = pair.networks[0];
    const rightNetwork = pair.networks[1];
    const leftWallet = pair.wallets[0];
    const rightWallet = pair.wallets[1];
    const increaseMargin = true;

    await registerRelayer(configure, bridgeType, leftWallet, rightWallet, leftNetwork, rightNetwork, "usdc", "usdc", increaseMargin);
    await registerRelayer(configure, bridgeType, rightWallet, leftWallet, rightNetwork, leftNetwork, "usdc", "usdc", increaseMargin);
    await registerRelayer(configure, bridgeType, leftWallet, rightWallet, leftNetwork, rightNetwork, "usdt", "usdt", increaseMargin);
    await registerRelayer(configure, bridgeType, rightWallet, leftWallet, rightNetwork, leftNetwork, "usdt", "usdt", increaseMargin);
    await registerRelayer(configure, bridgeType, leftWallet, rightWallet, leftNetwork, rightNetwork, "eth", "eth", increaseMargin);
    await registerRelayer(configure, bridgeType, rightWallet, leftWallet, rightNetwork, leftNetwork, "eth", "eth", increaseMargin);
}

async function approveToken(configure, tokenSymbol, network, wallet) {
    const tokenAddress = configure[tokenSymbol][network.name];
    const token = await ethers.getContractAt("Erc20", tokenAddress, wallet);
    const decimals = await token.decimals();
    console.log("start to approve", tokenSymbol);

    const defaultAddress = network.chainId === 300 ? configure.LnDefaultBridgeProxy.zksync : configure.LnDefaultBridgeProxy.others;

    await token.approve(defaultAddress, ethers.utils.parseUnits("10000000000000", decimals));
    await wait(5000);
    if (network.chainId !== 300) {
        await token.approve(configure.LnOppositeBridgeProxy, ethers.utils.parseUnits("10000000000000", decimals));
        await wait(5000);
    }
    console.log("finished to approve", tokenSymbol);
}

async function approveAll(configure, network, wallet) {
    await approveToken(configure, "usdc", network, wallet);
    await approveToken(configure, "usdt", network, wallet);
}

// 2. deploy mapping token factory
async function main() {
    const pathConfig = "./address/ln-dev.json";
    const configure = JSON.parse(
        fs.readFileSync(pathConfig, "utf8")
    );

    const network01 = configure.chains['arbitrum-sepolia'];
    const network02 = configure.chains['zksync'];

    const wallet01 = wallet(network01.url);
    const wallet02 = wallet(network02.url);

    const pair = {
        networks: [network01, network02],
        wallets: [wallet01, wallet02]
    }; 

    // connect
    //await connectUsingLayerzero(configure, pair);
    // register tokens
    //await registerAllToken(configure, pair, "LnDefaultBridge");
    //await registerAllToken(configure, pair, "LnOppositeBridge");
    
    // approve
    //await approveAll(configure, network01, wallet01);
    //await approveAll(configure, network02, wallet02);

    //await registerAllRelayer(configure, pair, "LnDefaultBridge");
    //await registerAllRelayer(configure, pair, "LnOppositeBridge");
    console.log("finished!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
