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

async function deployLnBridgeV3Proxy(wallet, salt, dao, blast, blastPoints, proxyAdminAddress, logicAddress, deployer) {
    const bridgeContract = await ethers.getContractFactory("HelixLnBridgeV3ForBlast", wallet);
    const lnBridgeProxy = await ProxyDeployer.deployProxyContract2(
        deployer,
        salt,
        proxyAdminAddress,
        bridgeContract,
        logicAddress,
        [dao, blast, blastPoints],
        wallet,
        //{ gasLimit: 8000000 }
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

    const network = configure.chains['blast-sepolia'];
    const w = wallet(network.url);
    const proxyAdmin = configure.ProxyAdmin['blast-sepolia'];
    const logicAddress = configure.LnV3BridgeLogic['blast-sepolia'];
    const deployer = network.deployer;
    let proxyAddress = await deployLnBridgeV3Proxy(
        w,
        "lnv3-v1.0.0",
        network.dao,
        network.blast,
        network.blastPoints,
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
    
