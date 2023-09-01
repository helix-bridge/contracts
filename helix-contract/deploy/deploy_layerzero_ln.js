const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');

var ProxyDeployer = require("./proxy.js");

const privateKey = process.env.PRIKEY

const lineaNetwork = {
    url: "https://rpc.goerli.linea.build",
    proxyAdmin: "0x9bc1C7567DDBcaF2212185b6665D755d842d01E4",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    endpoint: "0x6aB5Ae6822647046626e83ee6dB8187151E1d5ab",
    usdc: "0xB4257F31750961C8e536f5cfCBb3079437700416",
    chainId: 10157,
};

const zkSyncNetwork = {
    url: "https://zksync2-testnet.zksync.dev",
    proxyAdmin: "0x96892F3EaD26515592Da38432cFABad991BBd69d",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    endpoint: "0x093D2CF57f764f09C3c2Ac58a42A2601B8C79281",
    usdc: "0x0faF6df7054946141266420b43783387A78d82A9",
    chainId: 10165,
};

const arbitrumNetwork = {
    url: "https://goerli-rollup.arbitrum.io/rpc",
    proxyAdmin: "0x66d86a686e50c98bac236105efafb99ee7605dc5",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    endpoint: "0x6aB5Ae6822647046626e83ee6dB8187151E1d5ab",
    usdc: "0xEA70a40Df1432A1b38b916A51Fb81A4cc805a963",
    chainId: 10143,
};

const initTransferId = "0x0000000000000000000000000000000000000000000000000000000000000000";

async function getLnBridgeTargetInitData(wallet, dao, endpoint, chainId) {
    const bridgeContract = await ethers.getContractFactory("LnBridgeBaseLZ", wallet);
    const initdata = await ProxyDeployer.getInitializerData(
        bridgeContract.interface,
        [dao, endpoint, chainId],
        "initialize",
    );
    console.log("LnBridgeInitData init data:", initdata);
}

async function transferAndLockMargin(
    wallet,
    bridgeAddress, 
    provider,
    sourceTokenAddress,
    targetTokenAddress,
    amount,
    receiver,
    withdrawNonce,
) {
    const bridge = await ethers.getContractAt("LnDefaultBridgeSource", bridgeAddress, wallet);
    const expectedFee = await bridge.totalFee(
        provider,
        sourceTokenAddress,
        amount);
    console.log("expect fee is", expectedFee);
    const providerInfo = await bridge.lnProviders(await bridge.getDefaultProviderKey(provider, sourceTokenAddress, targetTokenAddress));
    //const tx = await bridge.callStatic.transferAndLockMargin(
    const tx = await bridge.transferAndLockMargin(
        [
            provider,
            sourceTokenAddress,
            providerInfo.lastTransferId,
            expectedFee,
            withdrawNonce,
        ],
        amount,
        wallet.address,
    );
    console.log(tx);
}

async function relay(
    wallet,
    bridgeAddress,
    provider,
    sourceToken,
    targetToken,
    previousTransferId,
    timestamp,
    receiver,
    amount,
    expectedTransferId,
) {
    const bridge = await ethers.getContractAt("LnDefaultBridgeTarget", bridgeAddress, wallet);
    //const tx = await bridge.callStatic.transferAndReleaseMargin(
    await bridge.transferAndReleaseMargin(
        [
            previousTransferId,
            provider,
            sourceToken,
            targetToken,
            amount,
            timestamp,
            receiver,
        ],
        expectedTransferId,
    );
    //console.log(tx);
}

async function slash(
    wallet,
    bridgeAddress,
    provider,
    sourceToken,
    targetToken,
    previousTransferId,
    timestamp,
    receiver,
    amount,
    expectedTransferId,
) {
    const bridge = await ethers.getContractAt("LnBridgeBaseLZ", bridgeAddress, wallet);
    const cost = await bridge.estimateSlashFee(
        [
            previousTransferId,
            provider,
            sourceToken,
            targetToken,
            amount,
            timestamp,
            receiver,
        ]
    );
    //return;

    //const tx = await bridge.callStatic.slashAndRemoteRefund(
    await bridge.slashAndRemoteRelease(
        [
            previousTransferId,
            provider,
            sourceToken,
            targetToken,
            amount,
            timestamp,
            receiver,
        ],
        expectedTransferId,
        {value: cost },
    );
    //console.log(tx);
}

async function requestWithdrawMargin(
    wallet,
    bridgeAddress,
    sourceToken,
    amount,
) {
    const bridge = await ethers.getContractAt("LnBridgeBaseLZ", bridgeAddress, wallet);
    const cost = await bridge.estimateWithdrawFee(
        "0x851E1255171825594B313D8AE96F277C0DBAAB5246B9BC661BA98538F675425C",
        1,
        "0x1000000000000000000000000000000000000001",
        "0x1000000000000000000000000000000000000001",
        "0x1000000000000000000000000000000000000001",
        100
    );
    console.log(cost);

    //const tx = await bridge.callStatic.requestWithdrawMargin(
    await bridge.requestWithdrawMargin(
        sourceToken,
        amount,
        {value: cost.nativeFee },
    );
    //console.log(tx);
}

function wallet(sourceUrl, targetUrl) {
    const sourceProvider = new ethers.providers.JsonRpcProvider(sourceUrl);
    const sourceWallet = new ethers.Wallet(privateKey, sourceProvider);
    const targetProvider = new ethers.providers.JsonRpcProvider(targetUrl);
    const targetWallet = new ethers.Wallet(privateKey, targetProvider);
    return [sourceWallet, targetWallet];
}

async function deployLnBridge(wallet, dao, proxyAdminAddress, endpoint, chainId) {
    const bridgeContract = await ethers.getContractFactory("LnBridgeBaseLZ", wallet);
    const lnBridgeLogic = await bridgeContract.deploy();
    await lnBridgeLogic.deployed();
    console.log("finish to deploy ln bridge logic, address: ", lnBridgeLogic.address);

    const lnBridgeProxy = await ProxyDeployer.deployProxyContract(
        proxyAdminAddress,
        bridgeContract,
        lnBridgeLogic.address,
        [dao, endpoint, chainId],
        wallet);
    console.log("finish to deploy ln bridge proxy, address:", lnBridgeProxy.address);
    return lnBridgeProxy.address;
}

async function deploy(wallet01, wallet02, network01, network02) {
    const bridgeAddress01 = await deployLnBridge(
        wallet01,
        network01.dao,
        network01.proxyAdmin,
        network01.endpoint,
        network02.chainId
    );
    const bridgeAddress02 = await deployLnBridge(
        wallet02,
        network02.dao,
        network02.proxyAdmin,
        network02.endpoint,
        network01.chainId
    );

    const bridge01 = await ethers.getContractAt("LnBridgeBaseLZ", bridgeAddress01, wallet01);
    const bridge02 = await ethers.getContractAt("LnBridgeBaseLZ", bridgeAddress02, wallet02);
    await bridge01.updateFeeReceiver(network01.dao);
    await bridge02.updateFeeReceiver(network02.dao);
    await bridge01.setRemoteBridge(bridgeAddress02);
    await bridge02.setRemoteBridge(bridgeAddress01);

    // register special erc20 token
    // native token weth
    // we need replace this wusdc address by exist one
    const usdc01 = await ethers.getContractAt("Erc20", network01.usdc, wallet01);
    const usdc02 = await ethers.getContractAt("Erc20", network02.usdc, wallet02);

    // register token
    await bridge01.setTokenInfo(
        usdc01.address,
        usdc02.address,
        // helix fee
        1500000,
        // penaltyLnCollateral
        2000000,
        6, // local decimals
        6, // remote decimals
    );
    await bridge02.setTokenInfo(
        usdc02.address,
        usdc01.address,
        // helix fee
        1500000,
        // penaltyLnCollateral
        2000000,
        6, // local decimals
        6, // remote decimals
    );

    // register provider
    await bridge01.setProviderFee(
        usdc01.address,
        2500000,
        10,
    );
    await bridge02.setProviderFee(
        usdc02.address,
        2500000,
        10,
    );
    await usdc01.approve(bridge01.address, ethers.utils.parseEther("10000000"));
    await usdc02.approve(bridge02.address, ethers.utils.parseEther("10000000"));
    await bridge01.depositProviderMargin(
        usdc02.address,
        usdc01.address,
        10000000000,
    );
    await bridge02.depositProviderMargin(
        usdc01.address,
        usdc02.address,
        10000000000,
    );
    await bridge01.depositSlashFundReserve(
        usdc02.address,
        usdc01.address,
        10000000,
    );
    await bridge02.depositSlashFundReserve(
        usdc01.address,
        usdc02.address,
        10000000,
    );
    return {
        "bridge01": bridge01.address,
        "bridge02": bridge02.address,
    };
}

// 2. deploy mapping token factory
async function main() {
    const network01 = arbitrumNetwork;
    const network02 = lineaNetwork;
    const wallets = wallet(network01.url, network02.url);
    const wallet01 = wallets[0];
    const wallet02 = wallets[1];

    /*
    const deployed = await deploy(wallet01, wallet02, network01, network02);
    console.log(deployed);
    return;
    */
    
    const bridgeAddress01 = "0x504F597CfB0A32704AA6533Fb75dCD60dB982836";
    const bridgeAddress02 = "0xE4B4b7707450b60421b5d7DE372fA5920F2bBDa8";

    const usdc01 = await ethers.getContractAt("Erc20", network01.usdc, wallet01);
    //await usdc01.approve(bridgeAddress01, ethers.utils.parseEther("10000000"));
    const usdc02 = await ethers.getContractAt("Erc20", network02.usdc, wallet02);
    //await usdc02.approve(bridgeAddress02, ethers.utils.parseEther("10000000"));

    const amount1 = 3300000;
    
    // lock
    /*
    await transferAndLockMargin(
        wallet01,
        bridgeAddress01,
        wallet01.address,
        usdc01.address,
        usdc02.address,
        amount1,
        wallet01.address,
        0,
    );
    */
    
    await transferAndLockMargin(
        wallet02,
        bridgeAddress02,
        wallet02.address,
        usdc02.address,
        usdc01.address,
        amount1,
        wallet02.address,
        0,
    );
    console.log("transfer and lock margin 1 successed");
    return;

    // relay
    // query: lastTransferId on linea
    const lastTransferId = "0x0000000000000000000000000000000000000000000000000000000000000000";
    const timestamp = 1692867700;
    const expectedTransferId = "0xFC62B416DE2A4182296774CFC5673507415FEA2BD2B5EAAA50F5A9CA387846CA";

    /*
    await relay(
        wallet02,
        bridgeAddress02,
        wallet02.address,
        usdc01.address,
        usdc02.address,
        lastTransferId,
        timestamp,
        wallet02.address,
        amount1,
        expectedTransferId,
    )
    console.log("relay 1 successed");
    return;
    */
    
    // slasher
    /*
    await slash(
        wallet01,
        bridgeAddress01,
        wallet01.address,
        usdc01.address,
        usdc02.address,
        lastTransferId,
        timestamp,
        wallet01.address,
        amount1,
        expectedTransferId,
    );
    console.log("slash successed");
    return;
    */
    
    // withdraw
    /*
    await requestWithdrawMargin(
        wallet02,
        bridgeAddress02,
        usdc02.address,
        1200000
    );
    */

    /*
    await requestWithdrawMargin(
        wallet01,
        bridgeAddress01,
        usdc01.address,
        320000
    );
    */
    
    console.log("withdraw successed");
    
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
    
/*
bridge01Logic = 0xCF8923ebF4244cedC647936a0281dd10bDFCBF18
bridge01Proxy = 0x78a6831Da2293fbEFd0d8aFB4D1f7CBB751e0119
bridge02Logic = 0x7C46146F50757Dc5A244C68C35FA2341351D5410
bridge02Proxy = 0x17bAfDDB48b2bD2424da843df67ACfe9183E087E
*/

