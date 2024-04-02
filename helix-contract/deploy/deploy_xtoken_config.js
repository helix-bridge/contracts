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
    backing: "0x24f8a04F0cA0730F4b8eC3241F15aCc6b3f8Da0a",
    guard: "0x4CA75992d2750BEC270731A72DfDedE6b9E71cC7",
    chainid: 43
};

const sepoliaNetwork = {
    name: "sepolia",
    url: "https://rpc-sepolia.rockx.com",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    messager: "0xf7F461728DC89de5EF6615715678b5f5b12bb98A",
    issuing: "0x1aeC008Af5c604be3525d0bB70fFcc4D7281f30C",
    guard: "0x4CA75992d2750BEC270731A72DfDedE6b9E71cC7",
    chainid: 11155111
};

const darwiniaNetwork = {
    name: "darwinia-dvm",
    url: "https://rpc.darwinia.network",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    messager: "0x65Be094765731F394bc6d9DF53bDF3376F1Fc8B0",
    backing: "0xa64D1c284280b22f921E7B2A55040C7bbfD4d9d0",
    issuing: "0xf6372ab2d35B32156A19F2d2F23FA6dDeFBE58bd",
    chainid: 46
};

const crabNetwork = {
    name: "crab-dvm",
    url: "https://crab-rpc.darwinia.network",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    messager: "0x65Be094765731F394bc6d9DF53bDF3376F1Fc8B0",
    backing: "0xa64D1c284280b22f921E7B2A55040C7bbfD4d9d0",
    issuing: "0xf6372ab2d35B32156A19F2d2F23FA6dDeFBE58bd",
    chainid: 44
};

function wallet(url) {
    const provider = new ethers.providers.JsonRpcProvider(url);
    const wallet = new ethers.Wallet(privateKey, provider);
    return wallet;
}

async function deploy() {
    const backingNetwork = crabNetwork;
    const issuingNetwork = darwiniaNetwork;
    const walletBacking = wallet(backingNetwork.url);
    const walletIssuing = wallet(issuingNetwork.url);

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
    
