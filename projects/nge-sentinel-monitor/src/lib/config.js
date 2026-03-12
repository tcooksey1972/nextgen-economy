/**
 * @file config.js
 * @description Centralized configuration loaded from environment variables.
 * All Lambda functions import this module to get consistent settings.
 *
 * Environment variables are set via the SAM template (template.yaml)
 * and populated from SSM Parameter Store or CloudFormation parameters.
 */

const config = {
  /** Ethereum JSON-RPC endpoint (Alchemy or Infura free tier). */
  rpcUrl: process.env.ETH_RPC_URL || "https://eth-sepolia.g.alchemy.com/v2/demo",

  /** Deployed FullSentinelVault contract address on Sepolia. */
  contractAddress: process.env.CONTRACT_ADDRESS || "",

  /** DynamoDB table name for event storage. */
  eventsTable: process.env.EVENTS_TABLE || "SentinelEvents",

  /** DynamoDB table name for contract state snapshots. */
  stateTable: process.env.STATE_TABLE || "SentinelState",

  /** SNS topic ARN for alert notifications. */
  alertTopicArn: process.env.ALERT_TOPIC_ARN || "",

  /** Chain ID — 11155111 for Sepolia. */
  chainId: parseInt(process.env.CHAIN_ID || "11155111", 10),

  /** Number of blocks to look back when polling for events. */
  pollBlockRange: parseInt(process.env.POLL_BLOCK_RANGE || "100", 10),

  /** Hours before deadline to send heartbeat warning. */
  heartbeatWarningHours: parseInt(process.env.HEARTBEAT_WARNING_HOURS || "48", 10),
};

module.exports = config;
