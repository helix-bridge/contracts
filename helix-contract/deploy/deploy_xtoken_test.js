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
    backing: "0x7E3105E3A13D55d824b6322cbD2049f098a097F6",
    chainid: 43
};

const sepoliaNetwork = {
    name: "sepolia",
    url: "https://1rpc.io/sepolia",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    issuing: "0x3B36c2Db4CC5E92Af015Eb572A1C95C95599a8bF",
    chainid: 11155111
};

function wallet(url) {
    const provider = new ethers.providers.JsonRpcProvider(url);
    const wallet = new ethers.Wallet(privateKey, provider);
    return wallet;
}

async function registerIssuing() {
    const issuingNetwork = sepoliaNetwork;
    const walletIssuing = wallet(sepoliaNetwork.url);

    const issuing = await ethers.getContractAt("XTokenIssuing", issuingNetwork.issuing, walletIssuing);

    await issuing.registerXToken(
        43,
        "0x617E55f692FA2feFfdD5D9C513782A479cC1FF57",
        "pangolin",
        "pangolin native token",
        "PRING",
        18,
        "0x56bc75e2d63100000",
        { gasLimit: 1000000 }
    );
}

async function registerBacking() {
    const backingNetwork = pangolinNetwork;
    const walletBacking = wallet(pangolinNetwork.url);

    const backing = await ethers.getContractAt("XTokenBacking", backingNetwork.backing, walletBacking);
    const xToken = "0xF874fad204757588e67EE55cE93D654b6f5C39C6";

    await backing.registerOriginalToken(
        11155111,
        "0x617E55f692FA2feFfdD5D9C513782A479cC1FF57",
        xToken,
        "0x56bc75e2d63100000"
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

    const wtokenConvertor = await ethers.getContractAt("WTokenConvertor", "0x3ACEb55AAD4CDFE1531A9C6F6416753e6a7BDD49", walletBacking);
    //ethers.utils.defaultAbiCoder.encode(['address', 'bytes'], [walletBacking.address, "0x"]),
    // xring -> ring
    const extData = ethers.utils.defaultAbiCoder.encode(['address', 'bytes'], ["0x917CB26BfCf9F6bE65f387903AA9180613A40f41", walletBacking.address]);

    //const tx = await wtokenConvertor.callStatic.lockAndXIssue(
    await wtokenConvertor.lockAndXIssue(
        11155111,
        "0x4CA75992d2750BEC270731A72DfDedE6b9E71cC7", //guard
        walletBacking.address,
        ethers.utils.parseEther("2.1"),
        1703247763010,
        extData,
        "0x000000000000000000000000000000000000000000000000000000000005f02200000000000000000000000088a39b052d477cfde47600a7c9950a441ce61cb400000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000000",
        { value: ethers.utils.parseEther("7.1") }
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

async function burnAndXUnlockFromConvertor() {
    const issuingNetwork = sepoliaNetwork;
    const walletIssuing = wallet(sepoliaNetwork.url);

    const xtokenConvertor = await ethers.getContractAt("XRingConvertor", "0x917CB26BfCf9F6bE65f387903AA9180613A40f41", walletIssuing);

    const tokenAddress = "0xBD50868F36Eb46355eC5a153AbD3a7eA094A5c37";
    const token = await ethers.getContractAt("XTokenErc20", tokenAddress, walletIssuing);
    //await token.approve(xtokenConvertor.address, ethers.utils.parseEther("10000000"), {gasLimit: 500000});

    const extData = ethers.utils.defaultAbiCoder.encode(['address', 'bytes'], ["0x3ACEb55AAD4CDFE1531A9C6F6416753e6a7BDD49", walletIssuing.address]);
    //const tx = await xtokenConvertor.callStatic.burnAndXUnlock(
    await xtokenConvertor.burnAndXUnlock(
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

async function requestRemoteUnlockForIssuingFailure() {
    const issuingNetwork = sepoliaNetwork;
    const walletIssuing = wallet(sepoliaNetwork.url);

    const issuing = await ethers.getContractAt("XTokenIssuing", issuingNetwork.issuing, walletIssuing);

    await issuing.requestRemoteUnlockForIssuingFailure(
        43,
        "0x0000000000000000000000000000000000000000",
        walletIssuing.address,
        walletIssuing.address,
        ethers.utils.parseEther("12000"),
        1703247763005,
        "0x000000000000000000000000000000000000000000000000000000000006493c00000000000000000000000088a39b052d477cfde47600a7c9950a441ce61cb400000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000000",
        {
            value: ethers.utils.parseEther("0.0000007"),
            gasLimit: 1000000,
        }
    );
}

async function requestRemoteIssuingForUnlockFailure() {
    const backingNetwork = pangolinNetwork;
    const walletBacking = wallet(pangolinNetwork.url);

    const backing = await ethers.getContractAt("XTokenBacking", backingNetwork.backing, walletBacking);

    await backing.requestRemoteIssuingForUnlockFailure(
        11155111,
        "0x0000000000000000000000000000000000000000",
        walletBacking.address,
        walletBacking.address,
        ethers.utils.parseEther("5"),
        1703248419044,
        "0x000000000000000000000000000000000000000000000000000000000005f02200000000000000000000000088a39b052d477cfde47600a7c9950a441ce61cb400000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000000",
        { value: ethers.utils.parseEther("5.4") }
    );
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
    //await registerIssuing();
    //await registerBacking();
    //await lockAndXIssueNative();
    //await burnAndXUnlock();
    //await burnAndXUnlockFromConvertor();
    //await requestRemoteUnlockForIssuingFailure();
    //await requestRemoteIssuingForUnlockFailure();
    await tryToClaim();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
    
