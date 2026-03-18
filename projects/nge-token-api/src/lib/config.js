/**
 * @file config.js
 * @description Centralized configuration for the NGE Token API.
 * Environment variables are set via the SAM template.
 */

const config = {
  /** Ethereum JSON-RPC endpoint (Alchemy or Infura). */
  rpcUrl: process.env.ETH_RPC_URL || "https://eth-sepolia.g.alchemy.com/v2/demo",

  /** Deployed NGE token contract address on Sepolia. */
  tokenAddress: process.env.TOKEN_ADDRESS || "",

  /** Deployed NGE Governor contract address on Sepolia. */
  governorAddress: process.env.GOVERNOR_ADDRESS || "",

  /** DynamoDB table for token events and transfers. */
  eventsTable: process.env.EVENTS_TABLE || "TokenEvents",

  /** DynamoDB table for governance proposals and state. */
  governanceTable: process.env.GOVERNANCE_TABLE || "GovernanceData",

  /** SNS topic ARN for governance alerts. */
  alertTopicArn: process.env.ALERT_TOPIC_ARN || "",

  /** Chain ID — 11155111 for Sepolia. */
  chainId: parseInt(process.env.CHAIN_ID || "11155111", 10),

  /** Number of blocks to look back when polling for events. */
  pollBlockRange: parseInt(process.env.POLL_BLOCK_RANGE || "200", 10),
};

module.exports = config;
