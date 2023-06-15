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
            providerInfo.lastTransferId,
            expectedMargin,
            expectedFee,
        ],
        providerKey,
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
    
    const arbitrumLnBridgeAddress = "0xd129596B8b30CaA090Cc37A5a8F31c2BC29ffd6F";
    const ethereumLnBridgeAddress = "0xc9181736EF09371b1f8cbeaFb1fd34330EfDf127";

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

    const amount1 = ethers.utils.parseEther("26");
    
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
    const lastBlockHash = "0x8207A1BED6BF4246F069B7F1C92FEE4A84A5DAFD63C55B2BF15F34155E0215F2";
    const lastTransferId = "0x12236F66A13D55C64CE5A0EDCD48E05E19FB7901771F5324FF241AFE18DA3921";
    const timestamp = 1686819401;
    const expectedTransferId = "0x5EE29DC0523AA7135EE02E36BC7CE32F2CB925510EE3BB24A1346FE180E93A24";

    /*
    await relay(
        ethereumWallet,
        ethereumLnBridgeAddress,
        1,
        lastTransferId,
        lastBlockHash,
        timestamp,
        7,
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
        1,
        lastTransferId,
        lastBlockHash,
        timestamp,
        7,
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
        "0x5EE29DC0523AA7135EE02E36BC7CE32F2CB925510EE3BB24A1346FE180E93A24", //lastTransferId
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
arbitrumLnBridgeAddressLogic =   0x65b506ec9c6654Cd30CDD7dD30e3831F3a6E8fF4
arbitrumLnBridgeAddressProxy =  0xd129596B8b30CaA090Cc37A5a8F31c2BC29ffd6F
ethereumLnBridgeAddressLogic =   0xADB6A0d9909A6B863554a3aEd423d3a1F04Fec84
ethereumLnBridgeAddressProxy =  0xc9181736EF09371b1f8cbeaFb1fd34330EfDf127
*/

