/**
 * @file config.js
 * @description Centralized configuration for the Asset Tokenization Lambda functions.
 *
 * All values are injected via environment variables set in the SAM template.
 */
module.exports = {
  rpcUrl: process.env.ETH_RPC_URL || "",
  contractAddress: process.env.CONTRACT_ADDRESS || "",
  chainId: parseInt(process.env.CHAIN_ID || "11155111", 10),

  // DynamoDB tables
  assetsTable: process.env.ASSETS_TABLE || "AssetRegistry",
  eventsTable: process.env.EVENTS_TABLE || "AssetEvents",
  stateTable: process.env.STATE_TABLE || "AssetState",

  // SNS
  alertTopicArn: process.env.ALERT_TOPIC_ARN || "",

  // Polling
  pollBlockRange: parseInt(process.env.POLL_BLOCK_RANGE || "100", 10),
};
