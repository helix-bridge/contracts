const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');
const fs = require("fs");

var Create2 = require("./create2.js");

const privateKey = process.env.PRIKEY

async function deployxTokenConvertor(wallet, deployerAddress, salt, xtoken, token, issuing, lockbox) {
    const xringConvertorContract = await ethers.getContractFactory("XRingConvertor", wallet);
    const bytecode = Create2.getDeployedBytecode(xringConvertorContract, ['address', 'address', "address", "address"], [xtoken, token, issuing, lockbox]);
    const address = await Create2.deploy(deployerAddress, wallet, bytecode, salt);
    console.log("finish to deploy wtoken convertor, address: ", address);
    return address;
}

async function deployXRINGLockBox(wallet, deployerAddress, salt, xtoken, token) {
    const boxContract = await ethers.getContractFactory("XRINGLockBox", wallet);
    const bytecode = Create2.getDeployedBytecode(boxContract, ['address', 'address'], [token, xtoken]);
    const address = await Create2.deploy(deployerAddress, wallet, bytecode, salt);
    console.log("finish to deploy lockbox, address: ", address);
    return address;
}

function wallet(configure, network) {
    const provider = new ethers.providers.JsonRpcProvider(network.url);
    const wallet = new ethers.Wallet(privateKey, provider);
    return wallet;
}

// 2. deploy mapping token factory
async function main() {
    const pathConfig = "./address/ln-dev.json";
    const configure = JSON.parse(
        fs.readFileSync(pathConfig, "utf8")
    );
    const network = configure.chains['sepolia'];
    const w = wallet(configure, network);

    // deploy wtoken
    /*
    const wtokenContract = await ethers.getContractFactory("WToken", w);
    const wtoken = await wtokenContract.deploy("Pangolin wrapped pring", "WPRING", 18);
    await wtoken.deployed();
    console.log("wpring address", wtoken.address);
    */
    
    const xtoken = "0xD1EB53E6b313d2849243F579e0fCd4dbCab56062";
    const token = "0x76FBA86114e5a0387417b59ff12250a720Ed387d";
    //await deployXRINGLockBox(w, network.deployer, "lockbox-v1.0.0", xtoken, token);

    const lockbox = "0x995c0D4cFcfA0929C178Db3cCD4c433A157Fa074";
    const issuing = "0xAB0b1CB19e00eCf0DCcF8b3e201030a2556625e3";
    const convertor = await deployxTokenConvertor(
        w,
        network.deployer,
        'XRING-Convertor-v1.0.0',
        xtoken,
        token,
        issuing,
        lockbox
    );
    // convertor
    //0x85c9B6665d7f2cB740eA998099079Da6fe6Ef18f
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

