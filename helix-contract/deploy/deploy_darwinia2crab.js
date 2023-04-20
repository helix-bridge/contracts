var ProxyDeployer = require("./proxy.js");

const privateKey = process.env.PRIKEY
const precompileStorageAddress = "0x0000000000000000000000000000000000000400";
const precompileDispatchAddress = "0x0000000000000000000000000000000000000401";

const darwiniaNetwork = {
    url: "https://rpc.darwinia.network",
    networkId: "0x0000002e", //46
    bridgeNetworkId: "0x64617277", //darw
    transactCallIndex: 12289,//0x3001
    sendmsgIndex: 11267,//0x2C03
    outboundLaneId: "0x64616362",
    storageKeyForMarketFee: "0x190d00dd4103825c78f55e5b5dbf8bfe2edb70953213f33a6ef6b8a5e3ffcab2",
    storageKeyForLatestNonce: "0xf4e61b17ce395203fe0f3c53a0d3986096c246acb9b55077390e3ca723a0ca1f",
    storageKeyForLastDeliveredNonce: "0xf4e61b17ce395203fe0f3c53a0d39860e5f83cf83f2127eb47afdc35d6e43fab",
    specVersion: 1110,
};

const crabNetwork = {
    url: "https://crab-rpc.darwinia.network",
    networkId: "0x0000002c", //44
    bridgeNetworkId: "0x63726162", //crab
    transactCallIndex: 10499,//0x2903
    sendmsgIndex: 9728,//0x2600
    outboundLaneId: "0x64616362",
    storageKeyForMarketFee: "0xe0c938a0fbc88db6078b53e160c7c3ed2edb70953213f33a6ef6b8a5e3ffcab2",
    storageKeyForLatestNonce: "0xf1501030816118b9129255f5096aa9b296c246acb9b55077390e3ca723a0ca1f",
    storageKeyForLastDeliveredNonce: "0xf1501030816118b9129255f5096aa9b2e5f83cf83f2127eb47afdc35d6e43fab",
    specVersion: 1111,
};

const backingNetwork = darwiniaNetwork;
const mtfNetwork = crabNetwork;

// backing
const backingProvider = new ethers.providers.JsonRpcProvider(backingNetwork.url);
const backingWallet = new ethers.Wallet(privateKey, backingProvider);

// mapping token factory
const mtfProvider = new ethers.providers.JsonRpcProvider(mtfNetwork.url);
const mtfWallet = new ethers.Wallet(privateKey, mtfProvider);

async function deployMessageEndpoint(wallet, version, outboundLaneId, inboundLaneId) {
    const handleContract = await ethers.getContractFactory("DarwiniaSub2SubMessageEndpoint", wallet);
    const handle = await handleContract.deploy(version, outboundLaneId, inboundLaneId);
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
    const xweth = await ethers.getContractAt("Erc20", xwethAddress, mtfWallet);
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

async function deployEndpoints() {
    const backingMessageEndpoint = await deployMessageEndpoint(backingWallet, 2, backingNetwork.outboundLaneId, mtfNetwork.outboundLaneId);
    console.log("deploy backing message handle finished, address: ", backingMessageEndpoint.address);
    const mtfMessageEndpoint = await deployMessageEndpoint(mtfWallet, 2, mtfNetwork.outboundLaneId, backingNetwork.outboundLaneId);
    console.log("deploy mtf message handle finished, address: ", mtfMessageEndpoint.address);

    // configure message handle
    await backingMessageEndpoint.setRemoteHelix(mtfNetwork.bridgeNetworkId, mtfNetwork.networkId, mtfMessageEndpoint.address);
    await backingMessageEndpoint.setRemoteCallIndex(mtfNetwork.transactCallIndex);
    //await backingMessageEndpoint.setLocalAddress(precompileStorageAddress, precompileDispatchAddress);
    await backingMessageEndpoint.setLocalCallInfo(backingNetwork.sendmsgIndex);
    await backingMessageEndpoint.setLocalStorageKey(backingNetwork.storageKeyForMarketFee, backingNetwork.storageKeyForLatestNonce, backingNetwork.storageKeyForLastDeliveredNonce);
    console.log("finish configure backing message handle");

    await mtfMessageEndpoint.setRemoteHelix(backingNetwork.bridgeNetworkId, backingNetwork.networkId, backingMessageEndpoint.address);
    await mtfMessageEndpoint.setRemoteCallIndex(backingNetwork.transactCallIndex);
    //await mtfMessageEndpoint.setLocalAddress(precompileStorageAddress, precompileDispatchAddress);
    await mtfMessageEndpoint.setLocalCallInfo(mtfNetwork.sendmsgIndex);
    await mtfMessageEndpoint.setLocalStorageKey(mtfNetwork.storageKeyForMarketFee, mtfNetwork.storageKeyForLatestNonce, mtfNetwork.storageKeyForLastDeliveredNonce);
    console.log("finish configure mapping token factory message handle");
    return {
        'backingEndpoint': backingMessageEndpoint,
        'mtfEndpoint': mtfMessageEndpoint,
    };
}

async function deployBackingIssuing(backingEndpointAddress, mtfEndpointAddress) {
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
        [backingEndpointAddress],
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
        [mtfEndpointAddress],
        mtfWallet);
    console.log("finish to deploy mapping token factory proxy, address: ", mtfProxy.address);

    const backing = await ethers.getContractAt("Erc20Sub2SubBacking", backingProxy.address, backingWallet);
    await backing.setChainName("Darwinia Smart");
    await backing.setRemoteMappingTokenFactory(mtfProxy.address);
    console.log("finish to configure backing");

    const mtf = await ethers.getContractAt("Erc20Sub2SubMappingTokenFactory", mtfProxy.address, mtfWallet);
    await mtf.setRemoteBacking(backingProxy.address);
    console.log("finish to configure mapping token factory");
    return {
        backing: backing,
        mtf: mtf,
    }
}

async function registerNative() {
    const wethContract = await ethers.getContractFactory("WRING", backingWallet);
    const weth = await wethContract.deploy();
    await weth.deployed();
    console.log("weth address is ", weth.address);

    // register
    const gasLimit = 5000000;
    const dailyLimit = ethers.utils.parseEther("1000000");
    //const tx = await backing.callStatic.register(
    const tx = await backing.register(
        mtfNetwork.specVersion,
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
}

// 2. deploy mapping token factory
async function main() {
    const {backingEndpoint, mtfEndpoint} = await deployEndpoints();
    // deploy backing & mapping token factory
    // deploy erc20 logic
    const {backing, mtf} = await deployBackingIssuing(backingEndpoint.address, mtfEndpoint.address);
    
    const backingAddress = backing.address;
    const mtfAddress = mtf.address;
    // grant role
    await backingEndpoint.grantRole(await backingEndpoint.CALLER_ROLE(), backingAddress);
    await backingEndpoint.grantRole(await backingEndpoint.CALLEE_ROLE(), backingAddress);
    await mtfEndpoint.grantRole(await mtfEndpoint.CALLER_ROLE(), mtfAddress);
    await mtfEndpoint.grantRole(await mtfEndpoint.CALLEE_ROLE(), mtfAddress);
    await backing.grantRole(await backing.OPERATOR_ROLE(), backingWallet.address);
    console.log("grant role permission finished");

    // register special erc20 token
    //const backing = await ethers.getContractAt("Erc20Sub2SubBacking", "0x63359a0BB8eF1f6cD141761375D583eCefD5Ecfc", backingWallet);
    // native token weth
    //await registerNative();
    
    //await lockAndRemoteIssueNative(weth.address, backing.address, ethers.utils.parseEther("1.5"), backingWallet);

    /*
    // the deployed addresses
    const mtfAddress = "0x8738A64392b71617aF4C685d0E827855c741fDF7";
    const backingAddress = "0xF3c1444CD449bD66Ef6DA7CA6c3E7884840A3995";
    const wethAddress = "0xE7578598Aac020abFB918f33A20faD5B71d670b4";

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

/*
deploy backing message handle finished, address:  0x28AeB37CE74D67E981fd49328EcC9C0A09D27c04
deploy mtf message handle finished, address:  0x6Bc42892Cdb7429c2F5BBAEE3d17DFd3aB806afC
finish configure backing message handle
finish configure mapping token factory message handle
finish to deploy backing logic, address:  0x0C4c4b01E47Aa05f2c1CA801a619dFd221eC6d34
finish to deploy backing admin, address:  0x2f8EC2E769A6D393c60e05aAD3adf4a93C51aaF4
finish to deploy backing proxy, address:  0xdA2cDf09D82278C2b2ed0DEAc3bdad12c169405c
finish to deploy mapping token factory logic, address:  0xa0D29ba3b7BA7c143Ef0B4d9F896fB4A28D427b1
finish to deploy mapping token factory admin, address:  0x63B28311E7be0fd95Cd4f828e3a052096856fAEc
finish to deploy mapping token factory proxy, address:  0xE3B183154303bfBe32333Cc00e5728CD50e448Fd
finish to configure backing
finish to configure mapping token factory
grant role permission finished
*/
