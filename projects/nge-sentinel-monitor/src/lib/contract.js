/**
 * @file contract.js
 * @description Shared Ethereum contract client. Provides a configured ethers.js
 * provider and contract instance for all Lambda functions.
 *
 * Uses ethers.js v6 with a JsonRpcProvider connected to the configured RPC URL.
 * The contract instance is read-only (no signer) since the monitor only reads
 * on-chain state and events — it never sends transactions.
 */
const { ethers } = require("ethers");
const config = require("./config");
const abi = require("../abi/FullSentinelVault.json");

/** @type {ethers.JsonRpcProvider|null} */
let _provider = null;

/** @type {ethers.Contract|null} */
let _contract = null;

/**
 * Returns a cached JsonRpcProvider instance.
 * Reuses the same provider across invocations within a single Lambda
 * container (warm start optimization).
 *
 * @returns {ethers.JsonRpcProvider}
 */
function getProvider() {
  if (!_provider) {
    _provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
  }
  return _provider;
}

/**
 * Returns a cached read-only Contract instance for the FullSentinelVault.
 *
 * @returns {ethers.Contract}
 * @throws {Error} If CONTRACT_ADDRESS is not configured.
 */
function getContract() {
  if (!_contract) {
    if (!config.contractAddress) {
      throw new Error("CONTRACT_ADDRESS environment variable is not set");
    }
    _contract = new ethers.Contract(config.contractAddress, abi, getProvider());
  }
  return _contract;
}

/**
 * Queries contract events within a block range.
 *
 * @param {string} eventName - The event name to filter (e.g., "WatchdogAlerted").
 * @param {number} fromBlock - Starting block number.
 * @param {number} toBlock - Ending block number (or "latest").
 * @returns {Promise<ethers.EventLog[]>} Array of parsed event logs.
 */
async function queryEvents(eventName, fromBlock, toBlock) {
  const contract = getContract();
  const filter = contract.filters[eventName]();
  return contract.queryFilter(filter, fromBlock, toBlock);
}

/**
 * Reads the current state of the vault contract.
 * Bundles multiple view calls into a single object for dashboard consumption.
 *
 * @returns {Promise<Object>} Vault state snapshot.
 */
async function getVaultState() {
  const contract = getContract();
  const provider = getProvider();

  const [
    owner,
    paused,
    heartbeatInterval,
    gracePeriod,
    lastCheckIn,
    switchDeadline,
    isSwitchActivated,
    recoveryAddress,
    rateLimitMax,
    rateLimitWindow,
    currentWindowUsage,
    currentWindowRemaining,
    threshold,
    executionDelay,
    guardianCount,
    largeTransferThreshold,
    rapidActivityThreshold,
    rapidActivityWindow,
    balance,
    blockNumber,
  ] = await Promise.all([
    contract.owner(),
    contract.paused(),
    contract.heartbeatInterval(),
    contract.gracePeriod(),
    contract.lastCheckIn(),
    contract.switchDeadline(),
    contract.isSwitchActivated(),
    contract.recoveryAddress(),
    contract.rateLimitMax(),
    contract.rateLimitWindow(),
    contract.currentWindowUsage(),
    contract.currentWindowRemaining(),
    contract.threshold(),
    contract.executionDelay(),
    contract.guardianCount(),
    contract.largeTransferThreshold(),
    contract.rapidActivityThreshold(),
    contract.rapidActivityWindow(),
    provider.getBalance(config.contractAddress),
    provider.getBlockNumber(),
  ]);

  return {
    contractAddress: config.contractAddress,
    chainId: config.chainId,
    blockNumber,
    timestamp: Math.floor(Date.now() / 1000),
    owner,
    paused,
    balance: balance.toString(),
    deadManSwitch: {
      heartbeatInterval: Number(heartbeatInterval),
      gracePeriod: Number(gracePeriod),
      lastCheckIn: Number(lastCheckIn),
      switchDeadline: Number(switchDeadline),
      isSwitchActivated,
      recoveryAddress,
      secondsRemaining: Math.max(0, Number(switchDeadline) - Math.floor(Date.now() / 1000)),
    },
    rateLimiter: {
      maxAmount: rateLimitMax.toString(),
      windowDuration: Number(rateLimitWindow),
      currentUsage: currentWindowUsage.toString(),
      remaining: currentWindowRemaining.toString(),
    },
    breakGlass: {
      threshold: Number(threshold),
      executionDelay: Number(executionDelay),
      guardianCount: Number(guardianCount),
    },
    watchdog: {
      largeTransferThreshold: largeTransferThreshold.toString(),
      rapidActivityThreshold: Number(rapidActivityThreshold),
      rapidActivityWindow: Number(rapidActivityWindow),
    },
  };
}

module.exports = {
  getProvider,
  getContract,
  queryEvents,
  getVaultState,
};
