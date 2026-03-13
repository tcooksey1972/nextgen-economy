/**
 * @file hardhat.config.js
 * @description Hardhat configuration for the NGE IoT project.
 *
 * Solidity 0.8.26 matches the nge-sentinel project for cross-project
 * composability. Optimizer enabled with 200 runs.
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
