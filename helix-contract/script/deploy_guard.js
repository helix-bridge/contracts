var Create2 = require("./api/create2.js");
var Configure = require("./configure/readconfig.js");
var GuardV3Bytecode = require("./bytecode/GuardV3.js");

const privateKey = process.env.PRIKEY

function wallet(network) {
    const provider = new ethers.providers.JsonRpcProvider(network.url);
    const wallet = new ethers.Wallet(privateKey, provider);
    return wallet;
}

async function deployGuardV3(wallet, deployerAddress, salt) {
    const guardContract = await ethers.getContractFactory("GuardV3", wallet);
    //const bytecode = Create2.getDeployedBytecode(
        //guardContract,
        //['address[]','address','uint256','uint256'],
        //[['0x3B9E571AdeCB0c277486036D6097E9C2CCcfa9d9'],wallet.address,1,259200]);
    const bytecode = GuardV3Bytecode;
    const address = await Create2.deploy(deployerAddress, wallet, bytecode, salt, 8000000);
    console.log("finish to deploy guard contract, address: ", address);
    return address;
}

// 2. deploy mapping token factory
async function main() {
    const chainInfo = Configure.chain('product');
    const network = chainInfo['crab-dvm'];
    const w = wallet(network);

    await deployGuardV3(w, network.deployer, "guardv3-v1.0.0");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

