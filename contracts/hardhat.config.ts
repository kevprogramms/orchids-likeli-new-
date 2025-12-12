import * as dotenv from "dotenv";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";

dotenv.config();

const ARBITRUM_SEPOLIA_RPC_URL = process.env.ARBITRUM_SEPOLIA_RPC_URL || "";
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {},
    arbitrumSepolia: {
      url: ARBITRUM_SEPOLIA_RPC_URL,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : []
    }
  }
};

export default config;
