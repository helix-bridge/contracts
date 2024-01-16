const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');
const fs = require("fs");

var ProxyDeployer = require("./proxy.js");

const privateKey = process.env.PRIKEY

function wallet(configure, network) {
    const provider = new ethers.providers.JsonRpcProvider(network.url);
    const wallet = new ethers.Wallet(privateKey, provider);
    return wallet;
}

async function deployLnDefaultBridgeProxy(wallet, salt, dao, proxyAdminAddress, logicAddress, deployer) {
    const bridgeContract = await ethers.getContractFactory("LnDefaultBridge", wallet);
    const lnBridgeProxy = await ProxyDeployer.deployProxyContract2(
        deployer,
        salt,
        proxyAdminAddress,
        bridgeContract,
        logicAddress,
        [dao],
        wallet);
    console.log("finish to deploy ln default bridge proxy, address:", lnBridgeProxy);
    return lnBridgeProxy;
}

async function deployLnOppositeBridgeProxy(wallet, salt, dao, proxyAdminAddress, logicAddress, deployer) {
    const bridgeContract = await ethers.getContractFactory("LnOppositeBridge", wallet);
    const lnBridgeProxy = await ProxyDeployer.deployProxyContract2(
        deployer,
        salt,
        proxyAdminAddress,
        bridgeContract,
        logicAddress,
        [dao],
        wallet);
    console.log("finish to deploy ln opposite bridge proxy, address:", lnBridgeProxy);
    return lnBridgeProxy;
}

async function deploy() {
    // address path
    const pathConfig = "./address/ln-dev.json";
    const configure = JSON.parse(
        fs.readFileSync(pathConfig, "utf8")
    );

    const network = configure.chains['arbitrum-sepolia'];
    const w = wallet(configure, network);

    const proxyAdmin = configure.ProxyAdmin.others;
    const defaultLogicAddress = configure.LnDefaultBridgeLogic.others;
    const oppositeLogicAddress = configure.LnOppositeBridgeLogic;
    const deployer = configure.deployer;
    //let proxyAddress = await deployLnDefaultBridgeProxy(w, "lnv2-default-v1.0.0", network.dao, proxyAdmin, defaultLogicAddress, deployer);
    let proxyAddress = await deployLnOppositeBridgeProxy(w, "lnv2-opposite-v1.0.0", network.dao, proxyAdmin, oppositeLogicAddress, deployer);
    console.log("deploy proxy success", proxyAddress);
}

async function main() {
    await deploy();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
    
