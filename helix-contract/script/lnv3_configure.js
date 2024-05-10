var Configure = require("./configure/readconfig.js");
const privateKey = process.env.PRIKEY

const zeroAddress = "0x0000000000000000000000000000000000000000";
const kNativeTokenAddress = "0x0000000000000000000000000000000000000000";
const relayer = "0xB2a0654C6b2D0975846968D5a3e729F5006c2894";

function wallet(url) {
    const provider = new ethers.providers.JsonRpcProvider(url);
    const wallet = new ethers.Wallet(privateKey, provider);
    return wallet;
}

async function connectUsingLayerzero(network01, network02) {
    const messager01 = network01.messager.find((e) => e.name == 'LayerZeroMessager');
    const messager02 = network02.messager.find((e) => e.name == 'LayerZeroMessager');
    console.log("start to connect network by using layerzero");
    const bridge01Contract = await ethers.getContractAt("HelixLnBridgeV3", network01.proxy, network01.wallet);
    const bridge02Contract = await ethers.getContractAt("HelixLnBridgeV3", network02.proxy, network02.wallet);

    if (messager01.version == 'v1.0') {
        const messagerContract = await ethers.getContractAt('LnAccessController', messager01.address, network01.wallet);
        const hasConfigured = await messagerContract.callerWhiteList(network01.proxy);
        if (!hasConfigured) {
            console.log(`start to authorize app caller ${network01.name}`);
            await messagerContract.authoriseAppCaller(network01.proxy, true);
        } else {
            console.log(`no need to authorize app caller ${network01.name}`);
        }
    } else {
        const messagerContract = await ethers.getContractAt('LayerZeroMessager', messager01.address, network01.wallet);
        const isWhiteList = await messagerContract.whiteList(network01.proxy);
        if (!isWhiteList) {
            console.log(`start to authorize app caller ${network01.name}`);
            await messagerContract.setWhiteList(network01.proxy, true);
        } else {
            console.log(`no need to authorize app caller ${network01.name}`);
        }
    }
    if (messager02.version == 'v1.0') {
        const messagerContract = await ethers.getContractAt('LnAccessController', messager02.address, network02.wallet);
        const hasConfigured = await messagerContract.callerWhiteList(network02.proxy);
        if (!hasConfigured) {
            console.log(`start to authorize app caller ${network02.name}`);
            await messagerContract.authoriseAppCaller(network02.proxy, true);
        } else {
            console.log(`no need to authorize app caller ${network02.name}`);
        }
    } else {
        const messagerContract = await ethers.getContractAt('LayerZeroMessager', messager02.address, network02.wallet);
        const isWhiteList = await messagerContract.whiteList(network02.proxy);
        if (!isWhiteList) {
            console.log(`start to authorize app caller ${network02.name}`);
            await messagerContract.setWhiteList(network02.proxy, true);
        } else {
            console.log(`no need to authorize app caller ${network02.name}`);
        }
    }
    const messagerContract01 = await ethers.getContractAt('LayerZeroMessager', messager01.address, network01.wallet);
    const remoteMessager01 = await messagerContract01.remoteMessagers(network02.chainId);
    if (remoteMessager01.lzRemoteChainId !== network02.lzChainId || remoteMessager01.messager !== messager02.address) {
        await messagerContract01.setRemoteMessager(network02.chainId, network02.lzChainId, messager02.address);
    }
    const messagerContract02 = await ethers.getContractAt('LayerZeroMessager', messager02.address, network02.wallet);
    const remoteMessager02 = await messagerContract02.remoteMessagers(network01.chainId);
    if (remoteMessager02.lzRemoteChainId !== network01.lzChainId || remoteMessager02.messager !== messager01.address) {
        await messagerContract02.setRemoteMessager(network01.chainId, network01.lzChainId, messager01.address);
    }

    console.log(bridge01Contract.address, network02.chainId);
    const sendService01 = (await bridge01Contract.messagers(network02.chainId)).sendService;
    if (sendService01 === zeroAddress) {
        console.log(`${network01.name} set send service`);
        await bridge01Contract.setSendService(network02.chainId, network02.proxy, messager01.address);
    } else {
        console.log(`${network01.name} no need to set send service`);
    }
    const recvService01 = (await bridge01Contract.messagers(network02.chainId)).receiveService;
    if (recvService01 === zeroAddress) {
        console.log(`${network01.name} set recv service`);
        await bridge01Contract.setReceiveService(network02.chainId, network02.proxy, messager01.address);
    } else {
        console.log(`${network01.name} no need to set recv service`);
    }

    const sendService02 = (await bridge02Contract.messagers(network01.chainId)).sendService;
    if (sendService02 === zeroAddress) {
        console.log(`${network02.name} set send service`);
        await bridge02Contract.setSendService(network01.chainId, network01.proxy, messager02.address);
    } else {
        console.log(`${network02.name} no need to set send service`);
    }
    const recvService02 = (await bridge02Contract.messagers(network01.chainId)).receiveService;
    if (recvService02 === zeroAddress) {
        console.log(`${network02.name} set recv service`);
        await bridge02Contract.setReceiveService(network01.chainId, network01.proxy, messager02.address);
    } else {
        console.log(`${network02.name} no need to set recv service`);
    }
}

async function tokenInfo(symbol, network) {
    const address = symbol === 'eth' ? kNativeTokenAddress : network.tokens.find((e) => e.symbol == symbol)?.address;
    const decimals = address === kNativeTokenAddress ? 18 : (await (await ethers.getContractAt("Erc20", address, network.wallet)).decimals());
    return {
        symbol: symbol,
        address: address,
        decimals: decimals
    };
}

// eth address = 0x0
// others: configure in json file, maybe also 0x0
async function registerToken(network01, network02, symbol01, symbol02, protocolFee, basePenalty, tokenIndex) {
    const srcToken = await tokenInfo(symbol01, network01);
    const dstToken = await tokenInfo(symbol02, network02);

    let fee = ethers.utils.parseUnits(protocolFee, srcToken.decimals);
    let penalty = ethers.utils.parseUnits(basePenalty, srcToken.decimals);

    const source = await ethers.getContractAt("HelixLnBridgeV3", network01.proxy, network01.wallet);

    if (tokenIndex > 0) {
      for (let nextIndex = tokenIndex; nextIndex < tokenIndex + 16; nextIndex++) {
          const existKey = await source.tokenIndexer(nextIndex);
          if (existKey === '0x0000000000000000000000000000000000000000000000000000000000000000') {
              tokenIndex = nextIndex;
              break;
          }
      }
      console.log("register index is", tokenIndex);
      await source.registerTokenInfo(
          network02.chainId,
          srcToken.address,
          dstToken.address,
          fee,
          penalty,
          srcToken.decimals,
          dstToken.decimals,
          tokenIndex);
    } else {
      await source.updateTokenInfo(
          network02.chainId,
          srcToken.address,
          dstToken.address,
          fee,
          penalty,
          srcToken.decimals,
          dstToken.decimals);
    }
    console.log(`finished register token bridge: ${network01.chainId}->${network02.chainId}, ${srcToken.symbol}->${dstToken.symbol}`);
}

async function registerRelayer(network01, network02, symbol01, symbol02, baseFee, liquidityFeeRate, transferLimit) {
    const srcToken = await tokenInfo(symbol01, network01);
    const dstToken = await tokenInfo(symbol02, network02);

    let baseFeeWithDecimals = ethers.utils.parseUnits(baseFee, srcToken.decimals);

    const source = await ethers.getContractAt("HelixLnBridgeV3", network01.proxy, network01.wallet);
    await source.registerLnProvider(
        network02.chainId,
        srcToken.address,
        dstToken.address,
        baseFeeWithDecimals,
        liquidityFeeRate,
        ethers.utils.parseUnits(transferLimit, srcToken.decimals),
        { gasLimit: 2000000 }
    );

    console.log(`finished register relayer: ${network01.chainId}->${network02.chainId}, ${symbol01}->${symbol02}`);
}

async function depositPenalty(network01, network02, symbol01, symbol02, penalty) {
    const srcToken = await tokenInfo(symbol01, network01);
    const dstToken = await tokenInfo(symbol02, network02);

    // set source network
    let penaltyWithDecimals = ethers.utils.parseUnits(penalty, srcToken.decimals);
    let value = 0;
    if (srcToken.address == kNativeTokenAddress) {
        value = penaltyWithDecimals;
    }

    const source = await ethers.getContractAt("HelixLnBridgeV3", network01.proxy, network01.wallet);
    await source.depositPenaltyReserve(
        srcToken.address,
        penaltyWithDecimals,
        {
          value: value,
          gasLimit: 2000000
        }
    );
}

async function mintToken(network, symbol, amount, to) {
    const token = await tokenInfo(symbol, network);
    const tokenContract = await ethers.getContractAt("Erc20", token.address, network.wallet);
    await tokenContract.mint(to, ethers.utils.parseUnits(amount, token.decimals), {gasPrice: 100000000});
}

async function approveToken(network, symbol, amount) {
    const token = await tokenInfo(symbol, network);
    const tokenContract = await ethers.getContractAt("Erc20", token.address, network.wallet);
    await tokenContract.approve(network.proxy, ethers.utils.parseUnits(amount, token.decimals), {gasLimit: 1000000});
    console.log("finished to approve", symbol);
}

// 2. deploy mapping token factory
async function main() {
    const bridgeInfos = Configure.bridgev3Config('dev');

    const network01 = bridgeInfos['arbitrum-sepolia'];
    const network02 = bridgeInfos['taiko-hekla'];

    network01['wallet'] = wallet(network01.url);
    network02['wallet'] = wallet(network02.url);

    // connect
    //await connectUsingLayerzero(network01, network02);
    
    // register tokens
    //await registerToken(network02, network01, "usdc", "usdc", "0.001", "0.1", 1);

    // approve
    //await approveToken(network02, "usdt", "100000000000000");
    //await approveToken(network02, "usdc", "100000000000000");

    // mint
    //await mintToken(network02, "usdt", "10000000", "0x5861e3c9148D5DeB59b854805d8eCf3D5443fbEF");
    //await mintToken(network02, "usdc", "10000000", "0x5861e3c9148D5DeB59b854805d8eCf3D5443fbEF");

    // register relayer
    //await registerRelayer(network02, network01, "usdt", "usdt", "0.1", 1, "100000");
    //await registerRelayer(network02, network01, "usdc", "usdc", "0.1", 1, "100000");

    // deposit penalty
    await depositPenalty(network02, network01, "usdt", "usdt", "10000");
    await depositPenalty(network02, network01, "usdc", "usdc", "10000");
    console.log("finished!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
