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

async function connectUsingLayerzero(configure, pair) {
    const leftNetwork = pair.networks[0];
    const rightNetwork = pair.networks[1];
    const leftWallet = pair.wallets[0];
    const rightWallet = pair.wallets[1];
    const leftMessagerAddess = configure.messagers[leftNetwork.name].layerzeroMessager;
    const rightMessagerAddress = configure.messagers[rightNetwork.name].layerzeroMessager;
    const leftBridgeProxy = leftNetwork.chainId === 300 ? configure.LnV3BridgeProxy.zksync : configure.LnV3BridgeProxy.others;
    const rightBridgeProxy = rightNetwork.chainId === 300 ? configure.LnV3BridgeProxy.zksync : configure.LnV3BridgeProxy.others;
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

async function registerToken(configure, srcWallet, dstWallet, srcNetwork, dstNetwork, srcToken, dstToken, tokenIndex) {
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
    let fee = ethers.utils.parseUnits("0.01", srcDecimals);
    const penaltyDecimals = srcDecimals;
    let penalty = ethers.utils.parseUnits("1000", penaltyDecimals);
    if (srcTokenAddress == kNativeTokenAddress || dstTokenAddress == kNativeTokenAddress) {
        fee = ethers.utils.parseUnits("0.001", srcDecimals);
        penalty = ethers.utils.parseUnits("0.01", penaltyDecimals);
    }

    const proxyAddress = srcNetwork.chainId === 300 ? configure.LnV3BridgeProxy.zksync : configure.LnV3BridgeProxy.others;

    const source = await ethers.getContractAt("HelixLnBridgeV3", proxyAddress, srcWallet);

    if (tokenIndex > 0) {
      await source.registerTokenInfo(
          dstNetwork.chainId,
          srcTokenAddress,
          dstTokenAddress,
          fee,
          penalty,
          srcDecimals,
          dstDecimals,
          tokenIndex);
    } else {
      await source.updateTokenInfo(
          dstNetwork.chainId,
          srcTokenAddress,
          dstTokenAddress,
          fee,
          penalty,
          srcDecimals,
          dstDecimals);
    }
    console.log(`finished register token bridge: ${srcNetwork.chainId}->${dstNetwork.chainId}, ${srcToken}->${dstToken}`);
}

async function registerAllToken(configure, pair) {
    const leftNetwork = pair.networks[0];
    const rightNetwork = pair.networks[1];
    const leftWallet = pair.wallets[0];
    const rightWallet = pair.wallets[1];
    // zkSync<>eth
    let leftTokenIndex = 0;
    let rightTokenIndex = 0;
    //await registerToken(configure, leftWallet, rightWallet, leftNetwork, rightNetwork, "usdc", "usdc", leftTokenIndex++);
    //await registerToken(configure, rightWallet, leftWallet, rightNetwork, leftNetwork, "usdc", "usdc", rightTokenIndex++);
    await registerToken(configure, leftWallet, rightWallet, leftNetwork, rightNetwork, "usdt", "usdt", leftTokenIndex);
    await registerToken(configure, rightWallet, leftWallet, rightNetwork, leftNetwork, "usdt", "usdt", rightTokenIndex);
    await registerToken(configure, leftWallet, rightWallet, leftNetwork, rightNetwork, "eth", "eth", leftTokenIndex);
    await registerToken(configure, rightWallet, leftWallet, rightNetwork, leftNetwork, "eth", "eth", rightTokenIndex);
}

async function registerRelayer(configure, srcWallet, dstWallet, srcNetwork, dstNetwork, srcToken, dstToken) {
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

    const proxyAddress = srcNetwork.chainId === 300 ? configure.LnV3BridgeProxy.zksync : configure.LnV3BridgeProxy.others;
    // set source network
    let penalty = ethers.utils.parseUnits("100000", srcDecimals);
    let value = 0;
    if (dstTokenAddress == kNativeTokenAddress) {
        penalty = ethers.utils.parseUnits("0.01", dstDecimals);
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
        { gasLimit: 2000000 }
    );
    
    await source.depositPenaltyReserve(
        srcTokenAddress,
        penalty,
        {
          value: value,
          gasLimit: 2000000
        }
    );
    console.log(`finished register relayer: ${srcNetwork.chainId}->${dstNetwork.chainId}, ${srcToken}->${dstToken}`);
}

async function registerAllRelayer(configure, pair) {
    const leftNetwork = pair.networks[0];
    const rightNetwork = pair.networks[1];
    const leftWallet = pair.wallets[0];
    const rightWallet = pair.wallets[1];
    // eth<>zkSync
    await registerRelayer(configure, leftWallet, rightWallet, leftNetwork, rightNetwork, "usdc", "usdc");
    //await registerRelayer(configure, rightWallet, leftWallet, rightNetwork, leftNetwork, "usdc", "usdc");
    await registerRelayer(configure, leftWallet, rightWallet, leftNetwork, rightNetwork, "usdt", "usdt");
    //await registerRelayer(configure, rightWallet, leftWallet, rightNetwork, leftNetwork, "usdt", "usdt");
    await registerRelayer(configure, leftWallet, rightWallet, leftNetwork, rightNetwork, "eth", "eth");
    //await registerRelayer(configure, rightWallet, leftWallet, rightNetwork, leftNetwork, "eth", "eth");
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

    const proxyAddress = network.chainId === 300 ? configure.LnV3BridgeProxy.zksync : configure.LnV3BridgeProxy.others;

    await token.approve(proxyAddress, ethers.utils.parseUnits("10000000000000", decimals), {gasLimit: 1000000});
    await wait(5000);
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

    const network01 = configure.chains['zksync'];
    const network02 = configure.chains['sepolia'];

    const wallet01 = wallet(network01.url);
    const wallet02 = wallet(network02.url);

    const pair = {
        networks: [network01, network02],
        wallets: [wallet01, wallet02]
    };

    // connect
    //await connectUsingLayerzero(configure, pair);
    // register tokens
    await registerAllToken(configure, pair);
    // approve
    //await approveAll(configure, network01, wallet01);
    //await approveAll(configure, network02, wallet02);

    //await mintToken(configure, 'usdc', network01, wallet01, wallet01.address);
    //await registerAllRelayer(configure, pair);
    console.log("finished!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
