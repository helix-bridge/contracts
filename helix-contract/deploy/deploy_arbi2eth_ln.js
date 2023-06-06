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
    lastTransferId,
    nonce,
    providerKey,
    amount,
    receiver) {
    const bridge = await ethers.getContractAt("LnBridgeSource", bridgeAddress, wallet);
    const expectedFee = await bridge.fee(
        providerKey,
        amount);
    console.log("expect fee is", expectedFee);
    const providerInfo = await bridge.lnProviders(providerKey);
    const expectedMargin = providerInfo.config.margin;
    console.log("expect margin is", expectedMargin);
    //const tx = await bridge.callStatic.transferAndLockMargin(
    const tx = await bridge.transferAndLockMargin(
        lastTransferId,
        nonce,
        providerKey,
        amount,
        expectedFee,
        expectedMargin,
        wallet.address,
    );
    console.log(tx);
}

async function relay(
    wallet,
    bridgeAddress,
    lastTransferId,
    lastBlockHash,
    nonce,
    token,
    receiver,
    amount,
) {
    const bridge = await ethers.getContractAt("LnBridgeTarget", bridgeAddress, wallet);
    //const tx = await bridge.callStatic.relay(
    await bridge.relay(
        lastTransferId,
        lastBlockHash,
        nonce,
        token,
        receiver,
        amount,
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
        200,
        // fine
        300,
        18, // local decimals
        18, // remote decimals
    );

    // register provider
    await ringOnArbitrum.approve(arbitrumLnBridge.address, ethers.utils.parseEther("10000000"));
    await arbitrumLnBridge.registerOrUpdateLnProvider(
        0, // tokenIndex
        1000, // margin
        100, // baseFee
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
    
    const arbitrumLnBridgeAddress = "0xf661993DcDcb3FcbC13A2adeC20a9631A36E9C9E";
    const ethereumLnBridgeAddress = "0xCc74e7974cb626d11daFA5B5243E3ad6FAeb42C7";

    /*
     * update margin and fee
    const arbitrumLnBridge = await ethers.getContractAt("LnArbitrumBridgeOnL2", arbitrumLnBridgeAddress, arbitrumWallet);
    await arbitrumLnBridge.registerOrUpdateLnProvider(
        0, // tokenIndex
        ethers.utils.parseEther("100"),
        ethers.utils.parseEther("10"),
        100 // liquidityFee
    );
    return;
    */

    const ringOnArbitrum = await ethers.getContractAt("Erc20", ringArbitrumAddress, arbitrumWallet);
    //await ringOnArbitrum.approve(arbitrumLnBridgeAddress, ethers.utils.parseEther("10000000"));
    const ringOnEthereum = await ethers.getContractAt("Erc20", ringEthereumAddress, ethereumWallet);
    //await ringOnEthereum.approve(ethereumLnBridgeAddress, ethers.utils.parseEther("10000000"));

    const amount1 = ethers.utils.parseEther("30");
    
    // lock
    /*
    await transferAndLockMargin(
        arbitrumWallet,
        arbitrumLnBridgeAddress,
        //initTransferId,
        "0x92EDC024769309E20A837A5E585AB20C7A3DA08D9F987A68643F13404999B814",
        2,
        0,
        amount1,
        arbitrumWallet.address
    );
    console.log("transfer and lock margin 1 successed");
    */

    // relay
    // query: lastTransferId and lastBlockHash on arbitrum
    /*
    const lastBlockHash = "0x5D98D2F321677667E65B6977EF7E0AFD539D5E3CC2884632A318BB37AD7A2881";
    const lastTransferId = initTransferId;
    
    await relay(
        ethereumWallet,
        ethereumLnBridgeAddress,
        lastTransferId,
        lastBlockHash,
        1,
        ringEthereumAddress,
        arbitrumWallet.address,
        amount1
    )
    console.log("relay 1 successed");
    */
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
    
/*
arbitrumLnBridgeAddressLogic =   0xEa4eEEad8438dE63111D296C0DA3AF7035Eb9958
arbitrumLnBridgeAddressProxy =  0xf661993DcDcb3FcbC13A2adeC20a9631A36E9C9E
ethereumLnBridgeAddressLogic =   0x6df4C660A83Ca48b8A375b536e93AFCfa1Be33a8
ethereumLnBridgeAddressProxy =  0xCc74e7974cb626d11daFA5B5243E3ad6FAeb42C7
*/

