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
    const bridge = await ethers.getContractAt("LnBridgeBacking", bridgeAddress, wallet);
    //const tx = await bridge.callStatic.lockAndRemoteIssuing(
    const tx = await bridge.lockAndRemoteIssuing(
        nonce,
        wallet.address,
        amount,
        fee,
        tokenIndex,
        remoteIssuingNative,
        //{
            //gasLimit: 150000,
            //gasPrice: 200000000,
        //}
    );
    console.log(tx);
}

async function lockAndRemoteIssueNative(nonce, bridgeAddress, wallet, amount, fee) {
    const bridge = await ethers.getContractAt("LnBridgeBacking", bridgeAddress, wallet);
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
    const bridge = await ethers.getContractAt("LnBridgeIssuing", bridgeAddress, wallet);
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
    const ethereumProvider = new ethers.providers.JsonRpcProvider(ethereumUrl);
    const ethereumWallet = new ethers.Wallet(privateKey, ethereumProvider);
    const arbitrumProvider = new ethers.providers.JsonRpcProvider(arbitrumUrl);
    const arbitrumWallet = new ethers.Wallet(privateKey, arbitrumProvider);
    return [arbitrumWallet, ethereumWallet];
}

async function getLnIssuingInitData(wallet, dao, inbox) {
    const bridgeContract = await ethers.getContractFactory("LnArbitrumL1Issuing", wallet);
    const initdata = await ProxyDeployer.getInitializerData(
        bridgeContract.interface,
        [dao, inbox],
        "initialize",
    );
    console.log("LpSub2EthBridge init data:", initdata);
}

async function getLnBackingInitData(wallet, dao) {
    const bridgeContract = await ethers.getContractFactory("LnArbitrumL2Backing", wallet);
    const initdata = await ProxyDeployer.getInitializerData(
        bridgeContract.interface,
        [dao],
        "initialize",
    );
    console.log("LpSub2EthBridge init data:", initdata);
}



async function deployLnBridgeL2Backing(wallet, dao, proxyAdminAddress) {
    const bridgeContract = await ethers.getContractFactory("LnArbitrumL2Backing", wallet);
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

async function deployLnBridgeL1Issuing(wallet, dao, inbox, proxyAdminAddress) {
    const bridgeContract = await ethers.getContractFactory("LnArbitrumL1Issuing", wallet);
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
    const arbitrumLnBridgeAddress = await deployLnBridgeL2Backing(
        arbitrumWallet,
        daoOnArbitrum,
        arbitrumProxyAdmin
    );
    const ethereumLnBridgeAddress = await deployLnBridgeL1Issuing(
        ethereumWallet,
        daoOnEthereum,
        inboxEthereumAddress,
        ethereumProxyAdmin
    );

    const arbitrumLnBridge = await ethers.getContractAt("LnArbitrumL2Backing", arbitrumLnBridgeAddress, arbitrumWallet);
    const ethereumLnBridge = await ethers.getContractAt("LnArbitrumL1Issuing", ethereumLnBridgeAddress, ethereumWallet);
    await arbitrumLnBridge.updateFeeReceiver(daoOnArbitrum);
    await arbitrumLnBridge.setRemoteBridge(ethereumLnBridgeAddress);
    await ethereumLnBridge.setRemoteBridge(arbitrumLnBridgeAddress);

    // register special erc20 token
    // native token weth
    // we need replace this wring address by exist one
    const ringOnArbitrum = await ethers.getContractAt("Erc20", ringArbitrumAddress, arbitrumWallet);
    const ringOnEthereum = await ethers.getContractAt("Erc20", ringEthereumAddress, ethereumWallet);

    // register
    await arbitrumLnBridge.registerToken(
        ringArbitrumAddress,
        ringEthereumAddress,
        // helix fee
        200,
        // remote chain id
        ethereumChainId,
        18, // local decimals
        18, // remote decimals
        false
    );
}

// 2. deploy mapping token factory
async function main() {
    const wallets = wallet();
    const arbitrumWallet = wallets[0];
    const ethereumWallet = wallets[1];

    const deployed = await deploy(arbitrumWallet, ethereumWallet);
    console.log(deployed);
    return;
    
    const arbitrumLnBridgeAddress = "0x89AF830781A2C1d3580Db930bea11094F55AfEae";
    const ethereumLnBridgeAddress = "0x3d33856dCf74f110690f5a2647C7dFb9BB5Ff2d0";

    const ringOnArbitrum = await ethers.getContractAt("Erc20", ringArbitrumAddress, arbitrumWallet);
    //await ringOnArbitrum.approve(arbitrumLnBridgeAddress, ethers.utils.parseEther("10000000"));
    const ringOnEthereum = await ethers.getContractAt("Erc20", ringEthereumAddress, ethereumWallet);
    //await ringOnEthereum.approve(ethereumLnBridgeAddress, ethers.utils.parseEther("10000000"));

    // lock on arbitrum, issuing on ethereum
    const amount1 = ethers.utils.parseEther("1000");
    const fee1 = ethers.utils.parseEther("500");
    const senderAddress = arbitrumWallet.address;
    await lockAndRemoteIssuing(5, 0, arbitrumLnBridgeAddress, arbitrumWallet, amount1, fee1, false);
    const h1 = hash(5, false, ringEthereumAddress, senderAddress, senderAddress, amount1, arbitrumChainId, ethereumChainId);
    console.log("h1", h1);
    console.log("lock and remote issuing 1 successed");

    // relay
    await relay(5, ringEthereumAddress, senderAddress, senderAddress, amount1, arbitrumChainId, false, ethereumWallet, ethereumLnBridgeAddress);
    console.log("relay 1 successed");

    const amount2 = ethers.utils.parseEther("2000");
    const fee2 = ethers.utils.parseEther("800");
    await lockAndRemoteIssuing(6, 0, arbitrumLnBridgeAddress, arbitrumWallet, amount2, fee2, false);
    console.log("lock and remote issuing 2 successed");
    const h2 = hash(6, false, ringEthereumAddress, senderAddress, senderAddress, amount2, arbitrumChainId, ethereumChainId);
    console.log("h2", h2);

    await relay(6, ringEthereumAddress, senderAddress, senderAddress, amount2, arbitrumChainId, false, ethereumWallet, ethereumLnBridgeAddress);
    console.log("relay 2 successed");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
    
/*
arbitrumLnBridgeAddressLogic = "0x463D1730a8527CA58d48EF70C7460B9920346567";
arbitrumLnBridgeAddressProxy = "0x89AF830781A2C1d3580Db930bea11094F55AfEae";
ethereumLnBridgeAddressLogic = "0xb3bDbDeA2c2cED40B8A2ee3994F1dc489e472760";
ethereumLnBridgeAddressProxy = "0x3d33856dCf74f110690f5a2647C7dFb9BB5Ff2d0";
*/
