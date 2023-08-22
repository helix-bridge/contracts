const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');

var ProxyDeployer = require("./proxy.js");

const privateKey = process.env.PRIKEY

// goerli test <> linea goerli test
const ethereumUrl = "https://rpc.ankr.com/eth_goerli";
//const lineaUrl = "https://linea-goerli.infura.io/v3/cab8c3ad4f19458c873819725b65a185";
const lineaUrl = "https://rpc.goerli.linea.build";
const usdcLineaAddress = "0xB4257F31750961C8e536f5cfCBb3079437700416";
const usdcEthereumAddress = "0x07865c6E87B9F70255377e024ace6630C1Eaa37F";
const ethereumProxyAdmin = "0x3F3eDBda6124462a09E071c5D90e072E0d5d4ed4";
const lineaProxyAdmin = "0x9bc1C7567DDBcaF2212185b6665D755d842d01E4";
const messageServiceEthereumAddress = "0x70BaD09280FD342D02fe64119779BC1f0791BAC2";
const messageServiceLineaAddress = "0xC499a572640B64eA1C8c194c43Bc3E19940719dC";
const daoOnLinea = "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4";
const daoOnEthereum = "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4";

const initTransferId = "0x0000000000000000000000000000000000000000000000000000000000000000";

async function getLnBridgeTargetInitData(wallet, dao, messageService) {
    const bridgeContract = await ethers.getContractFactory("Arb2EthTarget", wallet);
    const initdata = await ProxyDeployer.getInitializerData(
        bridgeContract.interface,
        [dao, messageService],
        "initialize",
    );
    console.log("LnBridgeInitData init data:", initdata);
}

async function getLnBridgeSourceInitData(wallet, dao) {
    const bridgeContract = await ethers.getContractFactory("Arb2EthSource", wallet);
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
    const bridge = await ethers.getContractAt("Linea2EthTarget", bridgeAddress, wallet);
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
    const bridge = await ethers.getContractAt("Linea2EthTarget", bridgeAddress, wallet);
    const cost = 0;
    //const tx = await bridge.callStatic.requestWithdrawMargin(
    await bridge.requestWithdrawMargin(
        lastTransferId,
        sourceToken,
        amount,
        {value: cost },
    );
    //console.log(tx);
}

function wallet() {
    const ethereumProvider = new ethers.providers.JsonRpcProvider(ethereumUrl);
    const ethereumWallet = new ethers.Wallet(privateKey, ethereumProvider);
    const lineaProvider = new ethers.providers.JsonRpcProvider(lineaUrl);
    const lineaWallet = new ethers.Wallet(privateKey, lineaProvider);
    return [lineaWallet, ethereumWallet];
}

async function getLnBridgeOnL1InitData(wallet, dao, messageService) {
    const bridgeContract = await ethers.getContractFactory("Arb2EthTarget", wallet);
    const initdata = await ProxyDeployer.getInitializerData(
        bridgeContract.interface,
        [dao, messageService],
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

async function deployLnLineaBridgeOnL2(wallet, dao, proxyAdminAddress) {
    const bridgeContract = await ethers.getContractFactory("Linea2EthSource", wallet);
    const lnBridgeLogic = await bridgeContract.deploy();
    await lnBridgeLogic.deployed();
    console.log("finish to deploy ln bridge logic on L2, address: ", lnBridgeLogic.address);

    const lnBridgeProxy = await ProxyDeployer.deployProxyContract(
        proxyAdminAddress,
        bridgeContract,
        lnBridgeLogic.address,
        [dao, messageServiceLineaAddress],
        wallet);
    console.log("finish to deploy ln bridge proxy on L2, address:", lnBridgeProxy.address);
    return lnBridgeProxy.address;
}

async function deployLnLineaBridgeOnL1(wallet, dao, messageService, proxyAdminAddress) {
    const bridgeContract = await ethers.getContractFactory("Linea2EthTarget", wallet);
    const lnBridgeLogic = await bridgeContract.deploy();
    await lnBridgeLogic.deployed();
    console.log("finish to deploy ln bridge logic on L1, address: ", lnBridgeLogic.address);

    const lnBridgeProxy = await ProxyDeployer.deployProxyContract(
        proxyAdminAddress,
        bridgeContract,
        lnBridgeLogic.address,
        [dao, messageServiceEthereumAddress],
        wallet);
    console.log("finish to deploy ln bridge proxy on L1, address:", lnBridgeProxy.address);
    return lnBridgeProxy.address;
}

async function deploy(lineaWallet, ethereumWallet) {
    const lineaLnBridgeAddress = await deployLnLineaBridgeOnL2(
        lineaWallet,
        daoOnLinea,
        lineaProxyAdmin
    );
    const ethereumLnBridgeAddress = await deployLnLineaBridgeOnL1(
        ethereumWallet,
        daoOnEthereum,
        messageServiceEthereumAddress,
        ethereumProxyAdmin
    );

    const lineaLnBridge = await ethers.getContractAt("Linea2EthSource", lineaLnBridgeAddress, lineaWallet);
    const ethereumLnBridge = await ethers.getContractAt("Linea2EthTarget", ethereumLnBridgeAddress, ethereumWallet);
    await lineaLnBridge.updateFeeReceiver(daoOnLinea);
    await lineaLnBridge.setRemoteBridge(ethereumLnBridgeAddress);
    await ethereumLnBridge.setRemoteBridge(lineaLnBridgeAddress);

    // register special erc20 token
    // native token weth
    // we need replace this wusdc address by exist one
    const usdcOnLinea = await ethers.getContractAt("Erc20", usdcLineaAddress, lineaWallet);
    const usdcOnEthereum = await ethers.getContractAt("Erc20", usdcEthereumAddress, ethereumWallet);

    // register token
    await lineaLnBridge.registerToken(
        usdcLineaAddress,
        usdcEthereumAddress,
        // helix fee
        1500000,
        // penaltyLnCollateral
        5000000,
        6, // local decimals
        6, // remote decimals
    );

    // register provider
    await usdcOnLinea.approve(lineaLnBridge.address, ethers.utils.parseEther("10000000"));
    await lineaLnBridge.updateProviderFeeAndMargin(
        usdcLineaAddress,
        100000000,
        10000000,
        100 // liquidityFee
    );
    return {
        "LnBridgeOnLinea": lineaLnBridgeAddress,
        "LnBridgeOnEthereum": ethereumLnBridgeAddress,
    };
}

// 2. deploy mapping token factory
async function main() {
    const wallets = wallet();
    const lineaWallet = wallets[0];
    const ethereumWallet = wallets[1];

    /*
    const deployed = await deploy(lineaWallet, ethereumWallet);
    console.log(deployed);
    return;
    */
    
    const lineaLnBridgeAddress = "0x9C80EdD342b5D179c3a87946fC1F0963BfcaAa09";
    const ethereumLnBridgeAddress = "0x91bdd735Dc214876605C18A57C7841CFF7eE959a";

    const usdcOnLinea = await ethers.getContractAt("Erc20", usdcLineaAddress, lineaWallet);
    //await usdcOnLinea.approve(lineaLnBridgeAddress, ethers.utils.parseEther("10000000"));
    const usdcOnEthereum = await ethers.getContractAt("Erc20", usdcEthereumAddress, ethereumWallet);
    //await usdcOnEthereum.approve(ethereumLnBridgeAddress, ethers.utils.parseEther("10000000"));

    //const amount1 = ethers.utils.parseEther("23");
    const amount1 = 4000000;
    
    // lock
    /*
    await transferAndLockMargin(
        lineaWallet,
        lineaLnBridgeAddress,
        lineaWallet.address,
        usdcLineaAddress,
        amount1,
        lineaWallet.address
    );
    console.log("transfer and lock margin 1 successed");
    return;
    */

    // relay
    // query: lastTransferId on linea
    const lastTransferId = "0xF85022FE768C667060C58E78F436B0D35ACFBCAF7D8537D5A03AF3E55D32BD06";
    const timestamp = 1692674272;
    const expectedTransferId = "0x30F50A395BFF7C6F503B152B03719A3B234E7D2C7B23C09CA0A7F9E216963E4F";

    await relay(
        ethereumWallet,
        ethereumLnBridgeAddress,
        ethereumWallet.address,
        usdcLineaAddress,
        usdcEthereumAddress,
        lastTransferId,
        timestamp,
        lineaWallet.address,
        amount1,
        expectedTransferId,
    )
    console.log("relay 1 successed");
    return;
    
    // slasher
    await slash(
        ethereumWallet,
        ethereumLnBridgeAddress,
        ethereumWallet.address,
        usdcLineaAddress,
        usdcEthereumAddress,
        lastTransferId,
        timestamp,
        lineaWallet.address,
        amount1,
        expectedTransferId,
    );
    console.log("slash successed");
    return;
    
    // withdraw
    
    await requestWithdrawMargin(
        ethereumWallet,
        ethereumLnBridgeAddress,
        "0x5FF441A69D0C96D28F7A61497B762AF35DE9B20653F4F20ADE6C4077AE5E1220", //lastTransferId
        usdcLineaAddress,
        3200000, // amount
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
lineaLnBridgeAddressLogic =     0x191121eC17587C3cE0BF689AFA36386F8D9C538F
lineaLnBridgeAddressProxy =     0x9C80EdD342b5D179c3a87946fC1F0963BfcaAa09
ethereumLnBridgeAddressLogic =  0xD28086bE6cD7Ea8c2B2E2a99E8a8CaDff2F06427
ethereumLnBridgeAddressProxy =  0x91bdd735Dc214876605C18A57C7841CFF7eE959a
*/

