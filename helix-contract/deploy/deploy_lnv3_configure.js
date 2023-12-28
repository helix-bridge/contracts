const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');
const fs = require("fs");

var ProxyDeployer = require("./proxy.js");

const privateKey = process.env.PRIKEY

const kNativeTokenAddress = "0x0000000000000000000000000000000000000000";
const relayer = "0xB2a0654C6b2D0975846968D5a3e729F5006c2894";

const goerliNetwork = {
    name: "goerli",
    url: "https://rpc.ankr.com/eth_goerli",
    chainId: 5,
    eth: "0x0000000000000000000000000000000000000000",
    mnt: "0xc1dC2d65A2243c22344E725677A3E3BEBD26E604",
};

const zkSyncGoerliNetwork = {
    name: "zksync-goerli",
    url: "https://zksync2-testnet.zksync.dev",
    chainId: 280,
    eth: "0x0000000000000000000000000000000000000000",
};

function wait(ms) {
    return new Promise(resolve => setTimeout(() => resolve(), ms));
};

function wallet(url) {
    const provider = new ethers.providers.JsonRpcProvider(url);
    const wallet = new ethers.Wallet(privateKey, provider);
    return wallet;
}

async function connectUsingLayerzero(configure, leftWallet, rightWallet, leftNetwork, rightNetwork) {
    const leftMessagerAddess = configure.messagers[leftNetwork.name].layerzeroMessager;
    const rightMessagerAddress = configure.messagers[rightNetwork.name].layerzeroMessager;
    const leftBridgeProxy = leftNetwork.chainId === 280 ? configure.LnV3BridgeProxy.zkSync : configure.LnV3BridgeProxy.others;
    const rightBridgeProxy = rightNetwork.chainId === 280 ? configure.LnV3BridgeProxy.zkSync : configure.LnV3BridgeProxy.others;
    const leftMessager = await ethers.getContractAt("LayerZeroMessager", leftMessagerAddess, leftWallet);
    const rightMessager = await ethers.getContractAt("LayerZeroMessager", rightMessagerAddress, rightWallet);
    console.log("start to connect network by using layerzero");
    const left = await ethers.getContractAt("HelixLnBridgeV3", leftBridgeProxy, leftWallet);
    const right = await ethers.getContractAt("HelixLnBridgeV3", rightBridgeProxy, rightWallet);

    await leftMessager.authoriseAppCaller(left.address, true);
    await rightMessager.authoriseAppCaller(right.address, true);
    await left.setSendService(rightNetwork.chainId, right.address, leftMessagerAddess);
    await right.setReceiveService(leftNetwork.chainId, left.address, rightMessagerAddress);
    await left.setReceiveService(rightNetwork.chainId, right.address, leftMessagerAddess);
    await right.setSendService(leftNetwork.chainId, left.address, rightMessagerAddress);
}

async function connectAll(configure, goerliWallet, zkSyncWallet) {
    await connectUsingLayerzero(configure, zkSyncWallet, goerliWallet, zkSyncGoerliNetwork, goerliNetwork);
}

async function registerToken(configure, srcWallet, dstWallet, srcNetwork, dstNetwork, srcToken, dstToken, tokenIndex) {
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
    const penaltyDecimals = srcDecimals;
    let penalty = ethers.utils.parseUnits("1000", penaltyDecimals);
    if (srcTokenAddress == kNativeTokenAddress || dstTokenAddress == kNativeTokenAddress) {
        fee = ethers.utils.parseUnits("0.001", srcDecimals);
        penalty = ethers.utils.parseUnits("0.01", penaltyDecimals);
    }

    const proxyAddress = srcNetwork.chainId === 280 ? configure.LnV3BridgeProxy.zkSync : configure.LnV3BridgeProxy.others;

    const source = await ethers.getContractAt("HelixLnBridgeV3", proxyAddress, srcWallet);
    await source.registerTokenInfo(
        dstNetwork.chainId,
        srcTokenAddress,
        dstTokenAddress,
        fee,
        penalty,
        srcDecimals,
        dstDecimals,
        tokenIndex);
    console.log(`finished register token bridge: ${srcNetwork.chainId}->${dstNetwork.chainId}, ${srcToken}->${dstToken}`);
}

async function registerAllToken(configure, goerliWallet, zkSyncWallet) {
    // zkSync<>eth
    let tokenIndex = 1;
    await registerToken(configure, zkSyncWallet, goerliWallet, zkSyncGoerliNetwork, goerliNetwork, "usdc", "usdc", tokenIndex++);
    await registerToken(configure, goerliWallet, zkSyncWallet, goerliNetwork, zkSyncGoerliNetwork, "usdc", "usdc", tokenIndex++);
    await registerToken(configure, zkSyncWallet, goerliWallet, zkSyncGoerliNetwork, goerliNetwork, "usdt", "usdt", tokenIndex++);
    await registerToken(configure, goerliWallet, zkSyncWallet, goerliNetwork, zkSyncGoerliNetwork, "usdt", "usdt", tokenIndex++);
    await registerToken(configure, zkSyncWallet, goerliWallet, zkSyncGoerliNetwork, goerliNetwork, "eth", "eth", tokenIndex++);
    await registerToken(configure, goerliWallet, zkSyncWallet, goerliNetwork, zkSyncGoerliNetwork, "eth", "eth", tokenIndex++);
}

async function registerRelayer(configure, srcWallet, dstWallet, srcNetwork, dstNetwork, srcToken, dstToken) {
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

    const proxyAddress = srcNetwork.chainId === 280 ? configure.LnV3BridgeProxy.zkSync : configure.LnV3BridgeProxy.others;
    // set source network
    let penalty = ethers.utils.parseUnits("100000", srcDecimals);
    let value = 0;
    if (dstTokenAddress == kNativeTokenAddress) {
        penalty = ethers.utils.parseUnits("0.1", dstDecimals);
        value = penalty;
    }
    const source = await ethers.getContractAt("HelixLnBridgeV3", proxyAddress, srcWallet);

    await source.registerLnProvider(
        dstNetwork.chainId,
        srcTokenAddress,
        dstTokenAddress,
        baseFee,
        liquidityFeeRate,
        ethers.utils.parseUnits("1000000", srcDecimals),
    );
    
    await source.depositPenaltyReserve(
        srcTokenAddress,
        penalty,
        { value: value},
    );
    console.log(`finished register relayer: ${srcNetwork.chainId}->${dstNetwork.chainId}, ${srcToken}->${dstToken}`);
}

async function registerAllRelayer(configure, goerliWallet, zkSyncWallet) {
    // eth<>zkSync
    await registerRelayer(configure, goerliWallet, zkSyncWallet, goerliNetwork, zkSyncGoerliNetwork, "usdc", "usdc");
    await registerRelayer(configure, zkSyncWallet, goerliWallet, zkSyncGoerliNetwork, goerliNetwork, "usdc", "usdc");
    await registerRelayer(configure, goerliWallet, zkSyncWallet, goerliNetwork, zkSyncGoerliNetwork, "usdt", "usdt");
    await registerRelayer(configure, zkSyncWallet, goerliWallet, zkSyncGoerliNetwork, goerliNetwork, "usdt", "usdt");
    await registerRelayer(configure, goerliWallet, zkSyncWallet, goerliNetwork, zkSyncGoerliNetwork, "eth", "eth");
    await registerRelayer(configure, zkSyncWallet, goerliWallet, zkSyncGoerliNetwork, goerliNetwork, "eth", "eth");
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

    const proxyAddress = network.chainId === 280 ? configure.LnV3BridgeProxy.zkSync : configure.LnV3BridgeProxy.others;

    await token.approve(proxyAddress, ethers.utils.parseUnits("10000000000000", decimals));
    await wait(5000);
    console.log("finished to approve", tokenSymbol);
}

async function approveAll(configure, goerliWallet, zkSyncWallet) {
    await approveToken(configure, "usdc", goerliNetwork, goerliWallet);
    await approveToken(configure, "usdt", goerliNetwork, goerliWallet);
    await approveToken(configure, "usdt", zkSyncGoerliNetwork, zkSyncWallet);
    await approveToken(configure, "usdc", zkSyncGoerliNetwork, zkSyncWallet);
}

// 2. deploy mapping token factory
async function main() {
    const pathConfig = "./address/ln-dev.json";
    const configure = JSON.parse(
        fs.readFileSync(pathConfig, "utf8")
    );

    const goerliWallet = wallet(goerliNetwork.url);
    const zkSyncWallet = wallet(zkSyncGoerliNetwork.url);

    // set messager service
    //await connectAll(configure, goerliWallet, zkSyncWallet);
    //await registerAllToken(configure, goerliWallet, zkSyncWallet);
    //await mintAll(configure, relayer, arbWallet, lineaWallet, goerliWallet, mantleWallet, zkSyncWallet, crabWallet, arbSepoliaWallet);
    //await approveAll(configure, goerliWallet, zkSyncWallet);
    await registerAllRelayer(configure, goerliWallet, zkSyncWallet);
    console.log("finished!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
