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
    const env = 'product';
    const chain = 'darwinia-dvm';
    const pathConfig = `./address/ln-${env}.json`;
    const configure = JSON.parse(
        fs.readFileSync(pathConfig, "utf8")
    );
    const network = configure.chains[chain];
    const w = wallet(configure, network);

    const xTokenConfigPath = `./address/xtoken-${env}.json`;
    const xTokenConfig = JSON.parse(
        fs.readFileSync(xTokenConfigPath, "utf8")
    );

    const backingLogic = xTokenConfig.backingLogic[chain];
    await deployxTokenProxy(w, "xtoken-backing-3.0.2-ethereum", network.dao, configure.ProxyAdmin.others, backingLogic, network.deployer);
    //const issuingLogic = xTokenConfig.issuingLogic[chain];
    //await deployxTokenProxy(w, "xtoken-issuing-3.0.2", network.dao, configure.ProxyAdmin.others, issuingLogic, network.deployer);
    //0xa64D1c284280b22f921E7B2A55040C7bbfD4d9d0
    //0xf6372ab2d35B32156A19F2d2F23FA6dDeFBE58bd
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
    
