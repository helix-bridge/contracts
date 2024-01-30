const ethUtil = require('ethereumjs-util');
const abi = require('ethereumjs-abi');
const secp256k1 = require('secp256k1');

const privateKey = process.env.PRIKEY

const arbitrumNetwork = {
    url: "https://goerli-rollup.arbitrum.io/rpc",
    tokens: [
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
    ],
};

const goerliNetwork = {
    url: "https://rpc.ankr.com/eth_goerli",
    tokens: [
        {
            name: "Helix Test Token USDT",
            symbol: "USDT",
            decimals: 6
        },
        {
            name: "Helix Test Token USDC",
            symbol: "USDC",
            decimals: 6
        },
    ],
};

const mantleNetwork = {
    url: "https://rpc.testnet.mantle.xyz",
    tokens: [
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
    ],
};

const lineaNetwork = {
    url: "https://rpc.goerli.linea.build",
    tokens: [
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
    ],
};

const crabNetwork = {
    url: "https://crab-rpc.darwinia.network",
    tokens: [
        {
            name: "Helix Test Token USDC",
            symbol: "USDC",
            decimals: 18
        }
    ]
};

const arbitrumSepoliaNetwork = {
    url: "https://sepolia-rollup.arbitrum.io/rpc",
    tokens: [
        {
            name: "Helix Test Token USDC",
            symbol: "USDC",
            decimals: 18
        },
        {
            name: "Helix Test Token USDT",
            symbol: "USDT",
            decimals: 18
        }
    ]
};

const sepoliaNetwork = {
    url: "https://rpc-sepolia.rockx.com",
    tokens: [
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
    ],
};

const scrollSepoliaNetwork = {
    url: "https://sepolia-rpc.scroll.io/",
    tokens: [
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
    ],
};

function wallet(url) {
    const provider = new ethers.providers.JsonRpcProvider(url);
    const wallet = new ethers.Wallet(privateKey, provider);
    return wallet;
}

// 2. deploy mapping token factory
async function main() {
    const w = wallet(arbitrumSepoliaNetwork.url);
    const tokenInfo = arbitrumSepoliaNetwork.tokens[1];
    const tokenContract = await ethers.getContractFactory("HelixTestErc20", w);
    const token = await tokenContract.deploy(tokenInfo.name, tokenInfo.symbol, tokenInfo.decimals);
    await token.deployed();
    console.log(`finish to deploy test token contract, network is: ${network.url}, address is: ${token.address}`);
    return;

    const networks = [goerliNetwork, mantleNetwork, arbitrumNetwork, lineaNetwork, sepoliaNetwork, scrollSepoliaNetwork];
    for (const network of networks) {
        const w = wallet(network.url);
        
        for (const tokenInfo of network.tokens) {
            const tokenContract = await ethers.getContractFactory("HelixTestErc20", w);
            const token = await tokenContract.deploy(tokenInfo.name, tokenInfo.symbol, tokenInfo.decimals);
            await token.deployed();
            console.log(`finish to deploy test token contract, network is: ${network.url}, address is: ${token.address}`);
        }
    }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

