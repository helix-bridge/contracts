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
    const pathConfig = "./address/ln-dev.json";
    const configure = JSON.parse(
        fs.readFileSync(pathConfig, "utf8")
    );
    const network = configure.chains['pangolin'];
    const w = wallet(configure, network);

    // deploy wtoken
    /*
    const wtokenContract = await ethers.getContractFactory("WToken", w);
    const wtoken = await wtokenContract.deploy("Pangolin wrapped pring", "WPRING", 18);
    await wtoken.deployed();
    console.log("wpring address", wtoken.address);
    */
    
    const wtoken = "0x617E55f692FA2feFfdD5D9C513782A479cC1FF57";
    const xtokenBacking = '0x7E3105E3A13D55d824b6322cbD2049f098a097F6';
    const convertor = await deployxTokenConvertor(w, network.deployer, "xToken-Convertor-v1.0.0", wtoken, xtokenBacking);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

