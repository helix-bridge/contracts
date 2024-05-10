var Configure = require("./configure/readconfig.js");
const privateKey = process.env.PRIKEY

const initTransferId = "0x0000000000000000000000000000000000000000000000000000000000000000";
const kNativeTokenAddress = "0x0000000000000000000000000000000000000000";

async function lockAndRemoteRelease(provider, network01, network02, symbol, amount) {
    const timestamp = Date.parse(new Date().toString())/1000;
    const srcToken = await tokenInfo(symbol, network01);
    const dstToken = await tokenInfo(symbol, network02);
    const transferAmount = ethers.utils.parseUnits(amount, srcToken.decimals);
    const bridge = await ethers.getContractAt("HelixLnBridgeV3", network01.proxy, network01.wallet);
    const expectedFee = await bridge.totalFee(
        network02.chainId,
        provider,
        srcToken.address,
        dstToken.address,
        transferAmount);
    console.log("expect fee is", expectedFee);

    const value = srcToken.address == kNativeTokenAddress ? transferAmount.add(expectedFee) : 0;
    const params = [
        network02.chainId,
        provider,
        srcToken.address,
        dstToken.address,
        expectedFee,
        transferAmount,
        network01.wallet.address,
        timestamp
    ];
    console.log(params, value);
    //const tx = await bridge.callStatic.lockAndRemoteRelease(
    const tx = await bridge.lockAndRemoteRelease(
        params,
        { value: value }
    );
    const transferId = await bridge.getTransferId(params, transferAmount);
    console.log(`tx is: ${tx.hash}, transferId: ${transferId}`);
}

async function relay(
    remoteChainId,
    toWallet,
    toBridgeAddress,
    provider,
    sourceToken,
    targetToken,
    sourceAmount,
    targetAmount,
    receiver,
    timestamp,
    expectedTransferId,
) {
    const toBridge = await ethers.getContractAt("HelixLnBridgeV3", toBridgeAddress, toWallet);
    //const tx = await toBridge.callStatic.relay(
    await toBridge.relay(
        [
            remoteChainId,
            provider,
            sourceToken,
            targetToken,
            sourceAmount,
            targetAmount,
            receiver,
            timestamp,
        ],
        expectedTransferId,
        true
    );
    //console.log(tx);
}

async function slash(
    wallet,
    bridgeAddress,
    remoteChainId,
    provider,
    sourceToken,
    targetToken,
    sourceAmount,
    targetAmount,
    receiver,
    timestamp,
    expectedTransferId,
) {
    const bridge = await ethers.getContractAt("LnBridgeTargetV3", bridgeAddress, wallet);
    const cost = ethers.utils.parseEther("0.0003");

    //const tx = await bridge.callStatic.requestSlashAndRemoteRelease(
    await bridge.requestSlashAndRemoteRelease(
        [
            remoteChainId,
            provider,
            sourceToken,
            targetToken,
            sourceAmount,
            targetAmount,
            receiver,
            timestamp
        ],
        expectedTransferId,
        cost,
        wallet.address,
        {value: cost },
    );
    //console.log(tx);
}

async function requestWithdrawLiquidity(
    wallet,
    provider,
    remoteChainId,
    bridgeAddress,
    transferIds,
    extParams,
) {
    const bridge = await ethers.getContractAt("LnBridgeTargetV3", bridgeAddress, wallet);
    const cost = ethers.utils.parseEther("0.0003");
    //const tx = await bridge.callStatic.requestWithdrawLiquidity(
    await bridge.requestWithdrawLiquidity(
        remoteChainId,
        transferIds,
        provider,
        extParams,
        {value: cost },
    );
    //console.log(tx);
}

function wallet(url) {
    const provider = new ethers.providers.JsonRpcProvider(url);
    const wallet = new ethers.Wallet(privateKey, provider);
    return wallet;
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

async function main() {
    const provider = '0xB2a0654C6b2D0975846968D5a3e729F5006c2894';
    const bridgeInfos = Configure.bridgev3Config('dev');

    const network01 = bridgeInfos['arbitrum-sepolia'];
    const network02 = bridgeInfos['taiko-hekla'];

    network01['wallet'] = wallet(network01.url);
    network02['wallet'] = wallet(network02.url);

    await lockAndRemoteRelease(provider, network02, network01, "usdt", "100");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
