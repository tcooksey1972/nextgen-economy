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
 * Network configs (Sepolia, mainnet) will be added when deployment scripts
 * are ready. For now, only the default in-memory Hardhat network is used.
 */
require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.26",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
};
