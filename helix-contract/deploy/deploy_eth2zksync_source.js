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

const zkSyncLnBridgeAddress = "0x5cd77e187A65fED270E469b2f2b9eF18708EB859";

const initTransferId = "0x0000000000000000000000000000000000000000000000000000000000000000";

async function getLnBridgeTargetInitData(wallet, dao, inbox) {
    const bridgeContract = await ethers.getContractFactory("Eth2ArbTarget", wallet);
    const initdata = await ProxyDeployer.getInitializerData(
        bridgeContract.interface,
        [dao, inbox],
        "initialize",
    );
    console.log("LnBridgeInitData init data:", initdata);
}

async function getLnBridgeSourceInitData(wallet, dao) {
    const bridgeContract = await ethers.getContractFactory("Eth2ArbSource", wallet);
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
    const bridgeContract = await ethers.getContractFactory("Arb2EthTarget", wallet);
    const initdata = await ProxyDeployer.getInitializerData(
        bridgeContract.interface,
        [dao, inbox],
        "initialize",
    );
    console.log("ln bridge on l1 init data:", initdata);
}

async function getLnBridgeOnL2InitData(wallet, dao) {
    const bridgeContract = await ethers.getContractFactory("Arb2EthSource", wallet);
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

    const zkSyncLnBridge = await ethers.getContractAt("Eth2ArbTarget", zkSyncLnBridgeAddress, zkSyncWallet);
    const ethereumLnBridge = await ethers.getContractAt("Eth2ArbSource", ethereumLnBridgeAddress, ethereumWallet);
    await ethereumLnBridge.updateFeeReceiver(daoOnEthereum);
    await zkSyncLnBridge.setRemoteBridge(ethereumLnBridgeAddress);
    await ethereumLnBridge.setRemoteBridge(zkSyncLnBridgeAddress);

    // register special erc20 token
    // native token weth
    // we need replace this wring address by exist one
    const ringOnZkSync = await ethers.getContractAt("Erc20", ringZkSyncAddress, zkSyncWallet);
    const ringOnEthereum = await ethers.getContractAt("Erc20", ringEthereumAddress, ethereumWallet);

    // register token
    await ethereumLnBridge.setTokenInfo(
        ringEthereumAddress,
        ringZkSyncAddress,
        // helix fee
        ethers.utils.parseEther("1.5"),
        // penaltyLnCollateral
        ethers.utils.parseEther("20"),
        18, // local decimals
        18, // remote decimals
    );

    // register provider
    await ethereumLnBridge.setProviderFee(
        ringEthereumAddress,
        ethers.utils.parseEther("2.5"),
        10,
    );
    await ringOnZkSync.approve(zkSyncLnBridge.address, ethers.utils.parseEther("10000000"));
    await zkSyncLnBridge.depositProviderMargin(
        ringEthereumAddress,
        ringZkSyncAddress,
        ethers.utils.parseEther("1000"),
    );
    await zkSyncLnBridge.depositSlashFundReserve(
        ringEthereumAddress,
        ringZkSyncAddress,
        ethers.utils.parseEther("100"),
    );
    return {
        "LnBridgeOnZkSync": zkSyncLnBridgeAddress,
        "LnBridgeOnEthereum": ethereumLnBridgeAddress,
    };
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
    
    const ethereumLnBridgeAddress = "0xEe054E798EAf000D0F36484e4994214344474F2C";

    const ringOnZkSync = await ethers.getContractAt("Erc20", ringZkSyncAddress, zkSyncWallet);
    //await ringOnZkSync.approve(zkSyncLnBridgeAddress, ethers.utils.parseEther("10000000"));
    const ringOnEthereum = await ethers.getContractAt("Erc20", ringEthereumAddress, ethereumWallet);
    //await ringOnEthereum.approve(ethereumLnBridgeAddress, ethers.utils.parseEther("10000000"));

    const amount1 = ethers.utils.parseEther("30");
    
    // lock
    await transferAndLockMargin(
        ethereumWallet,
        ethereumLnBridgeAddress,
        ethereumWallet.address,
        ringEthereumAddress,
        ringZkSyncAddress,
        amount1,
        ethereumWallet.address,
        0,
    );
    console.log("transfer and lock margin 1 successed");
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
    

