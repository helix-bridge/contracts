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
    providerKey,
    amount,
    receiver) {
    const bridge = await ethers.getContractAt("LnBridgeSource", bridgeAddress, wallet);
    const expectedFee = await bridge.totalFee(
        providerKey,
        amount);
    console.log("expect fee is", expectedFee);
    const providerInfo = await bridge.lnProviders(providerKey);
    const expectedMargin = providerInfo.config.margin;
    console.log("expect margin is", expectedMargin);
    //const tx = await bridge.callStatic.transferAndLockMargin(
    const tx = await bridge.transferAndLockMargin(
        [
            providerKey,
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
    providerKey,
    previousTransferId,
    lastBlockHash,
    timestamp,
    nonce,
    token,
    receiver,
    amount,
    expectedTransferId,
) {
    const bridge = await ethers.getContractAt("LnBridgeTarget", bridgeAddress, wallet);
    //const tx = await bridge.callStatic.relay(
    await bridge.transferAndReleaseMargin(
        [
            providerKey,
            previousTransferId,
            lastBlockHash,
            amount,
            nonce,
            timestamp,
            token,
            receiver,
        ],
        expectedTransferId,
    );
    //console.log(tx);
}

async function slash(
    wallet,
    bridgeAddress,
    providerKey,
    previousTransferId,
    lastBlockHash,
    timestamp,
    nonce,
    token,
    receiver,
    amount,
    expectedTransferId,
) {
    const bridge = await ethers.getContractAt("LnArbitrumBridgeOnL1", bridgeAddress, wallet);
    const maxSubmissionCost = await bridge.submissionRefundFee(
        1000000000,
        previousTransferId,
        previousTransferId,
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
            providerKey,
            previousTransferId,
            lastBlockHash,
            amount,
            nonce,
            timestamp,
            token,
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
    amount,
) {
    const bridge = await ethers.getContractAt("LnArbitrumBridgeOnL1", bridgeAddress, wallet);
    const maxSubmissionCost = await bridge.submissionWithdrawFee(
        1000000000,
        lastTransferId,
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
    const bridgeContract = await ethers.getContractFactory("LnArbitrumBridgeOnL1", wallet);
    const initdata = await ProxyDeployer.getInitializerData(
        bridgeContract.interface,
        [dao, inbox],
        "initialize",
    );
    console.log("ln bridge on l1 init data:", initdata);
}

async function getLnBridgeOnL2InitData(wallet, dao) {
    const bridgeContract = await ethers.getContractFactory("LnArbitrumBridgeOnL2", wallet);
    const initdata = await ProxyDeployer.getInitializerData(
        bridgeContract.interface,
        [dao],
        "initialize",
    );
    console.log("ln bridge on l2 init data:", initdata);
}

async function deployLnArbitrumBridgeOnL2(wallet, dao, proxyAdminAddress) {
    const bridgeContract = await ethers.getContractFactory("LnArbitrumBridgeOnL2", wallet);
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
    const bridgeContract = await ethers.getContractFactory("LnArbitrumBridgeOnL1", wallet);
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

    const arbitrumLnBridge = await ethers.getContractAt("LnArbitrumBridgeOnL2", arbitrumLnBridgeAddress, arbitrumWallet);
    const ethereumLnBridge = await ethers.getContractAt("LnArbitrumBridgeOnL1", ethereumLnBridgeAddress, ethereumWallet);
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
    await arbitrumLnBridge.registerOrUpdateLnProvider(
        0, // tokenIndex
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
    const arbitrumLnBridge = await ethers.getContractAt("LnArbitrumBridgeOnL2", arbitrumLnBridgeAddress, arbitrumWallet);
    await arbitrumLnBridge.registerOrUpdateLnProvider(
        0, // tokenIndex
        0, // providerIndex
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

    /*
    const deployed = await deploy(arbitrumWallet, ethereumWallet);
    console.log(deployed);
    return;
    */
    
    const arbitrumLnBridgeAddress = "0xBfbCe15bb38a28add41f3Bf1B80E579ae7B7a4c0";
    const ethereumLnBridgeAddress = "0xa5DE45d3eaabA9766B8494170F7E80fd41277a0B";

    // update margin and fee
    /*
    const arbitrumLnBridge = await ethers.getContractAt("LnArbitrumBridgeOnL2", arbitrumLnBridgeAddress, arbitrumWallet);
    await arbitrumLnBridge.registerOrUpdateLnProvider(
        0, // tokenIndex
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
        1,
        amount1,
        arbitrumWallet.address
    );
    console.log("transfer and lock margin 1 successed");
    return;
    */

    // relay
    // query: lastTransferId and lastBlockHash on arbitrum
    const lastBlockHash = "0x2793F8C5298D8E4889BBFA67517EAD1A6D27DC405904D718486D39189127732F";
    const lastTransferId = "0xF7B675FCFF60DE690FBF600F569A51C34AC31BBB58C69E8C5E08BD560E774861";
    const timestamp = 1686904098;
    const expectedTransferId = "0x14BB8D3728C52E01527ADD1FD445D50C79604CAAE9E7475487B591B6A38EECC7";

    /*
    await relay(
        ethereumWallet,
        ethereumLnBridgeAddress,
        1,
        lastTransferId,
        lastBlockHash,
        timestamp,
        4,
        ringEthereumAddress,
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
        1, //providerKey
        lastTransferId,
        lastBlockHash,
        timestamp,
        4, // nonce
        ringEthereumAddress,
        arbitrumWallet.address,
        amount1,
        expectedTransferId,
    );
    console.log("slash successed");
    */
    
    // withdraw
    
    await requestWithdrawMargin(
        ethereumWallet,
        ethereumLnBridgeAddress,
        "0x14BB8D3728C52E01527ADD1FD445D50C79604CAAE9E7475487B591B6A38EECC7", //lastTransferId
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
arbitrumLnBridgeAddressLogic =   0xc4cA82BD035AadBCc1eA6897cFE0a63E7EC4B93E
arbitrumLnBridgeAddressProxy =  0xBfbCe15bb38a28add41f3Bf1B80E579ae7B7a4c0
ethereumLnBridgeAddressLogic =   0x8715122126a5C982235c4BCC4c0253aa1feC6052
ethereumLnBridgeAddressProxy =  0xa5DE45d3eaabA9766B8494170F7E80fd41277a0B
*/

