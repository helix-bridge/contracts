var ProxyDeployer = require("./proxy.js");
const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');

const precompileStorageAddress = "0x0000000000000000000000000000000000000400";
const precompileDispatchAddress = "0x0000000000000000000000000000000000000401";

const crabNetworkId = "0x0000002c"; //44
const crabBridgeNetworkId = "0x63726162"; //crab
const crabTransactCallIndex = 10241;//0x2801
const crabSendmsgIndex = 12291;//0x3003
const crabOutboundLaneId = "0x00000000";
const crabStorageKeyForMarketFee = "0xe0c938a0fbc88db6078b53e160c7c3ed2edb70953213f33a6ef6b8a5e3ffcab2";
const crabStorageKeyForLatestNonce = "0xf1501030816118b9129255f5096aa9b296c246acb9b55077390e3ca723a0ca1f";
const crabStorageKeyForLastDeliveredNonce = "0xf1501030816118b9129255f5096aa9b2e5f83cf83f2127eb47afdc35d6e43fab";

const darwiniaNetworkId = "0x0000002e"; //46
const darwiniaBridgeNetworkId = "0x64617277"; //darw
const darwiniaTransactCallIndex = 12289;//0x3001
const darwiniaSendmsgIndex = 11267;//0x2C03
const darwiniaOutboundLaneId = "0x00000000";
const darwiniaStorageKeyForMarketFee = "0x190d00dd4103825c78f55e5b5dbf8bfe2edb70953213f33a6ef6b8a5e3ffcab2";
const darwiniaStorageKeyForLatestNonce = "0xf4e61b17ce395203fe0f3c53a0d3986096c246acb9b55077390e3ca723a0ca1f";
const darwiniaStorageKeyForLastDeliveredNonce = "0xf4e61b17ce395203fe0f3c53a0d39860e5f83cf83f2127eb47afdc35d6e43fab";

const WCrabAddress = "0x2D2b97EA380b0185e9fDF8271d1AFB5d2Bf18329";
const xWCrabAddress = "0x656567Eb75b765FC320783cc6EDd86bD854b2305";

const dao = "0xd2c7008400F54aA70Af01CF8C747a4473246593E";

const relayPrivateKey = "0x...";
const privateKey = "0x...";

async function deployMessageEndpoint(wallet) {
    const handleContract = await ethers.getContractFactory("DarwiniaSub2SubMessageEndpoint", wallet);
    const handle = await handleContract.deploy();
    await handle.deployed();
    return handle
}

async function lockAndRemoteIssuing(nonce, tokenIndex, bridgeAddress, wallet, amount, fee, remoteIssuingNative) {
    const bridge = await ethers.getContractAt("LpSub2SubBridge", bridgeAddress, wallet);
    //const tx = await bridge.callStatic.lockAndRemoteIssuing(
    const tx = await bridge.lockAndRemoteIssuing(
        nonce,
        wallet.address,
        amount,
        fee,
        tokenIndex,
        remoteIssuingNative,
        {
            gasLimit: 150000,
        }
    );
    //console.log(tx);
}

async function lockNativeAndRemoteIssue(nonce, bridgeAddress, wallet, amount, fee) {
    const bridge = await ethers.getContractAt("LpSub2SubBridge", bridgeAddress, wallet);
    //const tx = await bridge.callStatic.lockNativeAndRemoteIssuing(
    const tx = await bridge.lockNativeAndRemoteIssuing(
        amount,
        fee,
        wallet.address,
        nonce,
        false,
        {
            value: amount.add(fee),
            gasLimit: 120000
        },
    );
    //console.log(tx);
}

async function relay(nonce, token, sender, receiver, amount, sourceChainId, issuingNative, wallet, bridgeAddress) {
    const bridge = await ethers.getContractAt("LpSub2SubBridge", bridgeAddress, wallet);
    //const tx = await bridge.callStatic.relay(
    await bridge.relay(
        nonce,
        token,
        sender,
        receiver,
        amount,
        sourceChainId,
        issuingNative,
        {
            value: issuingNative ? amount : 0,
            gasLimit: 120000
        }
    );
    //console.log(tx);
}

function wait(ms) {
    return new Promise(resolve => setTimeout(() => resolve(), ms));
};

function wallet() {
    // crab
    const crabUrl = "https://crab-rpc.darwinia.network";
    const darwiniaUrl = "https://rpc.darwinia.network";

    const crabProvider = new ethers.providers.JsonRpcProvider(crabUrl);
    const crabWallet = new ethers.Wallet(privateKey, crabProvider);
    const darwiniaProvider = new ethers.providers.JsonRpcProvider(darwiniaUrl);
    const darwiniaWallet = new ethers.Wallet(privateKey, darwiniaProvider);

    const crabRelayWallet = new ethers.Wallet(relayPrivateKey, crabProvider);
    const darwiniaRelayWallet = new ethers.Wallet(relayPrivateKey, darwiniaProvider);

    return [crabWallet, darwiniaWallet, crabRelayWallet, darwiniaRelayWallet];
}

async function deploy(crabWallet, darwiniaWallet) {

    // deploy
    const crabMessageEndpoint = await deployMessageEndpoint(crabWallet);
    console.log("deploy crab message handle finished, address: ", crabMessageEndpoint.address);
    const darwiniaMessageEndpoint = await deployMessageEndpoint(darwiniaWallet);
    console.log("deploy darwinia message handle finished, address: ", darwiniaMessageEndpoint.address);

    // configure message handle
    await crabMessageEndpoint.setRemoteHelix(darwiniaBridgeNetworkId, darwiniaNetworkId, darwiniaMessageEndpoint.address);
    await crabMessageEndpoint.setRemoteCallIndex(darwiniaTransactCallIndex);
    await crabMessageEndpoint.setLocalAddress(precompileStorageAddress, precompileDispatchAddress);
    await crabMessageEndpoint.setLocalCallInfo(crabSendmsgIndex, crabOutboundLaneId, darwiniaOutboundLaneId);
    await crabMessageEndpoint.setLocalStorageKey(crabStorageKeyForMarketFee, crabStorageKeyForLatestNonce, crabStorageKeyForLastDeliveredNonce);
    console.log("finish configure crab message handle");
    await darwiniaMessageEndpoint.setRemoteHelix(crabBridgeNetworkId, crabNetworkId, crabMessageEndpoint.address);
    await darwiniaMessageEndpoint.setRemoteCallIndex(crabTransactCallIndex);
    await darwiniaMessageEndpoint.setLocalAddress(precompileStorageAddress, precompileDispatchAddress);
    await darwiniaMessageEndpoint.setLocalCallInfo(darwiniaSendmsgIndex, darwiniaOutboundLaneId, crabOutboundLaneId);
    await darwiniaMessageEndpoint.setLocalStorageKey(darwiniaStorageKeyForMarketFee, darwiniaStorageKeyForLatestNonce, darwiniaStorageKeyForLastDeliveredNonce);
    console.log("finish configure mapping token factory message handle");

    const crabLpBridgeContractLogic = await ethers.getContractFactory("LpSub2SubBridge", crabWallet);
    const crabLpBridgeLogic = await crabLpBridgeContractLogic.deploy();
    await crabLpBridgeLogic.deployed();
    console.log("finish to deploy crab lp bridge logic contract, address: ", crabLpBridgeLogic.address);

    const crabAdmin = await ProxyDeployer.deployProxyAdmin(crabWallet);
    console.log("finish to deploy crab lp bridge admin, address: ", crabAdmin.address);
    const crabProxy = await ProxyDeployer.deployProxyContract(
        crabAdmin.address,
        crabLpBridgeContractLogic,
        crabLpBridgeLogic.address,
        [crabMessageEndpoint.address, darwiniaMessageEndpoint.address, dao],
        crabWallet);
    console.log("finish to deploy crab lp bridge proxy, address: ", crabProxy.address);

    const darwiniaLpBridgeContractLogic = await ethers.getContractFactory("LpSub2SubBridge", darwiniaWallet);
    const darwiniaLpBridgeLogic = await darwiniaLpBridgeContractLogic.deploy();
    await darwiniaLpBridgeLogic.deployed();
    console.log("finish to deploy darwinia lp bridge logic, address: ", darwiniaLpBridgeLogic.address);

    const darwiniaAdmin = await ProxyDeployer.deployProxyAdmin(darwiniaWallet);
    console.log("finish to deploy darwinia lp bridge admin, address: ", darwiniaAdmin.address);
    const darwiniaProxy = await ProxyDeployer.deployProxyContract(
        darwiniaAdmin.address,
        darwiniaLpBridgeContractLogic,
        darwiniaLpBridgeLogic.address,
        [darwiniaMessageEndpoint.address, crabLpBridgeLogic.address, dao],
        darwiniaWallet);
    console.log("finish to deploy darwinia lp bridge proxy, address: ", darwiniaProxy.address);

    const crabLpBridge = await ethers.getContractAt("LpSub2SubBridge", crabProxy.address, crabWallet);
    console.log("finish to configure crab");

    const darwiniaLpBridge = await ethers.getContractAt("LpSub2SubBridge", darwiniaProxy.address, darwiniaWallet);
    console.log("finish to configure mapping token factory");

    await crabLpBridge.updateFeeReceiver(dao);
    await darwiniaLpBridge.updateFeeReceiver(dao);
    await crabLpBridge.setRemoteBridge(darwiniaLpBridge.address);
    await darwiniaLpBridge.setRemoteBridge(crabLpBridge.address);

    await crabMessageEndpoint.grantRole(await crabMessageEndpoint.CALLER_ROLE(), crabLpBridge.address);
    await crabMessageEndpoint.grantRole(await crabMessageEndpoint.CALLEE_ROLE(), crabLpBridge.address);
    await darwiniaMessageEndpoint.grantRole(await darwiniaMessageEndpoint.CALLER_ROLE(), darwiniaLpBridge.address);
    await darwiniaMessageEndpoint.grantRole(await darwiniaMessageEndpoint.CALLEE_ROLE(), darwiniaLpBridge.address);
    console.log("grant role permission finished");

    // register special erc20 token
    // register
    //const tx = await crab.callStatic.register(
    let tx = await crabLpBridge.registerToken(
        WCrabAddress, // local token address
        xWCrabAddress, // remote token address
        ethers.utils.parseEther("10"), // helix fee
        46, // remote chain id
        18, // local decimals
        18, // remote decimals
        false, // remote is native
    );
    await crabLpBridge.setwTokenIndex(0);
    console.log("transaction is ", tx);

    tx = await darwiniaLpBridge.registerToken(
        xWCrabAddress, // local token address
        WCrabAddress, // remote token address
        ethers.utils.parseEther("11"), // helix fee
        44, // remote chain id
        18, // local decimals
        18, // remote decimals
        true, // remote is native: wcrab is the remote wrapped native token
    );
    return {
        crabLpBridgeAddress: crabLpBridge.address,
        darwiniaLpBridgeAddress: darwiniaLpBridge.address,
    }
}

// 2. deploy mapping token factory
async function main() {
    const wallets = wallet();
    const crabWallet = wallets[0];
    const darwiniaWallet = wallets[1];
    const crabRelayWallet = wallets[2];
    const darwiniaRelayWallet = wallets[3];

    let timestamp = Date.now();

    //const deployed = await deploy(crabWallet, darwiniaWallet);
    //console.log(deployed);
    //return;
    const crabLpBridgeAddress = "0x566d9e2bD492d78d238e3150B7a0527b504A74e2";
    const darwiniaLpBridgeAddress = "0x25bD9707d42FBDEBB2a03D6F50ADD1F84dA18833";

    // lock wcrab and remote issue xwcrab
    const amount01 = ethers.utils.parseEther("1.004");
    const fee01 = ethers.utils.parseEther("13");
    console.log("lock 001", timestamp);
    const wcrab = await ethers.getContractAt("WToken", WCrabAddress, crabWallet);
    await wcrab.deposit({value: amount01.add(fee01)});
    await wcrab.approve(crabLpBridgeAddress, ethers.utils.parseEther("100000"));
    
    await lockAndRemoteIssuing(timestamp, 0, crabLpBridgeAddress, crabWallet, amount01, fee01, false);
    console.log("lock and remote issuing");

    const xwcrab = await ethers.getContractAt("Erc20", xWCrabAddress, darwiniaRelayWallet);
    await xwcrab.approve(darwiniaLpBridgeAddress, ethers.utils.parseEther("100000"));
    await relay(
        timestamp, // nonce
        xWCrabAddress, // token
        darwiniaWallet.address, // sender
        darwiniaWallet.address, // receiver
        amount01, // amount
        44, // sourceChainId
        false, // issuingNative
        darwiniaRelayWallet, // wallet
        darwiniaLpBridgeAddress); // bridgeAddress
    console.log("relay 001");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

/*
deploy crab message handle finished, address:  0xDC03582F4e8b49B9F3220C857b09dbd57aE817cC
deploy darwinia message handle finished, address:  0xffA1bC7A77E9778f3cAd03d10d3734198397DB76
finish configure crab message handle
finish configure mapping token factory message handle
finish to deploy crab lp bridge logic contract, address:  0x6387Db51f4E17Bb78cC471E343D36765bc3f98E9
finish to deploy crab lp bridge admin, address:  0x07ccf6373cABC15976628316Ac02aa41d938FD46
finish to deploy crab lp bridge proxy, address:  0x0f1Fd0E0963242715E63C5dC60F510aB85Ad3367
finish to deploy darwinia lp bridge logic, address:  0x9FA16146BA5b7d144927E46acd9ba143f7205Fc8
finish to deploy darwinia lp bridge admin, address:  0x8738A64392b71617aF4C685d0E827855c741fDF7
finish to deploy darwinia lp bridge proxy, address:  0xEf8868d2faE4e16882285BB1026df3D0398a48b7
*/
