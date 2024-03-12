const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');
const fs = require("fs");

var ProxyDeployer = require("./proxy.js");

const privateKey = process.env.PRIKEY

const kNativeTokenAddress = "0x0000000000000000000000000000000000000000";

function wait(ms) {
    return new Promise(resolve => setTimeout(() => resolve(), ms));
};

function wallet(url) {
    const provider = new ethers.providers.JsonRpcProvider(url);
    const wallet = new ethers.Wallet(privateKey, provider);
    return wallet;
}

async function getContracts(network, messagerName, configure) {
    const messagers = configure.messagers[network.name];
    const messagerAddress = messagers[messagerName];
    const messager = await ethers.getContractAt(messagerName, messagerAddress, network.wallet);
    const bridgerAddress = configure.LnV3BridgeProxy[network.name] ?? configure.LnV3BridgeProxy.others;
    const bridger = await ethers.getContractAt("HelixLnBridgeV3", bridgerAddress, network.wallet);
    return {
        messager,
        bridger
    };
}

async function connect(network01, network02, messager, configure) {
    console.log(`start to connect network by using ${messager}`);
    const {messager: m1, bridger: b1} = await getContracts(network01, messager, configure);
    const {messager: m2, bridger: b2} = await getContracts(network02, messager, configure);

    if (messager === 'LayerZeroMessager') {
        await m1.authoriseAppCaller(b1.address, true);
        await m2.authoriseAppCaller(b2.address, true);
        await m1.setRemoteMessager(network02.chain.chainId, network02.chain.lzChainId, m2.address);
        await m2.setRemoteMessager(network01.chain.chainId, network01.chain.lzChainId, m1.address);
    }
    await b1.setSendService(network02.chain.chainId, b2.address, m1.address);
    await b2.setReceiveService(network01.chain.chainId, b1.address, m2.address);
    await b1.setReceiveService(network02.chain.chainId, b2.address, m1.address);
    await b2.setSendService(network01.chain.chainId, b1.address, m2.address);
    // check success
    const messager02 = await b1.messagers(network02.chain.chainId);
    const messager01 = await b2.messagers(network01.chain.chainId);
    console.log(messager01, messager02);
    console.log(m1.address, m2.address);
    console.log(`messager01 match: ${messager02.sendService == m1.address}, messager02 match: ${messager01.sendService == m2.address}`);
}

async function getTokenInfo(configure, network) {
    let decimals = 18;
    let tokenAddress = kNativeTokenAddress;
    if (network.symbol !== 'eth') {
        tokenAddress = configure[network.symbol][network.name];
        decimals = await (await ethers.getContractAt("Erc20", tokenAddress, network.wallet)).decimals();
    }
    return {
        tokenAddress,
        decimals
    };
}

// network01 <-> network02
async function registerToken(network01, network02, configure, tokenIndex, protocolFee, protocolPenalty) {
    let token01 = await getTokenInfo(configure, network01);
    let token02 = await getTokenInfo(configure, network02);

    let fee = ethers.utils.parseUnits(protocolFee, token01.decimals);
    let penalty = ethers.utils.parseUnits(protocolPenalty, token01.decimals);
    const bridgerAddress = configure.LnV3BridgeProxy[network01.name] ?? configure.LnV3BridgeProxy.others;
    const source = await ethers.getContractAt("HelixLnBridgeV3", bridgerAddress, network01.wallet);

    if (tokenIndex > 0) {
      await source.registerTokenInfo(
          network02.chain.chainId,
          token01.tokenAddress,
          token02.tokenAddress,
          fee,
          penalty,
          token01.decimals,
          token02.decimals,
          tokenIndex
      );
    } else {
      await source.updateTokenInfo(
          network02.chain.chainId,
          token01.tokenAddress,
          token02.tokenAddress,
          fee,
          penalty,
          token01.decimals,
          token02.decimals
      );
    }
    console.log(`finished register token bridge: ${network01.name}->${network02.name}, ${network01.symbol}->${network02.symbol}`);
}

async function registerRelayer(configure, srcNetwork, dstNetwork, baseFeeAmount, liquidityFeeRate, transferLimit) {
    const srcTokenInfo = await getTokenInfo(configure, srcNetwork);
    const dstTokenInfo = await getTokenInfo(configure, dstNetwork);

    let baseFee = ethers.utils.parseUnits(baseFeeAmount, srcTokenInfo.decimals);

    const bridgerAddress = configure.LnV3BridgeProxy[srcNetwork.name] ?? configure.LnV3BridgeProxy.others;
    const source = await ethers.getContractAt("HelixLnBridgeV3", bridgerAddress, srcNetwork.wallet);

    await source.registerLnProvider(
        dstNetwork.chain.chainId,
        srcTokenInfo.tokenAddress,
        dstTokenInfo.tokenAddress,
        baseFee,
        liquidityFeeRate,
        ethers.utils.parseUnits(transferLimit, srcTokenInfo.decimals),
        { gasLimit: 2000000 }
    );
    
    console.log(`finished register relayer: ${srcNetwork.name}->${dstNetwork.name}, ${srcNetwork.symbol}->${dstNetwork.symbol}`);
}

async function depositPenalty(configure, srcNetwork, dstNetwork, penalty) {
    const srcTokenInfo = await getTokenInfo(configure, srcNetwork);
    const dstTokenInfo = await getTokenInfo(configure, dstNetwork);

    const bridgerAddress = configure.LnV3BridgeProxy[srcNetwork.name] ?? configure.LnV3BridgeProxy.others;
    const source = await ethers.getContractAt("HelixLnBridgeV3", bridgerAddress, srcNetwork.wallet);

    // set source network
    let penaltyValue = ethers.utils.parseUnits(penalty, srcTokenInfo.decimals);
    let value = 0;
    if (srcTokenInfo.tokenAddress == kNativeTokenAddress) {
        value = penalty;
    }

    await source.depositPenaltyReserve(
        srcTokenInfo.tokenAddress,
        penaltyValue,
        {
          value: value,
          gasLimit: 2000000
        }
    );
    console.log(`finished register relayer: ${srcNetwork.name}->${dstNetwork.name}, ${srcNetwork.symbol}->${dstNetwork.symbol}`);
}

async function mintToken(configure, network, to, amount) {
    const tokenAddress = configure[network.symbol][network.name];
    const token = await ethers.getContractAt("Erc20", tokenAddress, network.wallet);
    const decimals = await token.decimals();
    const mintAmount = ethers.utils.parseUnits(amount, decimals);
    console.log("start to mint token", network.symbol, amount);
    await token.mint(to, mintAmount);
}

async function approveToken(configure, network, amount) {
    const tokenAddress = configure[network.symbol][network.name];
    const token = await ethers.getContractAt("Erc20", tokenAddress, network.wallet);
    const decimals = await token.decimals();

    const bridgerAddress = configure.LnV3BridgeProxy[network.name] ?? configure.LnV3BridgeProxy.others;
    await token.approve(bridgerAddress, ethers.utils.parseUnits(amount, decimals), {gasLimit: 1000000});
}

// 2. deploy mapping token factory
async function main() {
    const pathConfig = "./address/ln-dev.json";
    const configure = JSON.parse(
        fs.readFileSync(pathConfig, "utf8")
    );

    // base configure params start
    let network01 = {
        name: 'arbitrum-sepolia',
        symbol: 'usdc'
    };
    let network02 = {
        name: 'bera',
        symbol: 'usdc'
    };
    let messager = 'LayerZeroMessager';
    // base configure params end

    const chain01 = configure.chains[network01.name];
    const chain02 = configure.chains[network02.name];

    const wallet01 = wallet(chain01.url);
    const wallet02 = wallet(chain02.url);

    network01['chain'] = chain01;
    network02['chain'] = chain02;
    network01['wallet'] = wallet01;
    network02['wallet'] = wallet02;

    // network01<>network02
    //await connect(network01, network02, messager, configure);

    // tokenIndex should be query from chain
    // if tokenIndex == 0, then update
    //const tokenIndex = 9;
    //await registerToken(network01, network02, configure, tokenIndex, "0.01", "3");
    //await registerToken(network02, network01, configure, tokenIndex, "0.01", "3");

    // approve
    //await approveToken(configure, network02, "1000000000");

    // for testnet
    //await mintToken(configure, network02, "0xB2a0654C6b2D0975846968D5a3e729F5006c2894", "10000000");
    //await mintToken(configure, network01, '0xB2a0654C6b2D0975846968D5a3e729F5006c2894', "10000000");

    // network01 -> network02
    //await registerRelayer(configure, network01, network02, '10', 1, '1000000');
    //await depositPenalty(configure, network01, network02, '100000');
    //console.log("finished!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
