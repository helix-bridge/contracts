var Configure = require("./configure/readconfig.js");
const privateKey = process.env.PRIKEY

const tokens = [
    {
        name: "Helix Test Token USDT",
        symbol: "USDT",
        decimals: 18
    },
    {
        name: "Helix Test Token USDC",
        symbol: "USDC",
        decimals: 18
    },
];

function wallet(url) {
    const provider = new ethers.providers.JsonRpcProvider(url);
    const wallet = new ethers.Wallet(privateKey, provider);
    return wallet;
}

// 2. deploy mapping token factory
async function main() {
    const chainInfo = Configure.chain('dev');
    const network = chainInfo['morph'];

    const w = wallet(network.url);
    const tokenInfo = tokens[1];

    const tokenContract = await ethers.getContractFactory("HelixTestErc20", w);
    const token = await tokenContract.deploy(tokenInfo.name, tokenInfo.symbol, tokenInfo.decimals);
    await token.deployed();
    console.log(`finish to deploy test token contract, address is: ${token.address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

