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

async function deployxTokenProxy(wallet, salt, dao, proxyAdminAddress, logicAddress, deployer) {
    const bridgeContract = await ethers.getContractFactory("XTokenBridgeBase", wallet);
    const proxy = await ProxyDeployer.deployProxyContract2(
        deployer,
        salt,
        proxyAdminAddress,
        bridgeContract,
        logicAddress,
        [dao, salt],
        wallet,
        5000000
    );
    console.log("finish to deploy xtoken bridge proxy, address:", proxy);
    return proxy;
}

async function deploy() {
    const pathConfig = "./address/ln-dev.json";
    const configure = JSON.parse(
        fs.readFileSync(pathConfig, "utf8")
    );
    const network = configure.chains['sepolia'];
    const w = wallet(configure, network);

    const xTokenConfigPath = "./address/xtoken-dev.json";
    const xTokenConfig = JSON.parse(
        fs.readFileSync(xTokenConfigPath, "utf8")
    );

    //const backingLogic = xTokenConfig.backingLogic['pangolin'];
    //await deployxTokenProxy(w, "xtoken-backing-1.0.0", network.dao, configure.ProxyAdmin.others, backingLogic, network.deployer);
    const issuingLogic = xTokenConfig.issuingLogic['sepolia'];
    await deployxTokenProxy(w, "xtoken-issuing-1.0.0", network.dao, configure.ProxyAdmin.others, issuingLogic, network.deployer);
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
    
