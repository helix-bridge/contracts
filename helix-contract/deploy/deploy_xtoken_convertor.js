const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');
const fs = require("fs");

var Create2 = require("./create2.js");

const privateKey = process.env.PRIKEY

async function deployxTokenConvertor(wallet, deployerAddress, salt, wtoken, xtokenBacking) {
    const convertorContract = await ethers.getContractFactory("WTokenConvertor", wallet);
    const bytecode = Create2.getDeployedBytecode(convertorContract, ['address', 'address'], [wtoken, xtokenBacking]);
    const address = await Create2.deploy(deployerAddress, wallet, bytecode, salt);
    console.log("finish to deploy wtoken convertor, address: ", address);
    return address;
}

function wallet(configure, network) {
    const provider = new ethers.providers.JsonRpcProvider(network.url);
    const wallet = new ethers.Wallet(privateKey, provider);
    return wallet;
}

// 2. deploy mapping token factory
async function main() {
    const pathConfig = "./address/ln-product.json";
    const configure = JSON.parse(
        fs.readFileSync(pathConfig, "utf8")
    );
    const network = configure.chains['darwinia-dvm'];
    const w = wallet(configure, network);

    // deploy wtoken
    /*
    const wtokenContract = await ethers.getContractFactory("WToken", w);
    const wtoken = await wtokenContract.deploy("Pangolin wrapped pring", "WPRING", 18);
    await wtoken.deployed();
    console.log("wpring address", wtoken.address);
    */
    
    const wtoken = "0xE7578598Aac020abFB918f33A20faD5B71d670b4";
    const xtokenBacking = '0x2B496f19A420C02490dB859fefeCCD71eDc2c046';
    const convertor = await deployxTokenConvertor(w, network.deployer, "xToken-Convertor-v3.0.2-ethereum", wtoken, xtokenBacking);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

