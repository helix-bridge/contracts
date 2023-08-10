const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');
const { Provider } = require("zksync-web3");

var ProxyDeployer = require("./proxy.js");

const privateKey = process.env.PRIKEY

// goerli test <> zkSync goerli test
const ethereumUrl = "https://rpc.ankr.com/eth_goerli";
const zkSyncUrl = "https://zksync2-testnet.zksync.dev";
const ringZkSyncAddress = "0x61C31A1fA4a8D765e63D4285f368aA2f4d912DbB";
const ringEthereumAddress = "0x1836BAFa3016Dd5Ce543D0F7199cB858ec69F41E";
const ethereumProxyAdmin = "0x3F3eDBda6124462a09E071c5D90e072E0d5d4ed4";
const zkSyncProxyAdmin = "0x96892F3EaD26515592Da38432cFABad991BBd69d";
const mailboxEthereumAddress = "0x1908e2BF4a88F91E4eF0DC72f02b8Ea36BEa2319";
const daoOnZkSync = "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4";
const daoOnEthereum = "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4";
const initTransferId = "0x0000000000000000000000000000000000000000000000000000000000000000";

const zkSyncLnBridgeAddress = "0xC9933868e268802262D8DFeB374D72FB01b952e7";

const tokenInfos = {
    RING: {
        sourceAddress: "0x1836BAFa3016Dd5Ce543D0F7199cB858ec69F41E",
        targetAddress: "0x61C31A1fA4a8D765e63D4285f368aA2f4d912DbB",
        protocolFee: ethers.utils.parseEther("1.5"),
        penalty: ethers.utils.parseEther("20"),
        providerFee: ethers.utils.parseEther("2.5"),
        providerLiquidityRate: 10,
        sourceDecimals: 18,
        targetDecimals: 18,
        margin: ethers.utils.parseEther("10000"),
        slashFund: ethers.utils.parseEther("10"),
    },
    USDC: {
        sourceAddress: "0xd35CCeEAD182dcee0F148EbaC9447DA2c4D449c4",
        targetAddress: "0x0faF6df7054946141266420b43783387A78d82A9",
        protocolFee: 1500000,
        penalty: 10000000,
        providerFee: 2500000,
        providerLiquidityRate: 10,
        sourceDecimals: 6,
        targetDecimals: 6,
        margin: 10000000000,
        slashFund: 10000000,
    },
    ETH: {
        sourceAddress: "0x0000000000000000000000000000000000000000",
        targetAddress: "0x0000000000000000000000000000000000000000",
        protocolFee: ethers.utils.parseEther("0.0001"),
        penalty: ethers.utils.parseEther("0.001"),
        providerFee: ethers.utils.parseEther("0.00015"),
        providerLiquidityRate: 10,
        sourceDecimals: 18,
        targetDecimals: 18,
        margin: ethers.utils.parseEther("0.1"),
        slashFund: ethers.utils.parseEther("0.0001"),
    },
};

async function getLnBridgeTargetInitData(wallet, dao, inbox) {
    const bridgeContract = await ethers.getContractFactory("Eth2ZkSyncTarget", wallet);
    const initdata = await ProxyDeployer.getInitializerData(
        bridgeContract.interface,
        [dao, inbox],
        "initialize",
    );
    console.log("LnBridgeInitData init data:", initdata);
}

async function getLnBridgeSourceInitData(wallet, dao) {
    const bridgeContract = await ethers.getContractFactory("Eth2ZkSyncSource", wallet);
    const initdata = await ProxyDeployer.getInitializerData(
        bridgeContract.interface,
        [dao],
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
    let value = expectedFee.add(amount);
    if (sourceTokenAddress !== "0x0000000000000000000000000000000000000000") {
        value = 0;
    }
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
        { value: value },
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
    const tx = await bridge.transferAndReleaseMargin(
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
    console.log(tx);
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
    const bridge = await ethers.getContractAt("Eth2ZkSyncSource", bridgeAddress, wallet);
    const cost = await bridge.l2Fee(
        10000000000,
        1000000,
        800,
    );
    //const tx = await bridge.callStatic.slashAndRemoteRelease(
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
        1000000,
        800,
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
    const bridge = await ethers.getContractAt("Eth2ZkSyncSource", bridgeAddress, wallet);
    const cost = await bridge.l2Fee(
        100000000000,
        1000000,
        800,
    );

    //const tx = await bridge.callStatic.requestWithdrawMargin(
    await bridge.requestWithdrawMargin(
        sourceToken,
        amount,
        1000000,
        800,
        {value: cost },
    );
    //console.log(tx);
}

function wallet() {
    const ethereumProvider = new ethers.providers.JsonRpcProvider(ethereumUrl);
    const ethereumWallet = new ethers.Wallet(privateKey, ethereumProvider);
    const zkSyncProvider = new ethers.providers.JsonRpcProvider(zkSyncUrl);
    const zkSyncWallet = new ethers.Wallet(privateKey, zkSyncProvider);
    return [zkSyncWallet, ethereumWallet];
}

async function getLnBridgeOnL1InitData(wallet, dao, inbox) {
    const bridgeContract = await ethers.getContractFactory("Eth2ZkSyncTarget", wallet);
    const initdata = await ProxyDeployer.getInitializerData(
        bridgeContract.interface,
        [dao, inbox],
        "initialize",
    );
    console.log("ln bridge on l1 init data:", initdata);
}

async function getLnBridgeOnL2InitData(wallet, dao) {
    const bridgeContract = await ethers.getContractFactory("Eth2ZkSyncSource", wallet);
    const initdata = await ProxyDeployer.getInitializerData(
        bridgeContract.interface,
        [dao],
        "initialize",
    );
    console.log("ln bridge on l2 init data:", initdata);
}

async function deployLnSource(wallet, dao, mailbox, proxyAdminAddress) {
    const bridgeContract = await ethers.getContractFactory("Eth2ZkSyncSource", wallet);
    const lnBridgeLogic = await bridgeContract.deploy();
    await lnBridgeLogic.deployed();
    console.log("finish to deploy ln source bridge logic, address: ", lnBridgeLogic.address);

    const lnBridgeProxy = await ProxyDeployer.deployProxyContract(
        proxyAdminAddress,
        bridgeContract,
        lnBridgeLogic.address,
        [dao, mailbox],
        wallet);
    console.log("finish to deploy ln bridge proxy on ethereum, address:", lnBridgeProxy.address);
    return lnBridgeProxy.address;
}

async function deploy(zkSyncWallet, ethereumWallet) {
    const ethereumLnBridgeAddress = await deployLnSource(
        ethereumWallet,
        daoOnEthereum,
        mailboxEthereumAddress,
        ethereumProxyAdmin
    );

    const zkSyncLnBridge = await ethers.getContractAt("Eth2ZkSyncTarget", zkSyncLnBridgeAddress, zkSyncWallet);
    const ethereumLnBridge = await ethers.getContractAt("Eth2ZkSyncSource", ethereumLnBridgeAddress, ethereumWallet);
    await ethereumLnBridge.updateFeeReceiver(daoOnEthereum);
    await zkSyncLnBridge.setRemoteBridge(ethereumLnBridgeAddress);
    await ethereumLnBridge.setRemoteBridge(zkSyncLnBridgeAddress);

    return {
        "LnBridgeOnZkSync": zkSyncLnBridgeAddress,
        "LnBridgeOnEthereum": ethereumLnBridgeAddress,
    };
}

async function registerToken(token, sourceLnBridgeAddress, wallet) {
    const tokenInfo = tokenInfos[token];
    const ethereumLnBridge = await ethers.getContractAt("Eth2ZkSyncSource", sourceLnBridgeAddress, wallet);
    // register token
    await ethereumLnBridge.setTokenInfo(
        tokenInfo.sourceAddress,
        tokenInfo.targetAddress,
        tokenInfo.protocolFee,
        tokenInfo.penalty,
        tokenInfo.sourceDecimals,
        tokenInfo.targetDecimals,
    );
    console.log("register token finished", token);
}

async function registerProvider(token, sourceLnBridgeAddress, targetLnBridgeAddress, sourceWallet, targetWallet) {
    const tokenInfo = tokenInfos[token];
    const sourceLnBridge = await ethers.getContractAt("Eth2ZkSyncSource", sourceLnBridgeAddress, sourceWallet);
    const targetLnBridge = await ethers.getContractAt("Eth2ZkSyncTarget", targetLnBridgeAddress, targetWallet);
    // register provider
    await sourceLnBridge.setProviderFee(
        tokenInfo.sourceAddress,
        tokenInfo.providerFee,
        tokenInfo.providerLiquidityRate,
    );
    let marginValue = tokenInfo.margin;
    let slashValue = tokenInfo.slashFund;
    if (tokenInfo.targetAddress !== "0x0000000000000000000000000000000000000000") {
        const targetToken = await ethers.getContractAt("Erc20", tokenInfo.targetAddress, targetWallet);
        await targetToken.approve(targetLnBridge.address, ethers.utils.parseEther("10000000"));
        marginValue = 0;
        slashValue = 0;
    }
    await targetLnBridge.depositProviderMargin(
        tokenInfo.sourceAddress,
        tokenInfo.targetAddress,
        tokenInfo.margin,
        {value: marginValue },
    );
    await targetLnBridge.depositSlashFundReserve(
        tokenInfo.sourceAddress,
        tokenInfo.targetAddress,
        tokenInfo.slashFund,
        {value: slashValue },
    );
    console.log("register provider finished", token);
}

async function lockToken(
    token,
    bridgeAddress,
    amount,
    withdrawNonce,
    needApprove,
    sourceWallet,
    targetWallet,
) {
    const tokenInfo = tokenInfos[token];

    if (needApprove && tokenInfo.sourceAddress !== "0x0000000000000000000000000000000000000000") {
        const sourceToken = await ethers.getContractAt("Erc20", tokenInfo.sourceAddress, sourceWallet);
        await sourceToken.approve(bridgeAddress, ethers.utils.parseEther("10000000"));
    }

    // lock
    await transferAndLockMargin(
        sourceWallet,
        bridgeAddress,
        sourceWallet.address,
        tokenInfo.sourceAddress,
        tokenInfo.targetAddress,
        amount,
        sourceWallet.address,
        withdrawNonce,
    );
    console.log("transfer and lock margin 1 successed");
}

// 2. deploy mapping token factory
async function main() {
    /*
    const l2Provider = new Provider("https://testnet.era.zksync.dev");
    const zkSyncAddress = await l2Provider.getMainContractAddress();
    */

    const wallets = wallet();
    const zkSyncWallet = wallets[0];
    const ethereumWallet = wallets[1];

    //await getLnBridgeTargetInitData(zkSyncWallet, "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4", "0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f");
    //await getLnBridgeSourceInitData(zkSyncWallet, "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4");
    //return;

    // only deploy ethereum contract
    /*
    const deployed = await deploy(zkSyncWallet, ethereumWallet);
    console.log(deployed);
    return;
    */
    
    const ethereumLnBridgeAddress = "0xBE4a32f37d11e8227444837DFb3c634d189ccEDc";

    /*
    await registerToken('ETH', ethereumLnBridgeAddress, ethereumWallet);
    await registerProvider('ETH', ethereumLnBridgeAddress, zkSyncLnBridgeAddress, ethereumWallet, zkSyncWallet);
    return;
    */

    //const amount = ethers.utils.parseEther("200");
    const amount = 12000000;
    await lockToken(
        'USDC',
        ethereumLnBridgeAddress,
        amount,
        0, // withdrawNonce
        true, // needApprove
        ethereumWallet,
        zkSyncWallet,
    );
    return;

    // relay
    // query: lastTransferId on zkSync
    const lastTransferId = "0x349F327DD96E2FC5940EC3D1A75EEBC32FBAAB98C099CFCD0BBFB06A94CC0CE3";
    const timestamp = 1691561400;
    const expectedTransferId = "0x648B13FF4E4F75B5683DDD08D23F275DFCC4893945458AE9516AC014110EB14E";

    /*
    await relay(
        zkSyncWallet,
        zkSyncLnBridgeAddress,
        zkSyncWallet.address,
        ringEthereumAddress,
        ringZkSyncAddress,
        lastTransferId,
        timestamp,
        zkSyncWallet.address,
        amount1,
        expectedTransferId,
    )
    console.log("relay 1 successed");
    return;
    */
    
    // slasher
    /*
    await slash(
        ethereumWallet,
        ethereumLnBridgeAddress,
        ethereumWallet.address,
        ringEthereumAddress,
        ringZkSyncAddress,
        lastTransferId,
        timestamp,
        zkSyncWallet.address,
        amount1,
        expectedTransferId,
    );
    console.log("slash successed");
    return;
    */
    
    // withdraw
    await requestWithdrawMargin(
        ethereumWallet,
        ethereumLnBridgeAddress,
        ringEthereumAddress,
        ethers.utils.parseEther("3.2"), // amount
    );
    
    console.log("withdraw successed");
    
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
    

