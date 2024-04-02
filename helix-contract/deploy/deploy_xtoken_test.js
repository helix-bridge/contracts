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
    backing: "0x24f8a04F0cA0730F4b8eC3241F15aCc6b3f8Da0a",
    wtoken: "0x617E55f692FA2feFfdD5D9C513782A479cC1FF57",
    chainid: 43
};

const sepoliaNetwork = {
    name: "sepolia",
    url: "https://1rpc.io/sepolia",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    issuing: "0x1aeC008Af5c604be3525d0bB70fFcc4D7281f30C",
    xwtoken: "0x3beb2cf5c2c050bc575350671aa5f06e589386e8",
    chainid: 11155111
};

const darwiniaNetwork = {
    name: "darwinia-dvm",
    url: "https://rpc.darwinia.network",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    messager: "0x65Be094765731F394bc6d9DF53bDF3376F1Fc8B0",
    backing: "0xa64D1c284280b22f921E7B2A55040C7bbfD4d9d0",
    issuing: "0xf6372ab2d35B32156A19F2d2F23FA6dDeFBE58bd",
    wtoken: "0xE7578598Aac020abFB918f33A20faD5B71d670b4",
    xwtoken: "0x656567Eb75b765FC320783cc6EDd86bD854b2305",
    wtokenConvertor: "0xA8d0E9a45249Ec839C397fa0F371f5F64eCAB7F7",
    chainid: 46
};

const crabNetwork = {
    name: "crab-dvm",
    url: "https://crab-rpc.darwinia.network",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    messager: "0x65Be094765731F394bc6d9DF53bDF3376F1Fc8B0",
    backing: "0xa64D1c284280b22f921E7B2A55040C7bbfD4d9d0",
    issuing: "0xf6372ab2d35B32156A19F2d2F23FA6dDeFBE58bd",
    wtoken: "0x2D2b97EA380b0185e9fDF8271d1AFB5d2Bf18329",
    xwtoken: "0x273131F7CB50ac002BDd08cA721988731F7e1092",
    wtokenConvertor: "0x004D0dE211BC148c3Ce696C51Cbc85BD421727E9",
    chainid: 44
};

function wallet(url) {
    const provider = new ethers.providers.JsonRpcProvider(url);
    const wallet = new ethers.Wallet(privateKey, provider);
    return wallet;
}

async function registerIssuing(backingNetwork, issuingNetwork) {
    const walletIssuing = wallet(issuingNetwork.url);

    const issuing = await ethers.getContractAt("XTokenIssuing", issuingNetwork.issuing, walletIssuing);

    await issuing.updateXToken(
        backingNetwork.chainid,
        backingNetwork.wtoken,
        issuingNetwork.xwtoken,
        { gasLimit: 1000000 }
    );
    await issuing.setDailyLimit(
        issuingNetwork.xwtoken,
        "0x84595161401484a000000"
    );
}

async function registerBacking(backingNetwork, issuingNetwork) {
    const walletBacking = wallet(backingNetwork.url);

    const backing = await ethers.getContractAt("XTokenBacking", backingNetwork.backing, walletBacking);

    await backing.registerOriginalToken(
        issuingNetwork.chainid,
        backingNetwork.wtoken,
        issuingNetwork.xwtoken,
        "0x84595161401484a000000"
    );
}

async function lockAndRemoteIssuing() {
    const backingNetwork = pangolinNetwork;
    const walletBacking = wallet(pangolinNetwork.url);

    const backing = await ethers.getContractAt("XTokenBacking", backingNetwork.backing, walletBacking);

    //const tx = await backing.callStatic.lockAndRemoteIssuing(
    await backing.lockAndRemoteIssuing(
        11155111,
        "0x0000000000000000000000000000000000000000",
        walletBacking.address,
        ethers.utils.parseEther("10000"),
        1703247763006,
        "0x000000000000000000000000000000000000000000000000000000000005f02200000000000000000000000088a39b052d477cfde47600a7c9950a441ce61cb400000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000000",
        { value: ethers.utils.parseEther("10005") }
    );
}

async function lockAndXIssueNative() {
    const backingNetwork = pangolinNetwork;
    const walletBacking = wallet(pangolinNetwork.url);

    const wtokenConvertor = await ethers.getContractAt("WTokenConvertor", "0xB3A8DB63d6FBE0f50A3D4977c3e892543D772C4A", walletBacking);
    //ethers.utils.defaultAbiCoder.encode(['address', 'bytes'], [walletBacking.address, "0x"]),
    // xring -> ring
    const extData = ethers.utils.defaultAbiCoder.encode(['address', 'bytes'], ["0xc29dCb1F12a1618262eF9FBA673b77140adc02D6", walletBacking.address]);
    console.log(extData);
    return;

    //const tx = await wtokenConvertor.callStatic.lockAndXIssue(
    await wtokenConvertor.lockAndXIssue(
        11155111,
        "0x4CA75992d2750BEC270731A72DfDedE6b9E71cC7", //guard
        walletBacking.address,
        ethers.utils.parseEther("10000.1"),
        1703247763013,
        extData,
        "0x000000000000000000000000000000000000000000000000000000000005f02200000000000000000000000088a39b052d477cfde47600a7c9950a441ce61cb400000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000000",
        { value: ethers.utils.parseEther("10008.1") }
    );
    //console.log(tx);
}

async function lockAndXIssueNativeWithoutGuard(backingNetwork, issuingNetwork) {
    const walletBacking = wallet(backingNetwork.url);

    const wtokenConvertor = await ethers.getContractAt("WTokenConvertor", backingNetwork.wtokenConvertor, walletBacking);
    //ethers.utils.defaultAbiCoder.encode(['address', 'bytes'], [walletBacking.address, "0x"]),
    // xring -> ring
    // normal
    const extData = walletBacking.address;

    //const tx = await wtokenConvertor.callStatic.lockAndXIssue(
    await wtokenConvertor.lockAndXIssue(
        issuingNetwork.chainid,
        walletBacking.address,
        walletBacking.address,
        ethers.utils.parseEther("10.1"),
        1703247763014,
        extData,
        "0x000000000000000000000000000000000000000000000000000000000015f02200000000000000000000000088a39b052d477cfde47600a7c9950a441ce61cb400000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000000",
        { value: ethers.utils.parseEther("58.1") }
    );
    //console.log(tx);
}



async function burnAndXUnlock() {
    const issuingNetwork = sepoliaNetwork;
    const walletIssuing = wallet(sepoliaNetwork.url);

    const issuing = await ethers.getContractAt("XTokenIssuing", issuingNetwork.issuing, walletIssuing);

    const xTokenAddress = "0xD1EB53E6b313d2849243F579e0fCd4dbCab56062";
    const xToken = await ethers.getContractAt("XTokenErc20", xTokenAddress, walletIssuing);
    //await xToken.approve(issuing.address, ethers.utils.parseEther("10000000"), {gasLimit: 500000});

    const extData = ethers.utils.defaultAbiCoder.encode(['address', 'bytes'], ["0x917845001aA1BF0c8F65C8aE3669FE3324277Ac4", walletIssuing.address]);
    //const tx = await issuing.callStatic.burnAndXUnlock(
    await issuing.burnAndXUnlock(
        xTokenAddress,
        "0x4CA75992d2750BEC270731A72DfDedE6b9E71cC7", //guard
        ethers.utils.parseEther("5"),
        1703248419044,
        extData,
        "0x000000000000000000000000000000000000000000000000000000000006493c00000000000000000000000088a39b052d477cfde47600a7c9950a441ce61cb400000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000000",
        {
            value: ethers.utils.parseEther("0.0000007"),
            gasLimit: 1000000,
        }
    );
    //console.log(tx);
}

async function burnAndXUnlockWithoutConvertor(backingNetwork, issuingNetwork) {
    const walletIssuing = wallet(issuingNetwork.url);

    const issuing = await ethers.getContractAt("XTokenIssuing", issuingNetwork.issuing, walletIssuing);

    const xTokenAddress = issuingNetwork.xwtoken;
    const xToken = await ethers.getContractAt("XTokenErc20", xTokenAddress, walletIssuing);
    //await xToken.approve(issuing.address, ethers.utils.parseEther("10000000"), {gasLimit: 500000});

    // normal
    //const extData = walletIssuing.address;
    // refund
    const extData = "0x65be094765731f394bc6d9df53bdf3376f1fc8b0";
    //const tx = await issuing.callStatic.burnAndXUnlock(
    await issuing.burnAndXUnlock(
        xTokenAddress,
        backingNetwork.wtokenConvertor,
        walletIssuing.address,
        ethers.utils.parseEther("3"),
        1703248419045,
        extData,
        "0x000000000000000000000000000000000000000000000000000000000006493c00000000000000000000000088a39b052d477cfde47600a7c9950a441ce61cb400000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000000",
        {
            value: ethers.utils.parseEther("20"),
            gasLimit: 1000000,
        }
    );
    //console.log(tx);
}

async function burnAndXUnlockFromConvertor() {
    const issuingNetwork = sepoliaNetwork;
    const walletIssuing = wallet(sepoliaNetwork.url);

    const xtokenConvertor = await ethers.getContractAt("XRingConvertor", "0x4CdFe9915d2c72506f4fC2363A8EaE032E82d1aA", walletIssuing);

    const tokenAddress = "0xdE64c6d8b24eeB16D864841d2873aB7a379c45b6";
    const token = await ethers.getContractAt("XTokenErc20", tokenAddress, walletIssuing);
    //await token.approve(xtokenConvertor.address, ethers.utils.parseEther("10000000"), {gasLimit: 500000});

    const extData = ethers.utils.defaultAbiCoder.encode(['address', 'bytes'], ["0xB3A8DB63d6FBE0f50A3D4977c3e892543D772C4A", walletIssuing.address]);
    const tx = await xtokenConvertor.callStatic.burnAndXUnlock(
    //await xtokenConvertor.burnAndXUnlock(
        "0x4CA75992d2750BEC270731A72DfDedE6b9E71cC7", //guard
        walletIssuing.address,
        ethers.utils.parseEther("0.02"),
        1703248419047,
        extData,
        "0x000000000000000000000000000000000000000000000000000000000006493c00000000000000000000000088a39b052d477cfde47600a7c9950a441ce61cb400000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000000",
        {
            value: ethers.utils.parseEther("0.0000007"),
            gasLimit: 1000000,
        }
    );
    //console.log(tx);
}

async function xRollbackLockAndXIssue() {
    const issuingNetwork = sepoliaNetwork;
    const walletIssuing = wallet(issuingNetwork.url);

    const issuing = await ethers.getContractAt("XTokenIssuing", issuingNetwork.issuing, walletIssuing);

    //const tx = await issuing.callStatic.xRollbackLockAndXIssue(
    await issuing.xRollbackLockAndXIssue(
        43,
        "0x617E55f692FA2feFfdD5D9C513782A479cC1FF57",
        "0xB3A8DB63d6FBE0f50A3D4977c3e892543D772C4A",
        "0x4CA75992d2750BEC270731A72DfDedE6b9E71cC7",
        "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
        ethers.utils.parseEther("10000.1"),
        1703247763013,
        "0x000000000000000000000000000000000000000000000000000000000016493c00000000000000000000000088a39b052d477cfde47600a7c9950a441ce61cb400000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000000",
        {
            value: ethers.utils.parseEther("0.00007"),
            gasLimit: 1000000,
        }
    );
}

async function requestxRollbackBurnAndXUnlock(backingNetwork, issuingNetwork) {
    const walletBacking = wallet(backingNetwork.url);

    const backing = await ethers.getContractAt("XTokenBacking", backingNetwork.backing, walletBacking);

    //const tx = await backing.callStatic.xRollbackBurnAndXUnlock(
    await backing.xRollbackBurnAndXUnlock(
        issuingNetwork.chainid,
        "0x617E55f692FA2feFfdD5D9C513782A479cC1FF57",
        "0x4CdFe9915d2c72506f4fC2363A8EaE032E82d1aA",
        "0x4CA75992d2750BEC270731A72DfDedE6b9E71cC7",
        walletBacking.address,
        ethers.utils.parseEther("5000"),
        1711595057416,
        "0x000000000000000000000000000000000000000000000000000000000005f02200000000000000000000000088a39b052d477cfde47600a7c9950a441ce61cb400000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000000",
        { value: ethers.utils.parseEther("5.4") }
    );
    //console.log(tx);
}

async function tryToClaim() {
    const backingAddress = "0x7E3105E3A13D55d824b6322cbD2049f098a097F6";
    const issuingAddress = "0x3B36c2Db4CC5E92Af015Eb572A1C95C95599a8bF";
    const wtoken = "0x617e55f692fa2feffdd5d9c513782a479cc1ff57";
    const xtoken = "0xF874fad204757588e67EE55cE93D654b6f5C39C6";
    const backingNetwork = pangolinNetwork;
    const issuingNetwork = sepoliaNetwork;

    // params
    const from = backingAddress;
    const token = wtoken;
    const w = wallet(backingNetwork.url);

    const guardAddress = "0x4CA75992d2750BEC270731A72DfDedE6b9E71cC7";
    const id = "0x55a10a0120075f5422ed8b2bbe33333fe3c00c53236632356e81ae7f4c0d5a95";
    const timestamp =1711370346;
    const amount = "0x470de4df820000";
    const extData = "0x0000000000000000000000003aceb55aad4cdfe1531a9c6f6416753e6a7bdd490000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000001488a39b052d477cfde47600a7c9950a441ce61cb4000000000000000000000000";
    const signatures = ["0x555c399227b5e73afa5d0954d2cf1c40f8a2f09b21df04e8d7acfd87447dc1055d068121d1341d1872e985f7354e233ad57b846b130fb7c9771a6449f7dbac651b"];

    const guard = await ethers.getContractAt("GuardV3", guardAddress, w);
    //const tx = await guard.callStatic.claim(
    const tx = await guard.claim(
        from,
        id,
        timestamp,
        token,
        amount,
        extData,
        signatures
    );
    console.log(tx);
}

async function main() {
    //await registerIssuing(darwiniaNetwork, crabNetwork);
    //await registerBacking(darwiniaNetwork, crabNetwork);
    //await lockAndXIssueNative();
    //await lockAndXIssueNativeWithoutGuard(crabNetwork, darwiniaNetwork);
    //await burnAndXUnlock();
    //await burnAndXUnlockFromConvertor();
    await burnAndXUnlockWithoutConvertor(darwiniaNetwork, crabNetwork);
    //await xRollbackLockAndXIssue();
    //await requestxRollbackBurnAndXUnlock(pangolinNetwork, sepoliaNetwork);
    //await tryToClaim();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
    
