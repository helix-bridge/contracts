const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');

var ProxyDeployer = require("./proxy.js");

const privateKey = process.env.PRIKEY

const lineaNetwork = {
    url: "https://rpc.goerli.linea.build",
    proxyAdmin: "0xE3979fFa68BBa1F53c6F502c8F5788B370d28730",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    defaultLogicAddress: "0x43ae847d170e8AB26901a80b474d356Aaa30CEE1",
    oppositeLogicAddress: "0xdE4667Fa1Db7a73914d13aF664933a027e5F9f54",
    deployer: "0xbe6b2860d3c17a719be0A4911EA0EE689e8357f3",
};

const arbitrumNetwork = {
    url: "https://goerli-rollup.arbitrum.io/rpc",
    proxyAdmin: "0xE3979fFa68BBa1F53c6F502c8F5788B370d28730",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    defaultLogicAddress: "0x43ae847d170e8AB26901a80b474d356Aaa30CEE1",
    oppositeLogicAddress: "0xdE4667Fa1Db7a73914d13aF664933a027e5F9f54",
    deployer: "0xbe6b2860d3c17a719be0A4911EA0EE689e8357f3",
};

const goerliNetwork = {
    url: "https://rpc.ankr.com/eth_goerli",
    proxyAdmin: "0xE3979fFa68BBa1F53c6F502c8F5788B370d28730",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    defaultLogicAddress: "0x43ae847d170e8AB26901a80b474d356Aaa30CEE1",
    oppositeLogicAddress: "0xdE4667Fa1Db7a73914d13aF664933a027e5F9f54",
    deployer: "0xbe6b2860d3c17a719be0A4911EA0EE689e8357f3",
};

const mantleNetwork = {
    url: "https://rpc.testnet.mantle.xyz",
    proxyAdmin: "0xE3979fFa68BBa1F53c6F502c8F5788B370d28730",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    defaultLogicAddress: "0x43ae847d170e8AB26901a80b474d356Aaa30CEE1",
    oppositeLogicAddress: "0xdE4667Fa1Db7a73914d13aF664933a027e5F9f54",
    deployer: "0xbe6b2860d3c17a719be0A4911EA0EE689e8357f3",
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
    const chains = [goerliNetwork, lineaNetwork, arbitrumNetwork, mantleNetwork];
    for (const chain of chains) {
        const w = wallet(chain.url);
        /*
        const proxyAddress = await deployLnDefaultBridgeProxy(
            w,
            "ln-default-v1.0.1",
            chain.dao,
            chain.proxyAdmin,
            chain.defaultLogicAddress,
            chain.deployer,
        );
        */
        const proxyAddress = await deployLnOppositeBridgeProxy(
            w,
            "ln-opposite-v1.0.1",
            chain.dao,
            chain.proxyAdmin,
            chain.oppositeLogicAddress,
            chain.deployer,
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
    
