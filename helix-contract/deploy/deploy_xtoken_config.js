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
    messager: "0xf85638B61E0425D6BB91981190B73246e3AF3CA9",
    backing: "0xbdC7bbF408931C5d666b4F0520E0D9E9A0B04e99",
    chainid: 44
};

const sepoliaNetwork = {
    name: "sepolia",
    url: "https://rpc-sepolia.rockx.com",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    messager: "0xc876D0873e4060472334E297b2db200Ca10cc806",
    issuing: "0xf22D0bb66b39745Ae6e3fEa3E5859d7f0b367Fd1",
    chainid: 11155111
};

function wallet(url) {
    const provider = new ethers.providers.JsonRpcProvider(url);
    const wallet = new ethers.Wallet(privateKey, provider);
    return wallet;
}

async function deploy() {
    const backingNetwork = crabNetwork;
    const issuingNetwork = sepoliaNetwork;
    const walletBacking = wallet(crabNetwork.url);
    const walletIssuing = wallet(sepoliaNetwork.url);

    // connect messager
    const backingMessager = await ethers.getContractAt("MsglineMessager", backingNetwork.messager, walletBacking);
    const issuingMessager = await ethers.getContractAt("MsglineMessager", issuingNetwork.messager, walletIssuing);
    await backingMessager.setRemoteMessager(issuingNetwork.chainid, issuingNetwork.chainid, issuingMessager.address, {gasLimit: 2000000});
    await issuingMessager.setRemoteMessager(backingNetwork.chainid, backingNetwork.chainid, backingMessager.address, {gasLimit: 2000000});
    console.log("connect messager successed");
    // xTokenBridge <> messager authorize
    const backing = await ethers.getContractAt("xTokenBacking", backingNetwork.backing, walletBacking);
    const issuing = await ethers.getContractAt("xTokenIssuing", issuingNetwork.issuing, walletIssuing);
    await backingMessager.setWhiteList(backing.address, true, {gasLimit: 2000000});
    await issuingMessager.setWhiteList(issuing.address, true, {gasLimit: 2000000});
    console.log("messager authorize xtoken bridge successed");

    await backing.setSendService(issuingNetwork.chainid, issuing.address, backingMessager.address, {gasLimit: 2000000});
    await backing.setReceiveService(issuingNetwork.chainid, issuing.address, backingMessager.address, {gasLimit: 2000000});
    await issuing.setSendService(backingNetwork.chainid, backing.address, issuingMessager.address, {gasLimit: 2000000});
    await issuing.setReceiveService(backingNetwork.chainid, backing.address, issuingMessager.address, {gasLimit: 2000000});
    console.log("xtoken bridge connect remote successed");
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
    
