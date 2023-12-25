const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');
const fs = require("fs");

var ProxyDeployer = require("./proxy.js");

const privateKey = process.env.PRIKEY

const crabNetwork = {
    name: "crab",
    url: "https://crab-rpc.darwinia.network",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    proxyAdmin: "0xE3979fFa68BBa1F53c6F502c8F5788B370d28730",
    deployer: "0xbe6b2860d3c17a719be0A4911EA0EE689e8357f3",
};

const sepoliaNetwork = {
    name: "sepolia",
    url: "https://rpc-sepolia.rockx.com",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    proxyAdmin: "0xE3979fFa68BBa1F53c6F502c8F5788B370d28730",
    deployer: "0xbe6b2860d3c17a719be0A4911EA0EE689e8357f3",
};

function wallet(url) {
    const provider = new ethers.providers.JsonRpcProvider(url);
    const wallet = new ethers.Wallet(privateKey, provider);
    return wallet;
}

async function deployxTokenProxy(wallet, salt, dao, proxyAdminAddress, logicAddress, deployer) {
    const bridgeContract = await ethers.getContractFactory("xTokenBridgeBase", wallet);
    const proxy = await ProxyDeployer.deployProxyContract2(
        deployer,
        salt,
        proxyAdminAddress,
        bridgeContract,
        logicAddress,
        [dao, salt],
        wallet);
    console.log("finish to deploy xtoken bridge proxy, address:", proxy);
    return proxy;
}

async function deploy() {
    const walletCrab = wallet(crabNetwork.url);
    const backingLogic = "0x22E50D0511538B78D4E3b94d4D51AFDa924286D0";
    await deployxTokenProxy(walletCrab, "xtoken-backing-1.0.4", crabNetwork.dao, crabNetwork.proxyAdmin, backingLogic, crabNetwork.deployer);

    const walletSepolia = wallet(sepoliaNetwork.url);
    const issuingLogic = "0xCD1c1C799f3914ECFC5e3653D3Cc846355d3dFC9";
    await deployxTokenProxy(walletSepolia, "xtoken-issuing-1.0.4", sepoliaNetwork.dao, sepoliaNetwork.proxyAdmin, issuingLogic, sepoliaNetwork.deployer);
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
    
