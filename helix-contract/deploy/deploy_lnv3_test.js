const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');
const fs = require("fs");

const privateKey = process.env.PRIKEY

const initTransferId = "0x0000000000000000000000000000000000000000000000000000000000000000";

const networks = {
    "goerli": {
        url: "https://rpc.ankr.com/eth_goerli",
        bridgeProxy: "0xd3cbC2D8469837134F4b2E8089c8e975399aff24",
        chainId: 5,
        usdc: "0xe9784E0d9A939dbe966b021DE3cd877284DB1B99",
        usdt: "0xa39cffE89567eBfb5c306a07dfb6e5B3ba41F358",
    },
    "zksync-goerli": {
        url: "https://zksync2-testnet.zksync.dev",
        bridgeProxy: "0x1162E5266121e0495674b9919b016AD9336eF3F5",
        chainId: 280,
        usdc: "0xAe60e005C560E869a2bad271e38e3C9D78381aFF",
        usdt: "0xb5372ed3bb2CbA63e7908066ac10ee94d30eA839",
    },
};

function wait(ms) {
    return new Promise(resolve => setTimeout(() => resolve(), ms));
};

async function lockAndRemoteRelease(
    wallet,
    provider,
    bridgeAddress, 
    remoteChainId,
    sourceToken,
    targetToken,
    amount,
    timestamp) {
    const bridge = await ethers.getContractAt("LnBridgeSourceV3", bridgeAddress, wallet);
    const expectedFee = await bridge.totalFee(
        remoteChainId,
        provider,
        sourceToken,
        targetToken,
        amount);
    console.log("expect fee is", expectedFee);
    const value = sourceToken == '0x0000000000000000000000000000000000000000' ? amount.add(expectedFee) : 0;
    const params = [
        remoteChainId,
        provider,
        sourceToken,
        targetToken,
        expectedFee,
        amount,
        wallet.address,
        timestamp
    ];
    //const tx = await bridge.callStatic.lockAndRemoteRelease(
    const tx = await bridge.lockAndRemoteRelease(
        params,
        { value: value }
    );
    console.log(tx);
    return await bridge.getTransferId(params, amount);
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

function wallet(network) {
    const provider = new ethers.providers.JsonRpcProvider(network.url);
    const wallet = new ethers.Wallet(privateKey, provider);
    return wallet;
}

// 2. deploy mapping token factory
async function main() {
    const provider = '0xB2a0654C6b2D0975846968D5a3e729F5006c2894';

    const pathConfig = "./address/ln-dev.json";
    const configure = JSON.parse(
        fs.readFileSync(pathConfig, "utf8")
    );

    const sourceNetwork = configure.chains['arbitrum-sepolia'];
    const targetNetwork = configure.chains['sepolia'];
    const sourceWallet = wallet(sourceNetwork);
    const targetWallet = wallet(targetNetwork);

    //const sourceToken = '0x0000000000000000000000000000000000000000';
    //const targetToken = '0x0000000000000000000000000000000000000000';
    const sourceToken = configure.usdt['arbitrum-sepolia'];
    const targetToken = configure.usdt['sepolia'];

    const timestamp = Date.parse(new Date().toString())/1000;
    const amount = ethers.utils.parseEther("111");

    const transferId = await lockAndRemoteRelease(
        sourceWallet,
        provider,
        configure.LnV3BridgeProxy.others,
        targetNetwork.chainId,
        sourceToken,
        targetToken,
        amount,
        timestamp
        );
    console.log(timestamp, transferId);
    return;

    await relay(
        sourceNetwork.chainId,
        targetWallet,
        configure.LnV3BridgeProxy.others,
        provider,
        sourceToken,
        targetToken,
        amount,
        amount,
        "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
        1704960830,
        "0x110db54735ca7a73984ec654686c7ea9d6fa572fcee138ca109dda58c75d2142" //expectedTransferId,
    );
    
    /*
    await requestWithdrawLiquidity(
        targetWallet,
        provider,
        sourceNetwork.chainId,
        configure.LnV3BridgeProxy.others,
        ["0x110db54735ca7a73984ec654686c7ea9d6fa572fcee138ca109dda58c75d2142", "0x82CA1BBCFCB03E55C7F7938EFC6DF9636C72E0F628CF94488E31ED328BDF6FE4"],
        "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    );
    */

    await slash(
        targetWallet,
        configure.LnV3BridgeProxy.others,
        sourceNetwork.chainId,
        provider,
        sourceToken,
        targetToken,
        amount,
        amount,
        "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
        "0x659fa7da", // timestamp
        "0x01e40aad095d9a381f3870f288e5977d8ccc5c0bc3ece780fde5cada26fcb8ca",
    );
 
    return;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
