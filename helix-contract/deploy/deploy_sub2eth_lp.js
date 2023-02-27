const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');

var ProxyDeployer = require("./proxy.js");

const privateKey = '0x...';
const relayPrivateKey = '0x...';
//const darwiniaUrl = "https://pangoro-rpc.darwinia.network";
const darwiniaUrl = "https://crab-rpc.darwinia.network";
//const backingUrl = "g2.pangoro-p2p.darwinia.network:9933";
//const mtfUrl = "https://eth-goerli.g.alchemy.com/v2/WerPq7On62-wy_ARssv291ZPg1TGR5vi";
const ethereumUrl = "https://rpc.ankr.com/eth_goerli";
const darwiniaSub2EthEndpointAddress = "0x528985686C6EC07B8D9f7BfB0dCFed9f74520b83";
const ethereumSub2EthEndpointAddress = "0x190304Fd18c7185637b055Cd91077374b49E2659";
const daoOnDarwinia = "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4";
const daoOnEthereum = "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4";
//const wringAddress = "0x46f01081e800BF47e43e7bAa6D98d45F6a0251E4";
const wringAddress = "0x2D2b97EA380b0185e9fDF8271d1AFB5d2Bf18329"; // wcrab
//const ringErc20Address = "0x046D07d53926318d1F06c2c2A0F26a4de83E26c4";
const ringErc20Address = "0xBfEa6c80Ef15165a906E843eAfa2cC0708ED1767";
//const darwiniaProxyAdmin = "0xF4aEF264D0e112D0bD1371278F39B3d80d1B4f8D";
const darwiniaProxyAdmin = "0xdA84D53Bb0e11016A0462a72Bd577368153a722F";
const ethereumProxyAdmin = "0x81E8220a2Ed7275982F59D316F02C2D301151F7C";
const darwiniaChainId = 44;
const ethereumChainId = 5;

function hash(
    nonce,
    issuingNative,
    remoteToken,
    sender,
    receiver,
    remoteAmount,
    localChainId,
    remoteChainId
) {
    return ethUtil.keccak256(
        abi.rawEncode(
            ['uint256','bool','address','address','address','uint112','uint64','uint64'],
            [ nonce,
                issuingNative,
                remoteToken,
                sender,
                receiver,
                ethers.utils.formatUnits(remoteAmount, 0),
                localChainId,
                remoteChainId
            ]
        )
    );

}

async function lockAndRemoteIssuing(nonce, tokenIndex, bridgeAddress, wallet, amount, fee, remoteIssuingNative) {
    const bridge = await ethers.getContractAt("LpSub2EthBridge", bridgeAddress, wallet);
    //const tx = await bridge.callStatic.lockAndRemoteIssuing(
    const tx = await bridge.lockAndRemoteIssuing(
        nonce,
        wallet.address,
        amount,
        fee,
        tokenIndex,
        remoteIssuingNative,
        {
            gasLimit: 120000,
        }
    );
    //console.log(tx);
}

async function lockAndRemoteIssueNative(nonce, bridgeAddress, wallet, amount, fee) {
    const bridge = await ethers.getContractAt("LpSub2EthBridge", bridgeAddress, wallet);
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
    const bridge = await ethers.getContractAt("LpSub2EthBridge", bridgeAddress, wallet);
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

function wallet() {
    const darwiniaProvider = new ethers.providers.JsonRpcProvider(darwiniaUrl);
    const darwiniaWallet = new ethers.Wallet(privateKey, darwiniaProvider);
    const darwiniaRelayWallet = new ethers.Wallet(relayPrivateKey, darwiniaProvider);
    const ethereumProvider = new ethers.providers.JsonRpcProvider(ethereumUrl);
    const ethereumWallet = new ethers.Wallet(privateKey, ethereumProvider);
    const ethereumRelayWallet = new ethers.Wallet(relayPrivateKey, ethereumProvider);
    return [darwiniaWallet, ethereumWallet, darwiniaRelayWallet, ethereumRelayWallet];
}

async function getLpBridgeInitData(wallet, localEndpoint, remoteEndpoint, dao) {
    const bridgeContract = await ethers.getContractFactory("LpSub2EthBridge", wallet);
    const initdata = await ProxyDeployer.getInitializerData(
        bridgeContract.interface,
        [localEndpoint, remoteEndpoint, dao],
        "initialize",
    );
    console.log("LpSub2EthBridge init data:", initdata);
}

async function deployLpBridge(wallet, localEndpoint, remoteEndpoint, dao, proxyAdminAddress) {
    const bridgeContract = await ethers.getContractFactory("LpSub2EthBridge", wallet);
    const lpBridgeLogic = await bridgeContract.deploy();
    await lpBridgeLogic.deployed();
    console.log("finish to deploy lp bridge logic, address: ", lpBridgeLogic.address);

    const lpBridgeProxy = await ProxyDeployer.deployProxyContract(
        proxyAdminAddress,
        bridgeContract,
        lpBridgeLogic.address,
        [localEndpoint, remoteEndpoint, dao],
        wallet);
    console.log("finish to deploy lp bridge proxy, address:", lpBridgeProxy.address);
    return lpBridgeProxy.address;
}

async function deploy(darwiniaWallet, ethereumWallet) {
    // deploy
    const darwiniaMessageEndpoint = await ethers.getContractAt("DarwiniaSub2EthMessageEndpoint", darwiniaSub2EthEndpointAddress, darwiniaWallet);
    const ethereumMessageEndpoint = await ethers.getContractAt("DarwiniaSub2EthMessageEndpoint", ethereumSub2EthEndpointAddress, ethereumWallet);

    const darwiniaLpBridgeAddress = await deployLpBridge(
        darwiniaWallet,
        darwiniaSub2EthEndpointAddress,
        ethereumSub2EthEndpointAddress,
        daoOnDarwinia,
        darwiniaProxyAdmin
    );
    const ethereumLpBridgeAddress = await deployLpBridge(
        ethereumWallet,
        ethereumSub2EthEndpointAddress,
        darwiniaSub2EthEndpointAddress,
        daoOnEthereum,
        ethereumProxyAdmin
    );

    const darwiniaLpBridge = await ethers.getContractAt("LpSub2EthBridge", darwiniaLpBridgeAddress, darwiniaWallet);
    const ethereumLpBridge = await ethers.getContractAt("LpSub2EthBridge", ethereumLpBridgeAddress, ethereumWallet);
    await darwiniaLpBridge.updateFeeReceiver(daoOnDarwinia);
    await ethereumLpBridge.updateFeeReceiver(daoOnEthereum);
    await darwiniaLpBridge.setRemoteBridge(ethereumLpBridgeAddress);
    await ethereumLpBridge.setRemoteBridge(darwiniaLpBridgeAddress);

    /***********
    await darwiniaMessageEndpoint.grantRole(await darwiniaMessageEndpoint.CALLER_ROLE(), darwiniaLpBridgeAddress);
    await darwiniaMessageEndpoint.grantRole(await darwiniaMessageEndpoint.CALLEE_ROLE(), darwiniaLpBridgeAddress);
    await ethereumMessageEndpoint.grantRole(await ethereumMessageEndpoint.CALLER_ROLE(), ethereumLpBridgeAddress);
    await ethereumMessageEndpoint.grantRole(await ethereumMessageEndpoint.CALLEE_ROLE(), ethereumLpBridgeAddress);
    ***********/

    // register special erc20 token
    // native token weth
    // we need replace this wring address by exist one
    const wring = await ethers.getContractAt("WToken", wringAddress, darwiniaWallet);
    const ringErc20 = await ethers.getContractAt("Erc20", ringErc20Address, ethereumWallet);

    // register
    await darwiniaLpBridge.registerToken(
        wringAddress,
        ringErc20Address,
        // helix fee
        200,
        // remote chain id
        ethereumChainId,
        18, // local decimals
        18, // remote decimals
        false
    );
    await darwiniaLpBridge.setwTokenIndex(0);
    await ethereumLpBridge.registerToken(
          ringErc20Address,
          wringAddress,
          // helix fee
          100,
          // remote chain id
          darwiniaChainId,
          18, // local decimals
          18, // remote decimals
          true
      );
}

// 2. deploy mapping token factory
async function main() {
    const wallets = wallet();
    const darwiniaWallet = wallets[0];
    const ethereumWallet = wallets[1];
    const darwiniaRelayWallet = wallets[2];
    const ethereumRelayWallet = wallets[3];

    //const deployed = await deploy(darwiniaWallet, ethereumWallet);
    //console.log(deployed);
    
    const bridgeOnDarwinia = "0x882Bd7aC70C4A4B1d6cE60a6366bC7cB87E0aA95";
    const bridgeOnEthereum = "0xDFF5f2360f88e6bbA7E90e79c57E07f1A9906F69";


    await getLpBridgeInitData(ethereumWallet, "0x9C80EdD342b5D179c3a87946fC1F0963BfcaAa09", "0x9bc1C7567DDBcaF2212185b6665D755d842d01E4", "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4");
    //await getLpBridgeInitData(ethereumWallet, "0x9bc1C7567DDBcaF2212185b6665D755d842d01E4", "0x9C80EdD342b5D179c3a87946fC1F0963BfcaAa09", "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4");
    return;

    //const wring = await ethers.getContractAt("WToken", wringAddress, darwiniaWallet);
    //await wring.deposit({value: ethers.utils.parseEther("10")});
    //await wring.approve(bridgeOnDarwinia, ethers.utils.parseEther("1000"));

    //const ringErc20 = await ethers.getContractAt("Erc20", ringErc20Address, ethereumWallet);
    //await ringErc20.approve(bridgeOnEthereum, ethers.utils.parseEther("10"));
    //const ringErc20Relayer = await ethers.getContractAt("Erc20", ringErc20Address, ethereumRelayWallet);
    //await ringErc20Relayer.approve(bridgeOnEthereum, ethers.utils.parseEther("10"));


    // lock on darwina, issuing on ethereum
    const amount1 = ethers.utils.parseEther("0.00110");
    const fee1 = ethers.utils.parseEther("0.00082");
    await lockAndRemoteIssuing(1, 0, bridgeOnDarwinia, darwiniaWallet, amount1, fee1, false);
    const h1 = hash(1, false, ringErc20Address, darwiniaWallet.address, darwiniaWallet.address, amount1, darwiniaChainId, ethereumChainId);
    console.log("h1", h1);
    console.log("lock and remote issuing 1 successed");

    // relay
    await relay(1, ringErc20Address, darwiniaWallet.address, darwiniaWallet.address, amount1, darwiniaChainId, false, ethereumRelayWallet, bridgeOnEthereum);
    console.log("relay 1 successed");

    const amount2 = ethers.utils.parseEther("0.00112");
    const fee2 = ethers.utils.parseEther("0.00083");
    await lockAndRemoteIssueNative(2, bridgeOnDarwinia, darwiniaWallet, amount2, fee2);
    console.log("lock and remote issuing 2 successed");
    const h2 = hash(2, false, ringErc20Address, darwiniaWallet.address, darwiniaWallet.address, amount2, darwiniaChainId, ethereumChainId);
    console.log("h2", h2);

    await relay(2, ringErc20Address, darwiniaWallet.address, darwiniaWallet.address, amount1, darwiniaChainId, false, ethereumRelayWallet, bridgeOnEthereum);
    console.log("relay 2 successed");

    // lock on etheruem issuing on darwinia
    const amounte1 = ethers.utils.parseEther("0.000017");
    const feee1 = ethers.utils.parseEther("0.00000082");
    await lockAndRemoteIssuing(1, 0, bridgeOnEthereum, ethereumWallet, amounte1, feee1, true);
    console.log("lock and remote issuing 1 successed");
    const he1 = hash(1, true, wringAddress, ethereumWallet.address, ethereumWallet.address, amounte1, ethereumChainId, darwiniaChainId);
    console.log("he1", he1);
    await relay(1, wringAddress, darwiniaWallet.address, darwiniaWallet.address, amounte1, ethereumChainId, true, darwiniaRelayWallet, bridgeOnDarwinia);
    console.log("relay 1 successed");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
    
