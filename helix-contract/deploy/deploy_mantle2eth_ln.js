const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');

var ProxyDeployer = require("./proxy.js");

const privateKey = process.env.PRIKEY

// goerli test <> mantle goerli test
const ethereumUrl = "https://rpc.ankr.com/eth_goerli";
const mantleUrl = "https://rpc.testnet.mantle.xyz";
const mntMantleAddress = "0x0000000000000000000000000000000000000000";
const mntEthereumAddress = "0xc1dC2d65A2243c22344E725677A3E3BEBD26E604";
const ethereumProxyAdmin = "0x3F3eDBda6124462a09E071c5D90e072E0d5d4ed4";
const mantleProxyAdmin = "0x9bc1C7567DDBcaF2212185b6665D755d842d01E4";
const messagerEthereumAddress = "0x7Bfe603647d5380ED3909F6f87580D0Af1B228B4";
const daoOnMantle = "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4";
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
        { value: amount.add(expectedFee) },
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
    const bridge = await ethers.getContractAt("Mantle2EthTarget", bridgeAddress, wallet);
    const cost = ethers.utils.parseEther("0.0003");
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
    const bridge = await ethers.getContractAt("Mantle2EthTarget", bridgeAddress, wallet);
    //const tx = await bridge.callStatic.requestWithdrawMargin(
    await bridge.requestWithdrawMargin(
        lastTransferId,
        sourceToken,
        amount,
        1900000
    );
    //console.log(tx);
}

function wallet() {
    const ethereumProvider = new ethers.providers.JsonRpcProvider(ethereumUrl);
    const ethereumWallet = new ethers.Wallet(privateKey, ethereumProvider);
    const mantleProvider = new ethers.providers.JsonRpcProvider(mantleUrl);
    const mantleWallet = new ethers.Wallet(privateKey, mantleProvider);
    return [mantleWallet, ethereumWallet];
}

async function deployLnMantleBridgeOnL2(wallet, dao, proxyAdminAddress) {
    const bridgeContract = await ethers.getContractFactory("Mantle2EthSource", wallet);
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

async function deployLnMantleBridgeOnL1(wallet, dao, proxyAdminAddress) {
    const bridgeContract = await ethers.getContractFactory("Mantle2EthTarget", wallet);
    const lnBridgeLogic = await bridgeContract.deploy();
    await lnBridgeLogic.deployed();
    console.log("finish to deploy ln bridge logic on L1, address: ", lnBridgeLogic.address);

    const lnBridgeProxy = await ProxyDeployer.deployProxyContract(
        proxyAdminAddress,
        bridgeContract,
        lnBridgeLogic.address,
        [dao, messagerEthereumAddress],
        wallet);
    console.log("finish to deploy ln bridge proxy on L1, address:", lnBridgeProxy.address);
    return lnBridgeProxy.address;
}

async function deploy(mantleWallet, ethereumWallet) {
    const mantleLnBridgeAddress = await deployLnMantleBridgeOnL2(
        mantleWallet,
        daoOnMantle,
        mantleProxyAdmin
    );
    const ethereumLnBridgeAddress = await deployLnMantleBridgeOnL1(
        ethereumWallet,
        daoOnEthereum,
        messagerEthereumAddress,
        ethereumProxyAdmin
    );

    const mantleLnBridge = await ethers.getContractAt("Mantle2EthSource", mantleLnBridgeAddress, mantleWallet);
    const ethereumLnBridge = await ethers.getContractAt("Mantle2EthTarget", ethereumLnBridgeAddress, ethereumWallet);
    await mantleLnBridge.updateFeeReceiver(daoOnMantle);
    await mantleLnBridge.setRemoteBridge(ethereumLnBridgeAddress);
    await ethereumLnBridge.setRemoteBridge(mantleLnBridgeAddress);

    // register special erc20 token
    // native token weth
    // we need replace this wusdc address by exist one
    const mntOnEthereum = await ethers.getContractAt("Erc20", mntEthereumAddress, ethereumWallet);

    // register token
    await mantleLnBridge.registerToken(
        mntMantleAddress,
        mntEthereumAddress,
        // helix fee
        ethers.utils.parseEther("0.01"),
        // penaltyLnCollateral
        ethers.utils.parseEther("0.1"),
        18, // local decimals
        18, // remote decimals
    );

    // register provider
    await mantleLnBridge.updateProviderFeeAndMargin(
        mntMantleAddress,
        ethers.utils.parseEther("100"),
        ethers.utils.parseEther("0.1"),
        100, // liquidityFee
        { value: ethers.utils.parseEther("100") }
    );
    return {
        "LnBridgeOnMantle": mantleLnBridgeAddress,
        "LnBridgeOnEthereum": ethereumLnBridgeAddress,
    };
}

// 2. deploy mapping token factory
async function main() {
    const wallets = wallet();
    const mantleWallet = wallets[0];
    const ethereumWallet = wallets[1];

    /*
    const deployed = await deploy(mantleWallet, ethereumWallet);
    console.log(deployed);
    return;
    */

    const mantleLnBridgeAddress = "0x191121eC17587C3cE0BF689AFA36386F8D9C538F";
    const ethereumLnBridgeAddress = "0x987B44aab797c8edfa7Bf42b2ded0A26aD36633F";

    const mntOnEthereum = await ethers.getContractAt("Erc20", mntEthereumAddress, ethereumWallet);
    //await mntOnEthereum.approve(ethereumLnBridgeAddress, ethers.utils.parseEther("10000000"));

    const amount1 = ethers.utils.parseEther("10");
    
    // lock
    /*
    await transferAndLockMargin(
        mantleWallet,
        mantleLnBridgeAddress,
        mantleWallet.address,
        mntMantleAddress,
        amount1,
        mantleWallet.address
    );
    console.log("transfer and lock margin 1 successed");
    return;
    */

    // relay
    // query: lastTransferId on mantle
    const lastTransferId = "0x0000000000000000000000000000000000000000000000000000000000000000";
    const timestamp = 1693632587;
    const expectedTransferId = "0x4d0ccdb5d2981871b4925a8fd98d65a834dfd176ea1d626ced222ba7b545e011";

    /*
    await relay(
        ethereumWallet,
        ethereumLnBridgeAddress,
        ethereumWallet.address,
        mntMantleAddress,
        mntEthereumAddress,
        lastTransferId,
        timestamp,
        mantleWallet.address,
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
        usdcMantleAddress,
        usdcEthereumAddress,
        lastTransferId,
        timestamp,
        mantleWallet.address,
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
        "0x4d0ccdb5d2981871b4925a8fd98d65a834dfd176ea1d626ced222ba7b545e011", //lastTransferId
        mntMantleAddress,
        ethers.utils.parseEther("1") // amount
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
mantleLnBridgeAddressLogic =    0x78fd428DDC407EDE3Cd9cF7639389eF47740AE52
mantleLnBridgeAddressProxy =    0x191121eC17587C3cE0BF689AFA36386F8D9C538F
ethereumLnBridgeAddressLogic =  0xc6c9814AB2343ea4FEEA99699b4DA39Ce344E18f
ethereumLnBridgeAddressProxy =  0x987B44aab797c8edfa7Bf42b2ded0A26aD36633F
*/
