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
    
    const xtoken = "0x81e32d4652Be82AE225DEdd1bD0bf3BCba8FEE07";
    const token = "0x9469D013805bFfB7D3DEBe5E7839237e535ec483";
    //await deployXRINGLockBox(w, network.deployer, "lockbox-v1.0.0", xtoken, token);

    const lockbox = "0x00000000062D35A6F9F82305c47A786527896578";
    const issuing = "0xDc0C760c0fB4672D06088515F6446a71Df0c64C1";
    const convertor = await deployxTokenConvertor(
        w,
        network.deployer,
        'XRING-Convertor-v3.0.2',
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

