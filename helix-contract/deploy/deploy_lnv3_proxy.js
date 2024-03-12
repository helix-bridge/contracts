const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');
const fs = require("fs");

var ProxyDeployer = require("./proxy.js");

const privateKey = process.env.PRIKEY

function wallet(url) {
    const provider = new ethers.providers.JsonRpcProvider(url);
    const wallet = new ethers.Wallet(privateKey, provider);
    return wallet;
}

async function deployLnBridgeV3Proxy(wallet, salt, dao, proxyAdminAddress, logicAddress, deployer) {
    const bridgeContract = await ethers.getContractFactory("HelixLnBridgeV3", wallet);
    const lnBridgeProxy = await ProxyDeployer.deployProxyContract2(
        deployer,
        salt,
        proxyAdminAddress,
        bridgeContract,
        logicAddress,
        [dao, '0x'],
        wallet,
        //{ gasLimit: 5000000 }
    );
    console.log("finish to deploy lnv3 bridge proxy, address:", lnBridgeProxy);
    return lnBridgeProxy;
}

async function deploy() {
    // address path
    const pathConfig = "./address/ln-dev.json";
    const configure = JSON.parse(
        fs.readFileSync(pathConfig, "utf8")
    );

    const network = configure.chains['bera'];
    const w = wallet(network.url);
    const proxyAdmin = configure.ProxyAdmin.taiko;
    const logicAddress = configure.LnV3BridgeLogic.taiko;
    const deployer = network.deployer;
    let proxyAddress = await deployLnBridgeV3Proxy(
        w,
        "lnv3-v1.0.0",
        network.dao,
        proxyAdmin,
        logicAddress,
        deployer,
    );
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
    
