const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');

var ProxyDeployer = require("./proxy.js");

const privateKey = process.env.PRIKEY

// goerli test <> arbitrum goerli test
const ethereumUrl = "https://rpc.ankr.com/eth_goerli";
const arbitrumUrl = "https://goerli-rollup.arbitrum.io/rpc";
const ringArbitrumAddress = "0xFBAD806Bdf9cEC2943be281FB355Da05068DE925";
const ringEthereumAddress = "0x1836BAFa3016Dd5Ce543D0F7199cB858ec69F41E";
const ethereumProxyAdmin = "0x3F3eDBda6124462a09E071c5D90e072E0d5d4ed4";
const arbitrumProxyAdmin = "0x66d86a686e50c98bac236105efafb99ee7605dc5";
const inboxEthereumAddress = "0x6BEbC4925716945D46F0Ec336D5C2564F419682C";
const arbitrumChainId = 421613;
const ethereumChainId = 5;
const daoOnArbitrum = "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4";
const daoOnEthereum = "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4";

const initTransferId = "0x0000000000000000000000000000000000000000000000000000000000000000";

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
    const arbitrumProvider = new ethers.providers.JsonRpcProvider(arbitrumUrl);
    const arbitrumWallet = new ethers.Wallet(privateKey, arbitrumProvider);
    return [arbitrumWallet, ethereumWallet];
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

async function deployLnArbitrumBridgeOnL2(wallet, dao, proxyAdminAddress) {
    const bridgeContract = await ethers.getContractFactory("Arb2EthSource", wallet);
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

async function deployLnArbitrumBridgeOnL1(wallet, dao, inbox, proxyAdminAddress) {
    const bridgeContract = await ethers.getContractFactory("Arb2EthTarget", wallet);
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

async function deploy(arbitrumWallet, ethereumWallet) {
    const arbitrumLnBridgeAddress = await deployLnArbitrumBridgeOnL2(
        arbitrumWallet,
        daoOnArbitrum,
        arbitrumProxyAdmin
    );
    const ethereumLnBridgeAddress = await deployLnArbitrumBridgeOnL1(
        ethereumWallet,
        daoOnEthereum,
        inboxEthereumAddress,
        ethereumProxyAdmin
    );

    const arbitrumLnBridge = await ethers.getContractAt("Arb2EthSource", arbitrumLnBridgeAddress, arbitrumWallet);
    const ethereumLnBridge = await ethers.getContractAt("Arb2EthTarget", ethereumLnBridgeAddress, ethereumWallet);
    await arbitrumLnBridge.updateFeeReceiver(daoOnArbitrum);
    await arbitrumLnBridge.setRemoteBridge(ethereumLnBridgeAddress);
    await ethereumLnBridge.setRemoteBridge(arbitrumLnBridgeAddress);

    // register special erc20 token
    // native token weth
    // we need replace this wring address by exist one
    const ringOnArbitrum = await ethers.getContractAt("Erc20", ringArbitrumAddress, arbitrumWallet);
    const ringOnEthereum = await ethers.getContractAt("Erc20", ringEthereumAddress, ethereumWallet);

    // register token
    await arbitrumLnBridge.registerToken(
        ringArbitrumAddress,
        ringEthereumAddress,
        // helix fee
        ethers.utils.parseEther("1.5"),
        // penaltyLnCollateral
        ethers.utils.parseEther("20"),
        18, // local decimals
        18, // remote decimals
    );

    // register provider
    await ringOnArbitrum.approve(arbitrumLnBridge.address, ethers.utils.parseEther("10000000"));
    await arbitrumLnBridge.updateProviderFeeAndMargin(
        ringArbitrumAddress,
        ethers.utils.parseEther("1000"),
        ethers.utils.parseEther("100"),
        100 // liquidityFee
    );
    return {
        "LnBridgeOnArbitrum": arbitrumLnBridgeAddress,
        "LnBridgeOnEthereum": ethereumLnBridgeAddress,
    };
}

async function updateProviderInfo(
    arbitrumLnBridgeAddress,
    arbitrumWallet,
    margin,
    baseFee,
    liquidityFeeRate,
) {
    const arbitrumLnBridge = await ethers.getContractAt("Arb2EthSource", arbitrumLnBridgeAddress, arbitrumWallet);
    await arbitrumLnBridge.updateProviderFeeAndMargin(
        ringArbitrumAddress,
        margin,
        baseFee,
        liquidityFeeRate,
    );
}

// 2. deploy mapping token factory
async function main() {
    const wallets = wallet();
    const arbitrumWallet = wallets[0];
    const ethereumWallet = wallets[1];

    
    const deployed = await deploy(arbitrumWallet, ethereumWallet);
    console.log(deployed);
    return;
    
    
    
    const arbitrumLnBridgeAddress = "0x04C82202985b5c9c582Daa97C2199EB1f129d8e4";
    const ethereumLnBridgeAddress = "0xdA2cDf09D82278C2b2ed0DEAc3bdad12c169405c";

    // update margin and fee
    /*
    const arbitrumLnBridge = await ethers.getContractAt("Arb2EthSource", arbitrumLnBridgeAddress, arbitrumWallet);
    await arbitrumLnBridge.updateProviderFeeAndMargin(
        ringArbitrumAddress,
        ethers.utils.parseEther("500"),
        ethers.utils.parseEther("10"),
        100 // liquidityFee
    );
    return;
    */

    const ringOnArbitrum = await ethers.getContractAt("Erc20", ringArbitrumAddress, arbitrumWallet);
    //await ringOnArbitrum.approve(arbitrumLnBridgeAddress, ethers.utils.parseEther("10000000"));
    const ringOnEthereum = await ethers.getContractAt("Erc20", ringEthereumAddress, ethereumWallet);
    //await ringOnEthereum.approve(ethereumLnBridgeAddress, ethers.utils.parseEther("10000000"));

    const amount1 = ethers.utils.parseEther("23");
    
    // lock
    /*
    await transferAndLockMargin(
        arbitrumWallet,
        arbitrumLnBridgeAddress,
        arbitrumWallet.address,
        ringArbitrumAddress,
        amount1,
        arbitrumWallet.address
    );
    console.log("transfer and lock margin 1 successed");
    return;
    */

    // relay
    // query: lastTransferId on arbitrum
    const lastTransferId = "0x356AB27AE7C69D5BDB71C97B96EF45362E71EADE1A5EFE1ADF5706FC0DFC8625";
    const timestamp = 1688961375;
    const expectedTransferId = "0xD1207442C3AC4BABC7500E06C2C08E3E5A46A452D92A7936A9B90ECE22C55E5E";

    /*
    await relay(
        ethereumWallet,
        ethereumLnBridgeAddress,
        ethereumWallet.address,
        ringArbitrumAddress,
        ringEthereumAddress,
        lastTransferId,
        timestamp,
        arbitrumWallet.address,
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
        ringArbitrumAddress,
        ringEthereumAddress,
        lastTransferId,
        timestamp,
        arbitrumWallet.address,
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
        "0xD1207442C3AC4BABC7500E06C2C08E3E5A46A452D92A7936A9B90ECE22C55E5E", //lastTransferId
        ringArbitrumAddress,
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
arbitrumLnBridgeAddressLogic =  0x48A331c274D3c7dC86Da7DCf672D7f32ECc57eFA
arbitrumLnBridgeAddressProxy = 0x7C41bCAEE051524f3b873F360baE6a06E4870799
ethereumLnBridgeAddressLogic =  0x1df65457d6F09fcd1F96FC7BEa4960b25D842b99
ethereumLnBridgeAddressProxy = 0xB83fb8CF1F509Ddd3214c001017D15cb462fA929
*/

