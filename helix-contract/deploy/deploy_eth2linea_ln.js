const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');

var ProxyDeployer = require("./proxy.js");

const privateKey = process.env.PRIKEY

// goerli test <> linea goerli test
const ethereumUrl = "https://rpc.ankr.com/eth_goerli";
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
    const bridgeContract = await ethers.getContractFactory("Eth2LineaTarget", wallet);
    const initdata = await ProxyDeployer.getInitializerData(
        bridgeContract.interface,
        [dao, messageService],
        "initialize",
    );
    console.log("LnBridgeInitData init data:", initdata);
}

async function getLnBridgeSourceInitData(wallet, dao) {
    const bridgeContract = await ethers.getContractFactory("Eth2LineaSource", wallet);
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
    const bridge = await ethers.getContractAt("Eth2LineaSource", bridgeAddress, wallet);
    const cost = 0;
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
    const bridge = await ethers.getContractAt("Eth2LineaSource", bridgeAddress, wallet);
    const cost = 0;

    //const tx = await bridge.callStatic.requestWithdrawMargin(
    await bridge.requestWithdrawMargin(
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
    const bridgeContract = await ethers.getContractFactory("Linea2EthTarget", wallet);
    const initdata = await ProxyDeployer.getInitializerData(
        bridgeContract.interface,
        [dao, messageService],
        "initialize",
    );
    console.log("ln bridge on l1 init data:", initdata);
}

async function getLnBridgeOnL2InitData(wallet, dao) {
    const bridgeContract = await ethers.getContractFactory("Linea2EthSource", wallet);
    const initdata = await ProxyDeployer.getInitializerData(
        bridgeContract.interface,
        [dao],
        "initialize",
    );
    console.log("ln bridge on l2 init data:", initdata);
}

async function deployLnTarget(wallet, dao, proxyAdminAddress) {
    const bridgeContract = await ethers.getContractFactory("Eth2LineaTarget", wallet);
    const lnBridgeLogic = await bridgeContract.deploy();
    await lnBridgeLogic.deployed();
    console.log("finish to deploy ln target bridge logic, address: ", lnBridgeLogic.address);

    const lnBridgeProxy = await ProxyDeployer.deployProxyContract(
        proxyAdminAddress,
        bridgeContract,
        lnBridgeLogic.address,
        [dao, messageServiceLineaAddress],
        wallet);
    console.log("finish to deploy ln bridge proxy on L2, address:", lnBridgeProxy.address);
    return lnBridgeProxy.address;
}

async function deployLnSource(wallet, dao, messageService, proxyAdminAddress) {
    const bridgeContract = await ethers.getContractFactory("Eth2LineaSource", wallet);
    const lnBridgeLogic = await bridgeContract.deploy();
    await lnBridgeLogic.deployed();
    console.log("finish to deploy ln source bridge logic, address: ", lnBridgeLogic.address);

    const lnBridgeProxy = await ProxyDeployer.deployProxyContract(
        proxyAdminAddress,
        bridgeContract,
        lnBridgeLogic.address,
        [dao, messageService],
        wallet);
    console.log("finish to deploy ln bridge proxy on ethereum, address:", lnBridgeProxy.address);
    return lnBridgeProxy.address;
}

async function deploy(lineaWallet, ethereumWallet) {
    const ethereumLnBridgeAddress = await deployLnSource(
        ethereumWallet,
        daoOnEthereum,
        messageServiceEthereumAddress,
        ethereumProxyAdmin
    );
    const lineaLnBridgeAddress = await deployLnTarget(
        lineaWallet,
        daoOnLinea,
        lineaProxyAdmin
    );

    const lineaLnBridge = await ethers.getContractAt("Eth2LineaTarget", lineaLnBridgeAddress, lineaWallet);
    const ethereumLnBridge = await ethers.getContractAt("Eth2LineaSource", ethereumLnBridgeAddress, ethereumWallet);
    await ethereumLnBridge.updateFeeReceiver(daoOnEthereum);
    await lineaLnBridge.setRemoteBridge(ethereumLnBridgeAddress);
    await ethereumLnBridge.setRemoteBridge(lineaLnBridgeAddress);

    // register special erc20 token
    // native token weth
    // we need replace this wusdc address by exist one
    const usdcOnLinea = await ethers.getContractAt("Erc20", usdcLineaAddress, lineaWallet);
    const usdcOnEthereum = await ethers.getContractAt("Erc20", usdcEthereumAddress, ethereumWallet);

    // register token
    await ethereumLnBridge.setTokenInfo(
        usdcEthereumAddress,
        usdcLineaAddress,
        // helix fee
        1500000,
        // penaltyLnCollateral
        2000000,
        6, // local decimals
        6, // remote decimals
    );

    // register provider
    await ethereumLnBridge.setProviderFee(
        usdcEthereumAddress,
        2500000,
        10,
    );
    await usdcOnLinea.approve(lineaLnBridge.address, ethers.utils.parseEther("10000000"));
    await lineaLnBridge.depositProviderMargin(
        usdcEthereumAddress,
        usdcLineaAddress,
        100000000,
    );
    await lineaLnBridge.depositSlashFundReserve(
        usdcEthereumAddress,
        usdcLineaAddress,
        10000000,
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
    
    const ethereumLnBridgeAddress = "0x5A351EA4F4128F58EA13DDa52E3d1842c0b3B690";
    const lineaLnBridgeAddress = "0xeA5f0a09A8723444965FDd6f76523C338faB00f7";

    const usdcOnLinea = await ethers.getContractAt("Erc20", usdcLineaAddress, lineaWallet);
    //await usdcOnLinea.approve(lineaLnBridgeAddress, ethers.utils.parseEther("10000000"));
    const usdcOnEthereum = await ethers.getContractAt("Erc20", usdcEthereumAddress, ethereumWallet);
    //await usdcOnEthereum.approve(ethereumLnBridgeAddress, ethers.utils.parseEther("10000000"));

    const amount1 = 3000000;
    
    // lock
    /*
    await transferAndLockMargin(
        ethereumWallet,
        ethereumLnBridgeAddress,
        ethereumWallet.address,
        usdcEthereumAddress,
        usdcLineaAddress,
        amount1,
        ethereumWallet.address,
        0,
    );
    console.log("transfer and lock margin 1 successed");
    return;
    */

    // relay
    // query: lastTransferId on linea
    const lastTransferId = "0x0000000000000000000000000000000000000000000000000000000000000000";
    const timestamp = 1692691272;
    const expectedTransferId = "0x851E1255171825594B313D8AE96F277C0DBAAB5246B9BC661BA98538F675425C";

    /*
    await relay(
        lineaWallet,
        lineaLnBridgeAddress,
        lineaWallet.address,
        usdcEthereumAddress,
        usdcLineaAddress,
        lastTransferId,
        timestamp,
        lineaWallet.address,
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
        usdcEthereumAddress,
        usdcLineaAddress,
        lastTransferId,
        timestamp,
        lineaWallet.address,
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
        usdcEthereumAddress,
        3200000
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
ethereumLnBridgeAddressLogic = 0x92cc77912625eb88c139086f9cB59Bf97dae5943
ethereumLnBridgeAddressProxy = 0x5A351EA4F4128F58EA13DDa52E3d1842c0b3B690
lineaLnBridgeAddressLogic =    0x188Ec0CEB000444E14f8BB29b9113794B25A571B
lineaLnBridgeAddressProxy =    0xeA5f0a09A8723444965FDd6f76523C338faB00f7
*/

