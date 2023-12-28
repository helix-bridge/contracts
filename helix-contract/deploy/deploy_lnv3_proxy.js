const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');
const fs = require("fs");

var ProxyDeployer = require("./proxy.js");

const privateKey = process.env.PRIKEY

const goerliNetwork = {
    name: "goerli",
    url: "https://rpc.ankr.com/eth_goerli",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
};

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
        [dao],
        wallet);
    console.log("finish to deploy lnv3 bridge proxy, address:", lnBridgeProxy);
    return lnBridgeProxy;
}

async function deploy() {
    // address path
    const pathConfig = "./address/ln-dev.json";
    const configure = JSON.parse(
        fs.readFileSync(pathConfig, "utf8")
    );

    const w = wallet(goerliNetwork.url);
    const proxyAdmin = configure.ProxyAdmin.others;
    const logicAddress = configure.LnV3BridgeLogic.others;
    const deployer = configure.deployer;
    let proxyAddress = await deployLnBridgeV3Proxy(
        w,
        "lnv3-v1.0.0",
        goerliNetwork.dao,
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
    
