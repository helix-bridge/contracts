var ProxyDeployer = require("./proxy.js");

const privateKey = '0x...';

// configure for pangolin
const backingUrl = "https://pangolin-rpc.darwinia.network";
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
const remoteDerivedIssuingAddress = "0x960580d74341BFBC6b699d9135Ecf24886839C52";
// configure for pangolin end

async function deployMessageEndpoint(wallet) {
    const handleContract = await ethers.getContractFactory("Darwinia2ParaMessageEndpoint", wallet);
    const handle = await handleContract.deploy();
    await handle.deployed();
    return handle
}

async function lockAndRemoteIssueNative(backingAddress, amount, wallet) {
    const backing = await ethers.getContractAt("NativeParachainBacking", backingAddress, wallet);
    await backing.lockAndRemoteIssuing(
        5330,
        500000000,
        "0x922b6854052ba1084c74dd323ee70047d58ae4eb068f20bc251831f1ec109030",
        amount,
        { value: ethers.utils.parseEther("1000.0") });
}

async function remoteIssuingFailure(backingAddress, nonce, wallet) {
    const backing = await ethers.getContractAt("NativeParachainBacking", backingAddress, wallet);
    await backing.remoteIssuingFailure(
        5330,
        500000000,
        nonce,
        { value: ethers.utils.parseEther("1000.0") });
}

function wait(ms) {
    return new Promise(resolve => setTimeout(() => resolve(), ms));
};

function wallet() {
    const backingProvider = new ethers.providers.JsonRpcProvider(backingUrl);
    const backingWallet = new ethers.Wallet(privateKey, backingProvider);
    return backingWallet;
}

async function deploy(backingWallet) {
    // deploy
    const backingMessageEndpoint = await deployMessageEndpoint(backingWallet);
    console.log("deploy backing message endpoint finished, address: ", backingMessageEndpoint.address);

    // configure message handle
    await backingMessageEndpoint.setLocalAddress(precompileStorageAddress, precompileDispatchAddress);
    await backingMessageEndpoint.setLocalCallInfo(backingSendmsgIndex, backingOutboundLaneId, backingOutboundLaneId);
    await backingMessageEndpoint.setLocalStorageKey(backingStorageKeyForMarketFee, backingStorageKeyForLatestNonce, backingStorageKeyForLastDeliveredNonce);
    await backingMessageEndpoint.setLocalChainId(backingBridgeNetworkId);
    await backingMessageEndpoint.setRemoteDerivedIssuingAddress(remoteDerivedIssuingAddress);
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
    await backing.setAcceptNonceAllowSize(8192);
    console.log("finish to configure backing");

    await backingMessageEndpoint.grantRole(await backingMessageEndpoint.CALLER_ROLE(), backing.address);
    await backingMessageEndpoint.setBacking(backing.address);
    console.log("deploy finished");
    return {
        endpoint: backingMessageEndpoint.address,
        backingLogic: backingLogic.address,
        backingAdmin: backingAdmin.address,
        backingProxy: backing.address,
    };
}

// owner.address must be admin owner
async function redeployBacking(adminAddress, proxyAddress, backingWallet) {
    const backingContractLogic = await ethers.getContractFactory("NativeParachainBacking", backingWallet);
    const backingLogic = await backingContractLogic.deploy();
    await backingLogic.deployed();
    const admin = await ethers.getContractAt("ProxyAdmin", adminAddress, backingWallet);
    await admin.upgrade(proxyAddress, backingLogic.address);
}

async function main() {
    const backingWallet = wallet();

    // deploy
    const deployedInfo = await deploy(backingWallet);
    //console.log(deployedInfo);
    //const backingAddress = deployedInfo.backingProxy;

    // test
    //const backingAddress = "0x53309b52bdF480d77d0A463025D10307a89B86b6";
    //await lockAndRemoteIssueNative(backingAddress, ethers.utils.parseEther("1.5"), backingWallet);
    //await remoteIssuingFailure(backingAddress, 33, backingWallet);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

/*
 {
  endpoint: '0x0A9a7664364d537895F8B183b4496266CdE2e1C7',
  backingLogic: '0x3CE16F038caFB09187802Dd1FE3B3FB1E44f5807',
  backingAdmin: '0xD18eb4025a01F53e8399575B9352f210aFE22579',
  backingProxy: '0x53309b52bdF480d77d0A463025D10307a89B86b6'
}
*/
