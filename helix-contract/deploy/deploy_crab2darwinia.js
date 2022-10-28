
var ProxyDeployer = require("./proxy.js");

const precompileStorageAddress = "0x0000000000000000000000000000000000000400";
const precompileDispatchAddress = "0x0000000000000000000000000000000000000401";

const backingNetworkId = "0x0000002c"; //44
const backingBridgeNetworkId = "0x63726162"; //crab
const backingTransactCallIndex = 10241;//0x2801
const backingSendmsgIndex = 12291;//0x3003
const backingOutboundLaneId = "0x00000000";
const backingStorageKeyForMarketFee = "0xe0c938a0fbc88db6078b53e160c7c3ed2edb70953213f33a6ef6b8a5e3ffcab2";
const backingStorageKeyForLatestNonce = "0xf1501030816118b9129255f5096aa9b296c246acb9b55077390e3ca723a0ca1f";
const backingStorageKeyForLastDeliveredNonce = "0xf1501030816118b9129255f5096aa9b2e5f83cf83f2127eb47afdc35d6e43fab";

const mtfNetworkId = "0x0000002e"; //46
const mtfBridgeNetworkId = "0x64617277"; //darw
const mtfTransactCallIndex = 12289;//0x3001
const mtfSendmsgIndex = 11267;//0x2C03
const mtfOutboundLaneId = "0x00000000";
const mtfStorageKeyForMarketFee = "0x190d00dd4103825c78f55e5b5dbf8bfe2edb70953213f33a6ef6b8a5e3ffcab2";
const mtfStorageKeyForLatestNonce = "0xf4e61b17ce395203fe0f3c53a0d3986096c246acb9b55077390e3ca723a0ca1f";
const mtfStorageKeyForLastDeliveredNonce = "0xf4e61b17ce395203fe0f3c53a0d39860e5f83cf83f2127eb47afdc35d6e43fab";

async function deployMessageEndpoint(wallet) {
    const handleContract = await ethers.getContractFactory("DarwiniaSub2SubMessageEndpoint", wallet);
    const handle = await handleContract.deploy();
    await handle.deployed();
    return handle
}

async function lockAndRemoteIssueNative(wethAddress, backingAddress, amount, wallet) {
    const weth = await ethers.getContractAt("WToken", wethAddress, wallet);
    const backing = await ethers.getContractAt("Erc20Sub2SubBacking", backingAddress, wallet);
	await backing.lockAndRemoteIssuingNative(
        1243,
        1000000,
        wallet.address,
        amount,
        { value: ethers.utils.parseEther("235.0") });
}

async function burnAndRemoteUnlockNative(xwethAddress, mtfAddress, amount, wallet) {
    const xweth = await ethers.getContractAt("Erc20", xwethAddress, wallet);
    await xweth.approve(mtfAddress, amount);
    const mtf = await ethers.getContractAt("Erc20Sub2SubMappingTokenFactory", mtfAddress, wallet);
    //const tx = await mtf.callStatic.burnAndRemoteUnlockNative(
    return await mtf.burnAndRemoteUnlockNative(
        1240,
        1000000,
        wallet.address,
        amount,
        { value: ethers.utils.parseEther("40.1") });
    //console.log(tx);
}

async function remoteUnlockFailure(transferId, wethAddress, mtfAddress, amount, mtfWallet) {
    const mtf = await ethers.getContractAt("Erc20Sub2SubMappingTokenFactory", mtfAddress, mtfWallet);
    return await mtf.remoteUnlockFailure(
        28160,
        1000000,
        transferId,
        wethAddress,
        wallet.address,
        amount,
        { value: ethers.utils.parseEther("100.0") });
}

async function remoteIssuingFailure(transferId, xwethAddress, backingAddress, amount, wallet) {
    const backing = await ethers.getContractAt("Erc20Sub2SubBacking", backingAddress, wallet);
    return await backing.remoteIssuingFailure(
        1243,
        1000000,
        transferId,
        xwethAddress,
        wallet.address,
        amount,
        { value: ethers.utils.parseEther("235.0") });
}

function wait(ms) {
    return new Promise(resolve => setTimeout(() => resolve(), ms));
};

function wallet() {
    // backing
    const backingUrl = "https://crab-rpc.darwinia.network";
    const mtfUrl = "https://rpc.darwinia.network";
    const privateKey = '0x...';

    const backingProvider = new ethers.providers.JsonRpcProvider(backingUrl);
    const backingWallet = new ethers.Wallet(privateKey, backingProvider);

    // mapping token factory
    const mtfProvider = new ethers.providers.JsonRpcProvider(mtfUrl);
    const mtfWallet = new ethers.Wallet(privateKey, mtfProvider);
    return [backingWallet, mtfWallet];
}

async function deploy(backingWallet, mtfWallet) {

    // deploy
    const backingMessageEndpoint = await deployMessageEndpoint(backingWallet);
    console.log("deploy backing message handle finished, address: ", backingMessageEndpoint.address);
    const mtfMessageEndpoint = await deployMessageEndpoint(mtfWallet);
    console.log("deploy mtf message handle finished, address: ", mtfMessageEndpoint.address);

    // configure message handle
    await backingMessageEndpoint.setRemoteHelix(mtfBridgeNetworkId, mtfNetworkId, mtfMessageEndpoint.address);
    await backingMessageEndpoint.setRemoteCallIndex(mtfTransactCallIndex);
    await backingMessageEndpoint.setLocalAddress(precompileStorageAddress, precompileDispatchAddress);
    await backingMessageEndpoint.setLocalCallInfo(backingSendmsgIndex, backingOutboundLaneId, mtfOutboundLaneId);
    await backingMessageEndpoint.setLocalStorageKey(backingStorageKeyForMarketFee, backingStorageKeyForLatestNonce, backingStorageKeyForLastDeliveredNonce);
    console.log("finish configure backing message handle");
    await mtfMessageEndpoint.setRemoteHelix(backingBridgeNetworkId, backingNetworkId, backingMessageEndpoint.address);
    await mtfMessageEndpoint.setRemoteCallIndex(backingTransactCallIndex);
    await mtfMessageEndpoint.setLocalAddress(precompileStorageAddress, precompileDispatchAddress);
    await mtfMessageEndpoint.setLocalCallInfo(mtfSendmsgIndex, mtfOutboundLaneId, backingOutboundLaneId);
    await mtfMessageEndpoint.setLocalStorageKey(mtfStorageKeyForMarketFee, mtfStorageKeyForLatestNonce, mtfStorageKeyForLastDeliveredNonce);
    console.log("finish configure mapping token factory message handle");

    const backingContractLogic = await ethers.getContractFactory("Erc20Sub2SubBacking", backingWallet);
    const backingLogic = await backingContractLogic.deploy();
    await backingLogic.deployed();
    console.log("finish to deploy backing logic, address: ", backingLogic.address);

    const backingAdmin = await ProxyDeployer.deployProxyAdmin(backingWallet);
    console.log("finish to deploy backing admin, address: ", backingAdmin.address);
    const backingProxy = await ProxyDeployer.deployProxyContract(
        backingAdmin.address,
        backingContractLogic,
        backingLogic.address,
        [backingMessageEndpoint.address],
        backingWallet);
    console.log("finish to deploy backing proxy, address: ", backingProxy.address);

    const mtfContractLogic = await ethers.getContractFactory("Erc20Sub2SubMappingTokenFactory", mtfWallet);
    const mtfLogic = await mtfContractLogic.deploy();
    await mtfLogic.deployed();
    console.log("finish to deploy mapping token factory logic, address: ", mtfLogic.address);

    const mtfAdmin = await ProxyDeployer.deployProxyAdmin(mtfWallet);
    console.log("finish to deploy mapping token factory admin, address: ", mtfAdmin.address);
    const mtfProxy = await ProxyDeployer.deployProxyContract(
        mtfAdmin.address,
        mtfContractLogic,
        mtfLogic.address,
        [mtfMessageEndpoint.address],
        mtfWallet);
    console.log("finish to deploy mapping token factory proxy, address: ", mtfProxy.address);

    const backing = await ethers.getContractAt("Erc20Sub2SubBacking", backingProxy.address, backingWallet);
    await backing.setChainName("Crab Smart Chain");
    await backing.setRemoteMappingTokenFactory(mtfProxy.address);
    console.log("finish to configure backing");

    const mtf = await ethers.getContractAt("Erc20Sub2SubMappingTokenFactory", mtfProxy.address, mtfWallet);
    await mtf.setRemoteBacking(backingProxy.address);
    console.log("finish to configure mapping token factory");

    await backingMessageEndpoint.grantRole(await backingMessageEndpoint.CALLER_ROLE(), backing.address);
    await backingMessageEndpoint.grantRole(await backingMessageEndpoint.CALLEE_ROLE(), backing.address);
    await mtfMessageEndpoint.grantRole(await mtfMessageEndpoint.CALLER_ROLE(), mtf.address);
    await mtfMessageEndpoint.grantRole(await mtfMessageEndpoint.CALLEE_ROLE(), mtf.address);
    await backing.grantRole(await backing.OPERATOR_ROLE(), backingWallet.address);
    console.log("grant role permission finished");

    // register special erc20 token
    const WCrabAddress = "0x2D2b97EA380b0185e9fDF8271d1AFB5d2Bf18329";
    const weth = await ethers.getContractAt("WToken", WCrabAddress, backingWallet);

    await backing.setWToken(weth.address);

    // register
    const gasLimit = 5000000;
    const specVersion = 1243;
    const dailyLimit = ethers.utils.parseEther("10000000");
    //const tx = await backing.callStatic.register(
    const tx = await backing.register(
        specVersion,
        gasLimit,
        weth.address,
        "Wrapped Crab",
        "WCRAB",
        18,
        dailyLimit,
        { value: ethers.utils.parseEther("225.0") }
    );
    console.log("transaction is ", tx);

    // waiting for bridger to relay message
    while (true) {
        const tokenLength = await mtf.tokenLength();
        if (tokenLength > 0) {
            break;
        }
        await wait(3000);
        console.log("waiting bridger ...");
    }

    const xWcrab = await mtf.allMappingTokens(0);
    await mtf.setMappingNativeWrappedToken(xWcrab);

	return {
        crab2darwinia_sub2sub_darwinia: {
            messageEndpoint: mtfMessageEndpoint.address,
            mappingTokenFactoryLogic: mtfLogic.address,
            mappingTokenFactoryAdmin: mtfAdmin.address,
            mappingTokenFactoryProxy: mtf.address,
            xWCRAB: xWcrab,
        },
        crab2darwinia_sub2sub_crab: {
            messageEndpoint: backingMessageEndpoint.address,
            backingLogic: backingLogic.address,
            backingAdmin: backingAdmin.address,
            backingProxy: backing.address,
            WCRAB: WCrabAddress
        },
    }
}

// 2. deploy mapping token factory
async function main() {
    const wallets = wallet();
    const backingWallet = wallets[0];
    const mtfWallet = wallets[1];

    //const deployed = await deploy(backingWallet, mtfWallet);
    //console.log(deployed);

    //const mtfAddress = "0xc9454EAc2815cd7677Ca7f237e8aDB226676DDbA";
    //const backingAddress = "0xE0E888cA28738Fa2667b095d66bBAD15Fec5245E";
    //const wethAddress = "0x2D2b97EA380b0185e9fDF8271d1AFB5d2Bf18329";

    // 1. lock and remote issue
    //console.log(await mtf.tokenLength());
    //await lockAndRemoteIssueNative(wethAddress, backingAddress, ethers.utils.parseEther("1.3"), backingWallet);

    // 2. burn and remote unlock
    //const tx = await burnAndRemoteUnlockNative(await mtf.allMappingTokens(0), mtfAddress, ethers.utils.parseEther("0.4"), mtfWallet);
    //console.log(tx);

    // 3. failure test
    //const transferId = 670;
    //await remoteUnlockFailure(transferId, wethAddress, mtfAddress, ethers.utils.parseEther("1.3"), mtfWallet);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
