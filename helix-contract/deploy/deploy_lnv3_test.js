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
    nonce) {
    const bridge = await ethers.getContractAt("LnBridgeSourceV3", bridgeAddress, wallet);
    const expectedFee = await bridge.totalFee(
        remoteChainId,
        provider,
        sourceToken,
        targetToken,
        amount);
    console.log("expect fee is", expectedFee);
    const value = sourceToken == '0x0000000000000000000000000000000000000000' ? amount.add(expectedFee) : 0;
    //const tx = await bridge.callStatic.lockAndRemoteRelease(
    const tx = await bridge.lockAndRemoteRelease(
        [
            remoteChainId,
            provider,
            sourceToken,
            targetToken,
            expectedFee,
            amount,
            wallet.address,
            nonce
        ],
        { value: value }
    );
    console.log(tx);
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
    nonce,
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
            nonce,
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
    nonce,
    expectedTransferId,
    expectedIdWithTimestamp,
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
            nonce
        ],
        timestamp,
        expectedTransferId,
        expectedIdWithTimestamp,
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
    const goerliNetwork = networks['goerli'];
    const zkSyncNetwork = networks['zksync-goerli'];
    const goerliWallet = wallet(goerliNetwork);
    const zksyncWallet = wallet(zkSyncNetwork);
    const provider = '0xB2a0654C6b2D0975846968D5a3e729F5006c2894';

    const pathConfig = "./address/ln-dev.json";
    const configure = JSON.parse(
        fs.readFileSync(pathConfig, "utf8")
    );

    //const sourceToken = configure.usdc['goerli'];
    //const targetToken = configure.usdc['zksync-goerli'];
    //const sourceToken = '0x0000000000000000000000000000000000000000';
    //const targetToken = '0x0000000000000000000000000000000000000000';
    const sourceToken = configure.usdt['goerli'];
    const targetToken = configure.usdt['zksync-goerli'];

    await lockAndRemoteRelease(
        goerliWallet,
        provider,
        configure.LnV3BridgeProxy.others,
        zkSyncNetwork.chainId,
        sourceToken,
        targetToken,
        1050000,
        //ethers.utils.parseEther("0.01"),
        7);
    
    /*
    await relay(
        goerliNetwork.chainId,
        zksyncWallet,
        configure.LnV3BridgeProxy.zkSync,
        provider,
        configure.usdc['goerli'],
        configure.usdc['zksync-goerli'],
        100000000,
        ethers.utils.parseEther("100"),
        "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
        2,
        "0xec2bd3228192aff141404ad1dddb3476c9b999e18b55fd4d8c685552780f0595" //expectedTransferId,
    );
    */
    
    /*
    await requestWithdrawLiquidity(
        zksyncWallet,
        provider,
        goerliNetwork.chainId,
        configure.LnV3BridgeProxy.zkSync,
        ["0x7cf958c470daafd85b6cce5e57cb4253e6e8f6380125052c37ac896ea58d1a59", "0xec2bd3228192aff141404ad1dddb3476c9b999e18b55fd4d8c685552780f0595"],
        "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    );
    */

    /*
    await slash(
        zksyncWallet,
        configure.LnV3BridgeProxy.zkSync,
        goerliNetwork.chainId,
        provider,
        configure.usdc['goerli'],
        configure.usdc['zksync-goerli'],
        200000000,
        ethers.utils.parseEther("200"),
        "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
        "0x658d2248",
        3,
        "0x61d342e0db087243d311b3e107680fdbb98ed951093cfff34b7087d9422e0e26",
        "0x9f70fef04636178fd7a1d871525d28a91543b985cfae52f02d831cdfdad6f0a0",
    );
    */
 
    return;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
