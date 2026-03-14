/**
 * @file hardhat.config.js
 * @description Hardhat configuration for the NGE Sentinel project.
 *
 * Solidity 0.8.26 is used to match the solcjs version bundled with Hardhat
 * (ensures scripts/compile.js produces identical output).
 *
 * Optimizer is enabled with 200 runs — a balanced setting for contracts that
 * are deployed once but called many times.
 *
 * Network configs use env vars so secrets stay out of source control.
 * Set DEPLOYER_PRIVATE_KEY and ETH_RPC_URL before deploying.
 */
require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.26",
    settings: {
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    sepolia: {
      url: process.env.ETH_RPC_URL || "",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
    mainnet: {
      url: process.env.ETH_RPC_URL || "",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
  },
};
