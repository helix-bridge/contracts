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
    messager: "0xCAb1f69C671f1548fd3dE5d63852E9B9181a0D0E",
    backing: "0xb137BDf1Ad5392027832f54a4409685Ef52Aa9dA",
    chainid: 44
};

const sepoliaNetwork = {
    name: "sepolia",
    url: "https://rpc-sepolia.rockx.com",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    messager: "0x527B67a61C6E1344C359Af2e241aAFeb0c3a9DE9",
    issuing: "0x44A001aF6AcD2d5f5cB82FCB14Af3d497D56faB4",
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
    await backingMessager.setRemoteMessager(issuingNetwork.chainid, issuingNetwork.chainid, issuingMessager.address);
    await issuingMessager.setRemoteMessager(backingNetwork.chainid, backingNetwork.chainid, backingMessager.address);
    console.log("connect messager successed");
    // xTokenBridge <> messager authorize
    const backing = await ethers.getContractAt("xTokenBacking", backingNetwork.backing, walletBacking);
    const issuing = await ethers.getContractAt("xTokenIssuing", issuingNetwork.issuing, walletIssuing);
    await backingMessager.setWhiteList(backing.address, true);
    await issuingMessager.setWhiteList(issuing.address, true);
    console.log("messager authorize xtoken bridge successed");

    await backing.setSendService(issuingNetwork.chainid, issuing.address, backingMessager.address);
    await backing.setReceiveService(issuingNetwork.chainid, issuing.address, backingMessager.address);
    await issuing.setSendService(backingNetwork.chainid, backing.address, issuingMessager.address);
    await issuing.setReceiveService(backingNetwork.chainid, backing.address, issuingMessager.address);
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
    
