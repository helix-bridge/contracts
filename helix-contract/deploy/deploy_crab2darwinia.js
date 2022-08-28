var ProxyDeployer = require("./proxy.js");

async function deployMessageEndpoint(wallet) {
    const handleContract = await ethers.getContractFactory("DarwiniaSub2SubMessageEndpoint", wallet);
    const handle = await handleContract.deploy();
    await handle.deployed();
    return handle
}

async function lockAndRemoteIssueNative(wethAddress, backingAddress, amount, wallet) {
    const weth = await ethers.getContractAt("WRING", wethAddress, wallet);
    await weth.deposit({value: amount});
    await weth.approve(backingAddress, amount);
    const backing = await ethers.getContractAt("Erc20Sub2SubBacking", backingAddress, wallet);
    await backing.lockAndRemoteIssuing(
        1232,
        1000000,
        wethAddress,
        "0x3fc22FAe77159D9253851f4c7fa99786DA041f43",
        amount,
        { value: ethers.utils.parseEther("39.0") });
}

async function burnAndRemoteUnlockNative(xwethAddress, mtfAddress, amount, mtfWallet) {
    const xweth = await ethers.getContractAt("MappingERC20", xwethAddress, mtfWallet);
    await xweth.approve(mtfAddress, amount);
    const mtf = await ethers.getContractAt("Erc20Sub2SubMappingTokenFactory", mtfAddress, mtfWallet);
    return await mtf.burnAndRemoteUnlock(
        28160,
        1000000,
        xwethAddress,
        "0x3fc22FAe77159D9253851f4c7fa99786DA041f43",
        amount,
        { value: ethers.utils.parseEther("100.0") });
}

async function remoteUnlockFailure(transferId, wethAddress, mtfAddress, amount, mtfWallet) {
    const mtf = await ethers.getContractAt("Erc20Sub2SubMappingTokenFactory", mtfAddress, mtfWallet);
    return await mtf.remoteUnlockFailure(
        28160,
        1000000,
        transferId,
        wethAddress,
        "0x3fc22FAe77159D9253851f4c7fa99786DA041f43",
        amount,
        { value: ethers.utils.parseEther("100.0") });
}

function wait(ms) {
    return new Promise(resolve => setTimeout(() => resolve(), ms));
};

// 2. deploy mapping token factory
async function main() {
    const privateKey = '0x123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0';
    const precompileStorageAddress = "0x0000000000000000000000000000000000000400";
    const precompileDispatchAddress = "0x0000000000000000000000000000000000000401";

    const backingUrl = "https://rpc.darwinia.network";
    const backingNetworkId = "0x0000002e"; //46
    const backingBridgeNetworkId = "0x64617277"; //darw
    const backingTransactCallIndex = 12289;//0x3001
    const backingSendmsgIndex = 11267;//0x2C03
    const backingOutboundLaneId = "0x00000000";
    const backingStorageKeyForMarketFee = "0x190d00dd4103825c78f55e5b5dbf8bfe2edb70953213f33a6ef6b8a5e3ffcab2";
    const backingStorageKeyForLatestNonce = "0xf4e61b17ce395203fe0f3c53a0d3986096c246acb9b55077390e3ca723a0ca1f";
    const backingStorageKeyForLastDeliveredNonce = "0xf4e61b17ce395203fe0f3c53a0d39860e5f83cf83f2127eb47afdc35d6e43fab";

    const mtfUrl = "https://crab-rpc.darwinia.network";
    const mtfNetworkId = "0x0000002c"; //44
    const mtfBridgeNetworkId = "0x63726162"; //crab
    const mtfTransactCallIndex = 10241;//0x2801
    const mtfSendmsgIndex = 12291;//0x3003
    const mtfOutboundLaneId = "0x00000000";
    const mtfStorageKeyForMarketFee = "0xe0c938a0fbc88db6078b53e160c7c3ed2edb70953213f33a6ef6b8a5e3ffcab2";
    const mtfStorageKeyForLatestNonce = "0xf1501030816118b9129255f5096aa9b296c246acb9b55077390e3ca723a0ca1f";
    const mtfStorageKeyForLastDeliveredNonce = "0xf1501030816118b9129255f5096aa9b2e5f83cf83f2127eb47afdc35d6e43fab";

    // backing
    const backingProvider = new ethers.providers.JsonRpcProvider(backingUrl);
    const backingWallet = new ethers.Wallet(privateKey, backingProvider);

    // mapping token factory
    const mtfProvider = new ethers.providers.JsonRpcProvider(mtfUrl);
    const mtfWallet = new ethers.Wallet(privateKey, mtfProvider);

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

    // deploy backing & mapping token factory
    // deploy erc20 logic
    const erc20Contract = await ethers.getContractFactory("MappingERC20", mtfWallet);
    const mappingTokenLogic = await erc20Contract.deploy();
    await mappingTokenLogic.deployed();
    console.log("finish to deploy mapping token logic, address: ", mappingTokenLogic.address);

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
    await backing.setChainName("Darwinia");
    await backing.setRemoteMappingTokenFactory(mtfProxy.address);
    console.log("finish to configure backing");

    const mtf = await ethers.getContractAt("Erc20Sub2SubMappingTokenFactory", mtfProxy.address, mtfWallet);
    await mtf.setRemoteBacking(backingProxy.address);
    await mtf.setTokenContractLogic(0, mappingTokenLogic.address);
    await mtf.setTokenContractLogic(1, mappingTokenLogic.address);
    console.log("finish to configure mapping token factory");

    await backingMessageEndpoint.grantRole(await backingMessageEndpoint.CALLER_ROLE(), backing.address);
    await backingMessageEndpoint.grantRole(await backingMessageEndpoint.CALLEREE_ROLE(), backing.address);
    await mtfMessageEndpoint.grantRole(await mtfMessageEndpoint.CALLER_ROLE(), mtf.address);
    await mtfMessageEndpoint.grantRole(await mtfMessageEndpoint.CALLEREE_ROLE(), mtf.address);
    await backing.grantRole(await backing.OPERATOR_ROLE(), "0x3fc22FAe77159D9253851f4c7fa99786DA041f43");
    console.log("grant role permission finished");

    // register special erc20 token
    //const backing = await ethers.getContractAt("Erc20Sub2SubBacking", "0x63359a0BB8eF1f6cD141761375D583eCefD5Ecfc", backingWallet);
    // native token weth
    const wethContract = await ethers.getContractFactory("WRING", backingWallet);
    const weth = await wethContract.deploy();
    await weth.deployed();
    console.log("weth address is ", weth.address);

    // register
    const gasLimit = 5000000;
    const specVersion = 1232;
    const dailyLimit = ethers.utils.parseEther("1000000");
    //const tx = await backing.callStatic.register(
    const tx = await backing.register(
        specVersion,
        gasLimit,
        weth.address,
        "Wrapped Ring",
        "WRING",
        18,
        dailyLimit,
        { value: ethers.utils.parseEther("39.0") }
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
    //await lockAndRemoteIssueNative(weth.address, backing.address, ethers.utils.parseEther("1.5"), backingWallet);

    // the deployed addresses
    /*
    const mtfAddress = "0x0793e2726360224dA8cf781c048dF7acCa3Bb049";
    const backingAddress = "0x91Cdd894aD5cC203A026115B33e30670E5166504";
    const wethAddress = "0x78f3B1ae818c304Bbec76e244B67dEdC70506006";

    // 1. lock and remote issue
    const mtf = await ethers.getContractAt("Erc20Sub2SubMappingTokenFactory", mtfAddress, mtfWallet);
    await lockAndRemoteIssueNative(wethAddress, backingAddress, ethers.utils.parseEther("1.3"), backingWallet);

    // 2. burn and remote unlock
    const tx = await burnAndRemoteUnlockNative(await mtf.allMappingTokens(0), mtfAddress, ethers.utils.parseEther("1.3"), mtfWallet);
    await burnAndRemoteUnlockNative(await mtf.allMappingTokens(0), mtfAddress, ethers.utils.parseEther("1.3"), mtfWallet);
    await burnAndRemoteUnlockNative(await mtf.allMappingTokens(0), mtfAddress, ethers.utils.parseEther("1.3"), mtfWallet);
    await burnAndRemoteUnlockNative(await mtf.allMappingTokens(0), mtfAddress, ethers.utils.parseEther("1.3"), mtfWallet);
    console.log(tx);
    //const weth = await ethers.getContractAt("WRING", wethAddress, backingWallet);
    //await weth.deposit({value: ethers.utils.parseEther("100")});
    const mtf = await ethers.getContractAt("Erc20Sub2SubMappingTokenFactory", mtfAddress, mtfWallet);
    console.log(await mtf.fee());
    */

    //const transferId = "0x726f6c69000000000000009e";
    //await remoteUnlockFailure(transferId, wethAddress, mtfAddress, ethers.utils.parseEther("1.3"), mtfWallet);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
