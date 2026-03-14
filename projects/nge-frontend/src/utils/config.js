/**
 * @file config.js
 * @description Centralized configuration for the NGE frontend.
 *
 * All env vars use the REACT_APP_ prefix (Create React App convention).
 * In production these are set during the build step in the deploy workflow.
 * For local development, create a .env file in projects/nge-frontend/.
 */
const config = {
  // Ethereum
  chainId: parseInt(process.env.REACT_APP_CHAIN_ID || "11155111", 10), // Sepolia
  chainName: process.env.REACT_APP_CHAIN_NAME || "Sepolia",

  // Contract addresses (set after deployment)
  contracts: {
    token: process.env.REACT_APP_TOKEN_ADDRESS || "",
    sentinel: process.env.REACT_APP_SENTINEL_ADDRESS || "",
    iot: process.env.REACT_APP_IOT_ADDRESS || "",
  },

  // API endpoints (set after AWS deploy)
  api: {
    token: process.env.REACT_APP_TOKEN_API || "",
    sentinel: process.env.REACT_APP_SENTINEL_API || "",
  },

  // Block explorer
  explorerUrl: process.env.REACT_APP_EXPLORER_URL || "https://sepolia.etherscan.io",
};

/**
 * Returns the block explorer URL for a transaction hash.
 */
export function txUrl(hash) {
  return `${config.explorerUrl}/tx/${hash}`;
}

/**
 * Returns the block explorer URL for an address.
 */
export function addressUrl(address) {
  return `${config.explorerUrl}/address/${address}`;
}

/**
 * Truncates an Ethereum address for display: 0x1234...abcd
 */
export function truncateAddress(address) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default config;
