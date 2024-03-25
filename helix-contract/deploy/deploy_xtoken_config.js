const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');
const fs = require("fs");

var ProxyDeployer = require("./proxy.js");

const privateKey = process.env.PRIKEY

const pangolinNetwork = {
    name: "pangolin",
    url: "https://pangolin-rpc.darwinia.network",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    messager: "0xf7F461728DC89de5EF6615715678b5f5b12bb98A",
    backing: "0x7E3105E3A13D55d824b6322cbD2049f098a097F6",
    guard: "0x4CA75992d2750BEC270731A72DfDedE6b9E71cC7",
    chainid: 43
};

const sepoliaNetwork = {
    name: "sepolia",
    url: "https://rpc-sepolia.rockx.com",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    messager: "0xf7F461728DC89de5EF6615715678b5f5b12bb98A",
    issuing: "0x3B36c2Db4CC5E92Af015Eb572A1C95C95599a8bF",
    guard: "0x4CA75992d2750BEC270731A72DfDedE6b9E71cC7",
    chainid: 11155111
};

function wallet(url) {
    const provider = new ethers.providers.JsonRpcProvider(url);
    const wallet = new ethers.Wallet(privateKey, provider);
    return wallet;
}

async function deploy() {
    const backingNetwork = pangolinNetwork;
    const issuingNetwork = sepoliaNetwork;
    const walletBacking = wallet(pangolinNetwork.url);
    const walletIssuing = wallet(sepoliaNetwork.url);

    // connect messager
    const backingMessager = await ethers.getContractAt("MsgportMessager", backingNetwork.messager, walletBacking);
    const issuingMessager = await ethers.getContractAt("MsgportMessager", issuingNetwork.messager, walletIssuing);
    await backingMessager.setRemoteMessager(issuingNetwork.chainid, issuingNetwork.chainid, issuingMessager.address, {gasLimit: 2000000});
    await issuingMessager.setRemoteMessager(backingNetwork.chainid, backingNetwork.chainid, backingMessager.address, {gasLimit: 2000000});
    console.log("connect messager successed");
    // xTokenBridge <> messager authorize
    const backing = await ethers.getContractAt("XTokenBacking", backingNetwork.backing, walletBacking);
    const issuing = await ethers.getContractAt("XTokenIssuing", issuingNetwork.issuing, walletIssuing);
    await backingMessager.setWhiteList(backing.address, true, {gasLimit: 2000000});
    await issuingMessager.setWhiteList(issuing.address, true, {gasLimit: 2000000});
    console.log("messager authorize xtoken bridge successed");

    await backing.setSendService(issuingNetwork.chainid, issuing.address, backingMessager.address, {gasLimit: 2000000});
    await backing.setReceiveService(issuingNetwork.chainid, issuing.address, backingMessager.address, {gasLimit: 2000000});
    await issuing.setSendService(backingNetwork.chainid, backing.address, issuingMessager.address, {gasLimit: 2000000});
    await issuing.setReceiveService(backingNetwork.chainid, backing.address, issuingMessager.address, {gasLimit: 2000000});
    console.log("xtoken bridge connect remote successed");

    // set guard
    const backingGuard = await ethers.getContractAt("GuardV3", backingNetwork.guard, walletBacking);
    const issuingGuard = await ethers.getContractAt("GuardV3", issuingNetwork.guard, walletIssuing);
    await backingGuard.setDepositor(backing.address, true);
    await issuingGuard.setDepositor(issuing.address, true);
    await backing.updateGuard(backingGuard.address);
    await issuing.updateGuard(issuingGuard.address);
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
    
