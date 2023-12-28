import { HardhatUserConfig } from "hardhat/config";

import "@matterlabs/hardhat-zksync-deploy";
import "@matterlabs/hardhat-zksync-solc";
import "@matterlabs/hardhat-zksync-verify";

// dynamically changes endpoints for local tests
const zkSyncTestnet =
  process.env.NODE_ENV == "test"
    ? {
        url: "http://localhost:3050",
        ethNetwork: "http://localhost:8545",
        zksync: true,
      }
    : {
        //url: "https://zksync2-testnet.zksync.dev",
        url: "https://testnet.era.zksync.dev",
        //url: "https://mainnet.era.zksync.io",
        ethNetwork: "goerli",
        //ethNetwork: "mainnet",
        zksync: true,
        verifyURL: 'https://zksync2-testnet-explorer.zksync.dev/contract_verification',
        //verifyURL: 'https://zksync2-mainnet-explorer.zksync.io/contract_verification',
      };

const config: HardhatUserConfig = {
  zksolc: {
    version: "1.3.13",
    compilerSource: "binary",
    settings: {
      "compilerPath": "/usr/local/bin/zksolc",
      optimizer: {
          enabled: true,
          runs: 200
      },
    },
  },
  defaultNetwork: "zkSyncTestnet",
  networks: {
    hardhat: {
      zksync: false,
    },
    zkSyncTestnet,
  },
  solidity: {
    version: "0.8.17",
  },
};

export default config;

