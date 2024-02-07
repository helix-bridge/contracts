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
    backing: "0x94eAb0CB67AB7edaf9A280aCa097F70e4BD780ac",
    chainid: 43
};

const sepoliaNetwork = {
    name: "sepolia",
    url: "https://rpc.sepolia.org",
    dao: "0x88a39B052d477CfdE47600a7C9950a441Ce61cb4",
    issuing: "0x371019523b25Ff4F26d977724f976566b08bf741",
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

    const issuing = await ethers.getContractAt("xTokenIssuing", issuingNetwork.issuing, walletIssuing);

    await issuing.registerxToken(
        43,
        "0x0000000000000000000000000000000000000000",
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

    const backing = await ethers.getContractAt("xTokenBacking", backingNetwork.backing, walletBacking);
    const xToken = "0xBC43cb6175FcC8E577a0846256eA699b87eFcEE5";

    await backing.registerOriginalToken(
        11155111,
        "0x0000000000000000000000000000000000000000",
        xToken,
        "0x56bc75e2d63100000"
    );
}

async function lockAndRemoteIssuing() {
    const backingNetwork = pangolinNetwork;
    const walletBacking = wallet(pangolinNetwork.url);

    const backing = await ethers.getContractAt("xTokenBacking", backingNetwork.backing, walletBacking);

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

async function burnAndRemoteUnlock() {
    const issuingNetwork = sepoliaNetwork;
    const walletIssuing = wallet(sepoliaNetwork.url);

    const issuing = await ethers.getContractAt("xTokenIssuing", issuingNetwork.issuing, walletIssuing);

    const xTokenAddress = "0xBC43cb6175FcC8E577a0846256eA699b87eFcEE5";
    const xToken = await ethers.getContractAt("xTokenErc20", xTokenAddress, walletIssuing);
    await xToken.approve(issuing.address, ethers.utils.parseEther("10000000"), {gasLimit: 500000});
    await issuing.burnAndRemoteUnlock(
        xTokenAddress,
        walletIssuing.address,
        ethers.utils.parseEther("5"),
        1703248419044,
        "0x000000000000000000000000000000000000000000000000000000000006493c00000000000000000000000088a39b052d477cfde47600a7c9950a441ce61cb400000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000000",
        {
            value: ethers.utils.parseEther("0.0000007"),
            gasLimit: 1000000,
        }
    );
}

async function requestRemoteUnlockForIssuingFailure() {
    const issuingNetwork = sepoliaNetwork;
    const walletIssuing = wallet(sepoliaNetwork.url);

    const issuing = await ethers.getContractAt("xTokenIssuing", issuingNetwork.issuing, walletIssuing);

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

    const backing = await ethers.getContractAt("xTokenBacking", backingNetwork.backing, walletBacking);

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

async function main() {
    //await registerIssuing();
    //await registerBacking();
    //await lockAndRemoteIssuing();
    //await burnAndRemoteUnlock();
    await requestRemoteUnlockForIssuingFailure();
    //await requestRemoteIssuingForUnlockFailure();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
    
