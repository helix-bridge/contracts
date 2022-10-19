var ProxyDeployer = require("./proxy.js");

// configure for pangolin
const precompileStorageAddress = "0x0000000000000000000000000000000000000400";
const precompileDispatchAddress = "0x0000000000000000000000000000000000000401";
const backingNetworkId = "0x0000002b"; //43
const backingBridgeNetworkId = "0x70677061";
const backingSendmsgIndex = 18179;//0x4703
const backingOutboundLaneId = "0x706c7061";//0x706c7061
const backingStorageKeyForMarketFee = "0xfb100650c3bdbe7b8ed495411b1951cc2edb70953213f33a6ef6b8a5e3ffcab2";
const backingStorageKeyForLatestNonce = "0x492db8fd8188abfb7e5eb22add55deb396c246acb9b55077390e3ca723a0ca1f";
const backingStorageKeyForLastDeliveredNonce = "0x492db8fd8188abfb7e5eb22add55deb3e5f83cf83f2127eb47afdc35d6e43fab";
const issuingTransactCallIndex = 6144; //0x1800
const issuingTransactFailedCallIndex = 6146; //0x1802

async function deployMessageEndpoint(wallet) {
    const handleContract = await ethers.getContractFactory("Darwinia2ParaMessageEndpoint", wallet);
    const handle = await handleContract.deploy();
    await handle.deployed();
    return handle
}

async function lockAndRemoteIssueNative(backingAddress, amount, wallet) {
    const backing = await ethers.getContractAt("NativeParachainBacking", backingAddress, wallet);
    //const tx = await backing.callStatic.lockAndRemoteIssuing(
    await backing.lockAndRemoteIssuing(
        5330,
        500000000,
        "0x922b6854052ba1084c74dd323ee70047d58ae4eb068f20bc251831f1ec109030",
        amount,
        { value: ethers.utils.parseEther("1100.0") });
    //console.log("tx is ", tx);
}

async function remoteIssuingFailure(backingAddress, nonce, wallet) {
    const backing = await ethers.getContractAt("NativeParachainBacking", backingAddress, wallet);
    //const tx = await backing.callStatic.lockAndRemoteIssuing(
    await backing.remoteIssuingFailure(
        5330,
        500000000,
        nonce,
        { value: ethers.utils.parseEther("300.0") });
    //console.log("tx is ", tx);
}

function wait(ms) {
    return new Promise(resolve => setTimeout(() => resolve(), ms));
};

function wallet() {
    const privateKey = '0x...';
    const backingUrl = "https://pangolin-rpc.darwinia.network";
    const backingProvider = new ethers.providers.JsonRpcProvider(backingUrl);
    const backingWallet = new ethers.Wallet(privateKey, backingProvider);
    return backingWallet;
}

async function deploy(backingWallet) {
    // deploy
    const backingMessageEndpoint = await deployMessageEndpoint(backingWallet);
    console.log("deploy backing message handle finished, address: ", backingMessageEndpoint.address);
    return;

    // configure message handle
    await backingMessageEndpoint.setLocalAddress(precompileStorageAddress, precompileDispatchAddress);
    await backingMessageEndpoint.setLocalCallInfo(backingSendmsgIndex, backingOutboundLaneId, backingOutboundLaneId);
    await backingMessageEndpoint.setLocalStorageKey(backingStorageKeyForMarketFee, backingStorageKeyForLatestNonce, backingStorageKeyForLastDeliveredNonce);
    await backingMessageEndpoint.setLocalChainId(backingBridgeNetworkId);
    console.log("finish configure backing message handle");

    const backingContractLogic = await ethers.getContractFactory("NativeParachainBacking", backingWallet);
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

    const backing = await ethers.getContractAt("NativeParachainBacking", backingProxy.address, backingWallet);
    await backing.setMessageEndpoint(backingMessageEndpoint.address);
    await backing.setRemoteIssuingIndex(issuingTransactCallIndex, issuingTransactFailedCallIndex);
    await backing.setPrunSize(1024);
    await backing.setAcceptNonceAllowSize(3);
    console.log("finish to configure backing");

    await backingMessageEndpoint.grantRole(await backingMessageEndpoint.CALLER_ROLE(), backing.address);
    await backing.grantRole(await backing.OPERATOR_ROLE(), "0x3fc22FAe77159D9253851f4c7fa99786DA041f43");
    console.log("grant role permission finished");
    console.log("deploy finished");
    return {
        endpoint: backingMessageEndpoint.address,
        backingLogic: backingLogic.address,
        backingAdmin: backingAdmin.address,
        backingProxy: backing.address,
    };
}

// 2. deploy mapping token factory
async function main() {
    const backingWallet = wallet();

    const deployedInfo = await deploy(backingWallet);
    console.log(deployedInfo);
    //const backingAddress = deployedInfo.backingProxy;
    //await lockAndRemoteIssueNative(backingAddress, ethers.utils.parseEther("1.5"), backingWallet);

    //const backingAddress = "0xA397326C07349Be2Ee9F7619c33BD1bAA92c74d2";
    //const backing = await ethers.getContractAt("NativeParachainBacking", backingAddress, backingWallet);
    //console.log(await backing.lockedMessages(20));
    //console.log(await backing.minReservedLockedMessageNonce());
    //const tx = await backing.callStatic.unlockFromRemote("0x3fc22FAe77159D9253851f4c7fa99786DA041f43", 10000000000, [], 1);
    //console.log(tx);
    //await lockAndRemoteIssueNative(backingAddress, ethers.utils.parseEther("100"), backingWallet);
    //await remoteIssuingFailure(backingAddress, 20, backingWallet);

    //const backingEndpointAddress = "0xB3d8CE1AFb76D045b121888658292B4BA4CCf8C3";
    //const backingEndpoint = await ethers.getContractAt("Darwinia2ParaMessageEndpoint", backingEndpointAddress, backingWallet);
    //const tx = await backingEndpoint.callStatic.recvMessage("0xc1031ea300000000000000000000000088a39b052d477cfde47600a7c9950a441ce61cb40000000000000000000000000000000000000000000000008ac7230489e80000000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000");
    //console.log(tx);
    //await backingEndpoint.setBacking("0xA397326C07349Be2Ee9F7619c33BD1bAA92c74d2");
    //console.log(await backingEndpoint.backing());

    //const backingContractLogic = await ethers.getContractFactory("NativeParachainBacking", backingWallet);
    //const backingLogic = await backingContractLogic.deploy();
    //await backingLogic.deployed();
    //console.log("finish to deploy backing logic, address: ", backingLogic.address);
    //const adminAddress = "0xa5a755d6b5f7ada18b71d2b7c042489b324a1901";
    //const admin = await ethers.getContractAt("ProxyAdmin", adminAddress, backingWallet);
    //await admin.upgrade("0xA397326C07349Be2Ee9F7619c33BD1bAA92c74d2", backingLogic.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
