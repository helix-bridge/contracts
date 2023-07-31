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
    const bridge = await ethers.getContractAt("Eth2ArbSource", bridgeAddress, wallet);
    const maxSubmissionCost = await bridge.submissionSlashFee(
        30000000000,
        [
            previousTransferId,
            provider,
            sourceToken,
            targetToken,
            amount,
            timestamp,
            receiver,
        ],
        receiver,
        0,
        0,
        10,
    );
    const maxGas = 1000000;
    const gasPriceBid = 20000000000;
    const cost = maxSubmissionCost.add("0x470de4df820000");
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
    provider,
    sourceToken,
    targetToken,
    amount,
) {
    const bridge = await ethers.getContractAt("Eth2ArbSource", bridgeAddress, wallet);
    const maxSubmissionCost = await bridge.submissionWithdrawFee(
        30000000000,
        lastTransferId,
        0,
        provider,
        sourceToken,
        targetToken,
        amount,
        10,
    );
    const maxGas = 1000000;
    const gasPriceBid = 20000000000;
    const cost = maxSubmissionCost.add("0x470de4df820000");
    //return;

    //const tx = await bridge.callStatic.requestWithdrawMargin(
    await bridge.requestWithdrawMargin(
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

async function deployLnTarget(wallet, dao, proxyAdminAddress) {
    const bridgeContract = await ethers.getContractFactory("Eth2ArbTarget", wallet);
    const lnBridgeLogic = await bridgeContract.deploy();
    await lnBridgeLogic.deployed();
    console.log("finish to deploy ln target bridge logic, address: ", lnBridgeLogic.address);

    const lnBridgeProxy = await ProxyDeployer.deployProxyContract(
        proxyAdminAddress,
        bridgeContract,
        lnBridgeLogic.address,
        [dao],
        wallet);
    console.log("finish to deploy ln bridge proxy on L2, address:", lnBridgeProxy.address);
    return lnBridgeProxy.address;
}

async function deployLnSource(wallet, dao, inbox, proxyAdminAddress) {
    const bridgeContract = await ethers.getContractFactory("Eth2ArbSource", wallet);
    const lnBridgeLogic = await bridgeContract.deploy();
    await lnBridgeLogic.deployed();
    console.log("finish to deploy ln source bridge logic, address: ", lnBridgeLogic.address);

    const lnBridgeProxy = await ProxyDeployer.deployProxyContract(
        proxyAdminAddress,
        bridgeContract,
        lnBridgeLogic.address,
        [dao, inbox],
        wallet);
    console.log("finish to deploy ln bridge proxy on ethereum, address:", lnBridgeProxy.address);
    return lnBridgeProxy.address;
}

async function deploy(arbitrumWallet, ethereumWallet) {
    const ethereumLnBridgeAddress = await deployLnSource(
        ethereumWallet,
        daoOnEthereum,
        inboxEthereumAddress,
        ethereumProxyAdmin
    );
    const arbitrumLnBridgeAddress = await deployLnTarget(
        arbitrumWallet,
        daoOnArbitrum,
        arbitrumProxyAdmin
    );

    const arbitrumLnBridge = await ethers.getContractAt("Eth2ArbTarget", arbitrumLnBridgeAddress, arbitrumWallet);
    const ethereumLnBridge = await ethers.getContractAt("Eth2ArbSource", ethereumLnBridgeAddress, ethereumWallet);
    await ethereumLnBridge.updateFeeReceiver(daoOnEthereum);
    await arbitrumLnBridge.setRemoteBridge(ethereumLnBridgeAddress);
    await ethereumLnBridge.setRemoteBridge(arbitrumLnBridgeAddress);

    // register special erc20 token
    // native token weth
    // we need replace this wring address by exist one
    const ringOnArbitrum = await ethers.getContractAt("Erc20", ringArbitrumAddress, arbitrumWallet);
    const ringOnEthereum = await ethers.getContractAt("Erc20", ringEthereumAddress, ethereumWallet);

    // register token
    await ethereumLnBridge.setTokenInfo(
        ringEthereumAddress,
        ringArbitrumAddress,
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
    await ringOnArbitrum.approve(arbitrumLnBridge.address, ethers.utils.parseEther("10000000"));
    await arbitrumLnBridge.depositProviderMargin(
        ringEthereumAddress,
        ringArbitrumAddress,
        ethers.utils.parseEther("1000"),
    );
    await arbitrumLnBridge.depositSlashFundReserve(
        ringEthereumAddress,
        ringArbitrumAddress,
        ethers.utils.parseEther("100"),
    );
    return {
        "LnBridgeOnArbitrum": arbitrumLnBridgeAddress,
        "LnBridgeOnEthereum": ethereumLnBridgeAddress,
    };
}

// 2. deploy mapping token factory
async function main() {
    const wallets = wallet();
    const arbitrumWallet = wallets[0];
    const ethereumWallet = wallets[1];

    /*
    const bridgeContract = await ethers.getContractFactory("Eth2ArbTarget", arbitrumWallet);
    const lnBridgeLogic = await bridgeContract.deploy();
    await lnBridgeLogic.deployed();
    console.log("finish to deploy ln source bridge logic, address: ", lnBridgeLogic.address);
    return;
    */
    //await getLnBridgeTargetInitData(arbitrumWallet, "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4", "0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f");
    //await getLnBridgeSourceInitData(arbitrumWallet, "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4");
    //return;

    /*
    const deployed = await deploy(arbitrumWallet, ethereumWallet);
    console.log(deployed);
    return;
    */
    
    const ethereumLnBridgeAddress = "0xcD86cf37a4Dc6f78B4899232E7dD1b5c8130EFDA";
    const arbitrumLnBridgeAddress = "0x4112c9d474951246fBC2B4D868D247e714698aE1";

    // update margin and fee
    /*
    const arbitrumLnBridge = await ethers.getContractAt("Eth2ArbTarget", arbitrumLnBridgeAddress, arbitrumWallet);
    await arbitrumLnBridge.depositSlashFundReserve(
        ringEthereumAddress,
        ringArbitrumAddress,
        ethers.utils.parseEther("100"),
    );
    return;
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

    const amount1 = ethers.utils.parseEther("30");
    
    // lock
    /*
    await transferAndLockMargin(
        ethereumWallet,
        ethereumLnBridgeAddress,
        ethereumWallet.address,
        ringEthereumAddress,
        ringArbitrumAddress,
        amount1,
        ethereumWallet.address,
        0,
    );
    console.log("transfer and lock margin 1 successed");
    return;
    */

    // relay
    // query: lastTransferId on arbitrum
    const lastTransferId = "0x8B500E2285E419B16C38634EFD51D4C276EEB3EDCAFC167DEB76499137873232";
    const timestamp = 1690514832;
    const expectedTransferId = "0x198B51E6BFE20CE224C577423D91DDC43EEB77DDC15C2348FB011C8C937BEFA1";

    /*
    await relay(
        arbitrumWallet,
        arbitrumLnBridgeAddress,
        arbitrumWallet.address,
        ringEthereumAddress,
        ringArbitrumAddress,
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
        ringEthereumAddress,
        ringArbitrumAddress,
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
        "0x198B51E6BFE20CE224C577423D91DDC43EEB77DDC15C2348FB011C8C937BEFA1", //lastTransferId
        ethereumWallet.address,
        ringEthereumAddress,
        ringArbitrumAddress,
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
    
/*
ethereumLnBridgeAddressLogic = 0xB78eA02970801506eE5333E9659eAe95a1ee5f80
ethereumLnBridgeAddressProxy = 0xcD86cf37a4Dc6f78B4899232E7dD1b5c8130EFDA
arbitrumLnBridgeAddressLogic = 0xC91aff6adA5e743Ae89589126AE4521eB2ec47f2
arbitrumLnBridgeAddressProxy = 0x4112c9d474951246fBC2B4D868D247e714698aE1
*/

