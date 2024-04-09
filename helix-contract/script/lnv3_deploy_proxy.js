var ProxyDeployer = require("./api/proxy.js");
var Configure = require("./configure/readconfig.js");

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
    const chainInfo = Configure.chain('dev');
    const network = chainInfo['morph'];
    const w = wallet(network.url);
    const bridgeInfo = Configure.bridgeV3('dev');
    const logicAddress = bridgeInfo.logic['morph']??bridgeInfo.logic['others'];

    let proxyAddress = await deployLnBridgeV3Proxy(
        w,
        "lnv3-v1.0.0",
        network.dao,
        network.proxyAdmin,
        logicAddress,
        network.deployer,
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
    
