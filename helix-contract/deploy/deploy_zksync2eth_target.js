const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');

var ProxyDeployer = require("./proxy.js");

const privateKey = process.env.PRIKEY

// goerli test <> zkSync goerli test
const ethereumUrl = "https://rpc.ankr.com/eth_goerli";
const zkSyncUrl = "https://zksync2-testnet.zksync.dev";
const ethereumProxyAdmin = "0x3F3eDBda6124462a09E071c5D90e072E0d5d4ed4";
const zkSyncProxyAdmin = "0x66d86a686e50c98bac236105efafb99ee7605dc5";
const mailboxEthereumAddress = "0x1908e2BF4a88F91E4eF0DC72f02b8Ea36BEa2319";
const daoOnEthereum = "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4";
const daoOnZkSync = "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4";

const initTransferId = "0x0000000000000000000000000000000000000000000000000000000000000000";

const zkSyncLnBridgeAddress = "0x9422E7883d1F9Dd2E0f5926D585115542D6C71dA";

const tokenInfos = {
    RING: {
        sourceAddress: "0x61C31A1fA4a8D765e63D4285f368aA2f4d912DbB",
        targetAddress: "0x1836BAFa3016Dd5Ce543D0F7199cB858ec69F41E",
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
        sourceAddress: "0x0faF6df7054946141266420b43783387A78d82A9",
        targetAddress: "0xd35CCeEAD182dcee0F148EbaC9447DA2c4D449c4",
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
    const bridgeContract = await ethers.getContractFactory("ZkSync2EthTarget", wallet);
    const initdata = await ProxyDeployer.getInitializerData(
        bridgeContract.interface,
        [dao, inbox],
        "initialize",
    );
    console.log("LnBridgeInitData init data:", initdata);
}

async function getLnBridgeSourceInitData(wallet, dao) {
    const bridgeContract = await ethers.getContractFactory("ZkSync2EthSource", wallet);
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
    tokenAddress,
    amount,
    receiver) {
    const bridge = await ethers.getContractAt("LnOppositeBridgeSource", bridgeAddress, wallet);
    const expectedFee = await bridge.totalFee(
        provider,
        tokenAddress,
        amount);
    console.log("expect fee is", expectedFee);
    const providerInfo = await bridge.lnProviders(await bridge.getProviderKey(provider, tokenAddress));
    const expectedMargin = providerInfo.config.margin;
    console.log("expect margin is", expectedMargin);
    let value = expectedFee.add(amount);
    if (tokenAddress !== "0x0000000000000000000000000000000000000000") {
        value = 0;
    }
    //const tx = await bridge.callStatic.transferAndLockMargin(
    const tx = await bridge.transferAndLockMargin(
        [
            provider,
            tokenAddress,
            providerInfo.lastTransferId,
            expectedMargin,
            expectedFee,
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
    const bridge = await ethers.getContractAt("LnOppositeBridgeTarget", bridgeAddress, wallet);
    //const tx = await bridge.callStatic.relay(
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
    const bridge = await ethers.getContractAt("Arb2EthTarget", bridgeAddress, wallet);
    const maxSubmissionCost = await bridge.submissionRefundFee(
        30000000000,
        previousTransferId,
        previousTransferId,
        provider,
        sourceToken,
        wallet.address,
        10,
    );
    const maxGas = 1000000;
    const gasPriceBid = 20000000000;
    const cost = maxSubmissionCost.add("0x470de4df820000");
    //return;

    //const tx = await bridge.callStatic.slashAndRemoteRefund(
    await bridge.slashAndRemoteRefund(
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
        maxSubmissionCost,
        maxGas,
        gasPriceBid,
        {value: cost },
    );
    //console.log(tx);
}

async function requestWithdrawMargin(
    wallet,
    bridgeAddress,
    lastTransferId,
    sourceToken,
    amount,
) {
    const bridge = await ethers.getContractAt("Arb2EthTarget", bridgeAddress, wallet);
    const maxSubmissionCost = await bridge.submissionWithdrawFee(
        30000000000,
        lastTransferId,
        sourceToken,
        amount,
        10,
    );
    const maxGas = 1000000;
    const gasPriceBid = 20000000000;
    const cost = maxSubmissionCost.add("0x470de4df820000");
    //return;

    //const tx = await bridge.callStatic.requestWithdrawMargin(
    await bridge.requestWithdrawMargin(
        lastTransferId,
        sourceToken,
        amount,
        maxSubmissionCost,
        maxGas,
        gasPriceBid,
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
    const bridgeContract = await ethers.getContractFactory("ZkSync2EthTarget", wallet);
    const initdata = await ProxyDeployer.getInitializerData(
        bridgeContract.interface,
        [dao, inbox],
        "initialize",
    );
    console.log("ln bridge on l1 init data:", initdata);
}

async function getLnBridgeOnL2InitData(wallet, dao) {
    const bridgeContract = await ethers.getContractFactory("ZkSync2EthSource", wallet);
    const initdata = await ProxyDeployer.getInitializerData(
        bridgeContract.interface,
        [dao],
        "initialize",
    );
    console.log("ln bridge on l2 init data:", initdata);
}

async function deployLnZkSyncBridgeOnL2(wallet, dao, proxyAdminAddress) {
    const bridgeContract = await ethers.getContractFactory("ZkSync2EthSource", wallet);
    const lnBridgeLogic = await bridgeContract.deploy();
    await lnBridgeLogic.deployed();
    console.log("finish to deploy ln bridge logic on L2, address: ", lnBridgeLogic.address);

    const lnBridgeProxy = await ProxyDeployer.deployProxyContract(
        proxyAdminAddress,
        bridgeContract,
        lnBridgeLogic.address,
        [dao],
        wallet);
    console.log("finish to deploy ln bridge proxy on L2, address:", lnBridgeProxy.address);
    return lnBridgeProxy.address;
}

async function deployLnZkSyncBridgeOnL1(wallet, dao, inbox, proxyAdminAddress) {
    const bridgeContract = await ethers.getContractFactory("ZkSync2EthTarget", wallet);
    const lnBridgeLogic = await bridgeContract.deploy();
    await lnBridgeLogic.deployed();
    console.log("finish to deploy ln bridge logic on L1, address: ", lnBridgeLogic.address);

    const lnBridgeProxy = await ProxyDeployer.deployProxyContract(
        proxyAdminAddress,
        bridgeContract,
        lnBridgeLogic.address,
        [dao, inbox],
        wallet);
    console.log("finish to deploy ln bridge proxy on L1, address:", lnBridgeProxy.address);
    return lnBridgeProxy.address;
}

async function deploy(zkSyncWallet, ethereumWallet) {
    const ethereumLnBridgeAddress = await deployLnZkSyncBridgeOnL1(
        ethereumWallet,
        daoOnEthereum,
        mailboxEthereumAddress,
        ethereumProxyAdmin
    );

    const zkSyncLnBridge = await ethers.getContractAt("ZkSync2EthSource", zkSyncLnBridgeAddress, zkSyncWallet);
    const ethereumLnBridge = await ethers.getContractAt("ZkSync2EthTarget", ethereumLnBridgeAddress, ethereumWallet);
    await zkSyncLnBridge.updateFeeReceiver(daoOnZkSync);
    await zkSyncLnBridge.setRemoteBridge(ethereumLnBridgeAddress);
    await ethereumLnBridge.setRemoteBridge(zkSyncLnBridgeAddress);

    return {
        "LnBridgeOnZkSync": zkSyncLnBridgeAddress,
        "LnBridgeOnEthereum": ethereumLnBridgeAddress,
    };
}

async function registerToken(token, sourceLnBridgeAddress, wallet) {
    const tokenInfo = tokenInfos[token];
    const zkSyncLnBridge = await ethers.getContractAt("ZkSync2EthSource", sourceLnBridgeAddress, wallet);

    // register token
    await zkSyncLnBridge.registerToken(
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
    // register provider
    const tokenInfo = tokenInfos[token];
    const sourceLnBridge = await ethers.getContractAt("ZkSync2EthSource", sourceLnBridgeAddress, sourceWallet);
    let value = tokenInfo.margin;
    if (tokenInfo.sourceAddress !== "0x0000000000000000000000000000000000000000") {
        const sourceToken = await ethers.getContractAt("Erc20", tokenInfo.sourceAddress, sourceWallet);
        const targetToken = await ethers.getContractAt("Erc20", tokenInfo.targetAddress, targetWallet);
        await sourceToken.approve(sourceLnBridgeAddress, ethers.utils.parseEther("10000000"));
        await targetToken.approve(targetLnBridgeAddress, ethers.utils.parseEther("10000000"));
        value = 0;
    }
    await sourceLnBridge.updateProviderFeeAndMargin(
        tokenInfo.sourceAddress,
        tokenInfo.margin,
        tokenInfo.providerFee,
        tokenInfo.providerLiquidityRate,
        { value: value },
    );
    console.log("register provider finished", token);
}

async function lockToken(
    token,
    bridgeAddress,
    amount,
    sourceWallet,
    targetWallet,
) {
    const tokenInfo = tokenInfos[token];
    // lock
    await transferAndLockMargin(
        sourceWallet,
        bridgeAddress,
        sourceWallet.address,
        tokenInfo.sourceAddress,
        amount,
        sourceWallet.address,
    );
    console.log("transfer and lock margin 1 successed");
}

async function updateProviderInfo(
    zkSyncLnBridgeAddress,
    zkSyncWallet,
    margin,
    baseFee,
    liquidityFeeRate,
) {
    const zkSyncLnBridge = await ethers.getContractAt("ZkSync2EthSource", zkSyncLnBridgeAddress, zkSyncWallet);
    await zkSyncLnBridge.updateProviderFeeAndMargin(
        ringZkSyncAddress,
        margin,
        baseFee,
        liquidityFeeRate,
    );
}

// 2. deploy mapping token factory
async function main() {
    const wallets = wallet();
    const zkSyncWallet = wallets[0];
    const ethereumWallet = wallets[1];

    //await getLnBridgeTargetInitData(zkSyncWallet, "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4", "0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f");
    //await getLnBridgeSourceInitData(zkSyncWallet, "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4");
    //return;

    /*
    const deployed = await deploy(zkSyncWallet, ethereumWallet);
    console.log(deployed);
    return;
    */
    
    const ethereumLnBridgeAddress = "0x6E7b0Af10aB840a47c47AeC97107487D2a17Eb2F";

    /*
    await registerToken('ETH', zkSyncLnBridgeAddress, zkSyncWallet);
    await registerProvider('ETH', zkSyncLnBridgeAddress, ethereumLnBridgeAddress, zkSyncWallet, ethereumWallet);
    return;
    */

    const amount = ethers.utils.parseEther("0.001");
    //const amount = 20000000;
    await lockToken(
        'ETH',
        zkSyncLnBridgeAddress,
        amount,
        zkSyncWallet,
        ethereumWallet,
    );
    return;
    

    // relay
    // query: lastTransferId on zkSync
    const lastTransferId = "0x356AB27AE7C69D5BDB71C97B96EF45362E71EADE1A5EFE1ADF5706FC0DFC8625";
    const timestamp = 1688961375;
    const expectedTransferId = "0xD1207442C3AC4BABC7500E06C2C08E3E5A46A452D92A7936A9B90ECE22C55E5E";

    /*
    await relay(
        ethereumWallet,
        ethereumLnBridgeAddress,
        ethereumWallet.address,
        ringZkSyncAddress,
        ringEthereumAddress,
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
        ringZkSyncAddress,
        ringEthereumAddress,
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
        "0xDD5703D47E4494FFC87660F3CBF2AFBA7A137755A91C81DC7ED120BB18E33A83", //lastTransferId
        ringZkSyncAddress,
        ethers.utils.parseEther("3"), // amount
    );
    
    console.log("withdraw successed");
    
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
    
/*
zkSyncLnBridgeAddressLogic =  0xBFA90e358a9B2218ceb900afD9ac78691C92ABa6
zkSyncLnBridgeAddressProxy = 0x7B8413FA1c1033844ac813A2E6475E15FB0fb3BA
ethereumLnBridgeAddressLogic =  0x0BA214a9Ab958C1A19D913f2Ac00119d27f196bB
ethereumLnBridgeAddressProxy = 0x3B1A953bFa72Af4ae3494b08e453BFF30a06A550
*/

