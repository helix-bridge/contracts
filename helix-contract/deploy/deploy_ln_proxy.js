const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');
const fs = require("fs");

var ProxyDeployer = require("./proxy.js");

const privateKey = process.env.PRIKEY

const lineaGoerliNetwork = {
    name: "linea-goerli",
    url: "https://rpc.goerli.linea.build",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
};

const arbitrumGoerliNetwork = {
    name: "arbitrum-goerli",
    url: "https://goerli-rollup.arbitrum.io/rpc",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
};

const goerliNetwork = {
    name: "goerli",
    url: "https://rpc.ankr.com/eth_goerli",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
};

const mantleGoerliNetwork = {
    name: "mantle-goerli",
    url: "https://rpc.testnet.mantle.xyz",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
};

function wallet(url) {
    const provider = new ethers.providers.JsonRpcProvider(url);
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

    const chains = [goerliNetwork, lineaGoerliNetwork, arbitrumGoerliNetwork, mantleGoerliNetwork];
    for (const chain of chains) {
        const w = wallet(chain.url);
        const proxyAdmin = configure.ProxyAdmin.others;
        const defaultLogicAddress = configure.LnDefaultBridgeLogic.others;
        const oppositeLogicAddress = configure.LnOppositeBridgeLogic;
        const deployer = configure.deployer;
        let proxyAddress = await deployLnDefaultBridgeProxy(
            w,
            "ln-default-v1.1.2",
            chain.dao,
            proxyAdmin,
            defaultLogicAddress,
            deployer,
        );
        console.log("deploy proxy success", proxyAddress);
        proxyAddress = await deployLnOppositeBridgeProxy(
            w,
            "ln-opposite-v1.1.2",
            chain.dao,
            proxyAdmin,
            oppositeLogicAddress,
            deployer,
        );
        console.log("deploy proxy success", proxyAddress);
    }
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
    
