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
    
    const xtoken = "0xF874fad204757588e67EE55cE93D654b6f5C39C6";
    const token = "0xBD50868F36Eb46355eC5a153AbD3a7eA094A5c37";
    //await deployXRINGLockBox(w, network.deployer, "lockbox-v1.0.0", xtoken, token);

    const lockbox = "0xc0bd46a3C2A14aed7a04Dfe9018f7fd62431398c";
    const issuing = "0x3B36c2Db4CC5E92Af015Eb572A1C95C95599a8bF";
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
    //0x917CB26BfCf9F6bE65f387903AA9180613A40f41
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

