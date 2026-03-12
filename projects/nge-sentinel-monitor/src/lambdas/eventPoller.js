/**
 * @file eventPoller.js
 * @description Lambda function that polls the blockchain for new Sentinel
 * contract events. Triggered by EventBridge on a 1-minute schedule.
 *
 * Flow:
 *   1. Read the last polled block from DynamoDB
 *   2. Query the contract for events from lastBlock+1 to "latest"
 *   3. Parse and store each event in DynamoDB
 *   4. Send SNS alerts for CRITICAL/WARNING events
 *   5. Update the last polled block cursor
 *
 * This function handles all event types emitted by the FullSentinelVault:
 *   - WatchdogAlerted (CRITICAL/WARNING anomaly detection)
 *   - OutflowRecorded (rate limiter tracking)
 *   - HeartbeatReceived (dead man switch check-in)
 *   - SwitchActivated (dead man switch fired)
 *   - EmergencyProposed/Approved/Executed/Cancelled (break glass)
 *   - RateLimitChanged/Reset (admin config changes)
 *   - Deposited/Withdrawn (vault operations)
 *
 * @see ../lib/contract.js - Ethereum contract client
 * @see ../lib/dynamo.js - DynamoDB storage
 * @see ../lib/alerts.js - SNS alert publishing
 */
const { getProvider, getContract } = require("../lib/contract");
const dynamo = require("../lib/dynamo");
const alerts = require("../lib/alerts");
const config = require("../lib/config");

/** Severity enum values from the WatchdogAlert contract. */
const SEVERITY = { 0: "INFO", 1: "WARNING", 2: "CRITICAL" };

/**
 * Parses a raw ethers.js EventLog into a storable format.
 *
 * @param {import("ethers").EventLog} log - Raw event log.
 * @param {number} blockTimestamp - Unix timestamp of the block.
 * @returns {Object} Parsed event ready for DynamoDB storage.
 */
function parseEvent(log, blockTimestamp) {
  const args = {};
  if (log.fragment && log.fragment.inputs) {
    for (const input of log.fragment.inputs) {
      const val = log.args[input.name];
      // Convert BigInt to string for DynamoDB compatibility
      args[input.name] = typeof val === "bigint" ? val.toString() : val;
    }
  }

  return {
    eventName: log.fragment.name,
    blockNumber: log.blockNumber,
    transactionHash: log.transactionHash,
    logIndex: log.index,
    timestamp: blockTimestamp,
    args,
  };
}

/**
 * Determines if an event should trigger an SNS alert and sends it.
 *
 * @param {Object} event - Parsed event from parseEvent().
 * @returns {Promise<void>}
 */
async function processAlerts(event) {
  switch (event.eventName) {
    case "WatchdogAlerted": {
      const severity = SEVERITY[event.args.severity] || "INFO";
      if (severity === "CRITICAL" || severity === "WARNING") {
        await alerts.sendAlert({
          severity,
          title: `Watchdog: ${event.args.reason}`,
          message: `Transfer from ${event.args.from} to ${event.args.to} — amount: ${event.args.value} wei`,
          data: event.args,
        });
      }
      break;
    }

    case "SwitchActivated":
      await alerts.critical(
        "Dead Man Switch Activated",
        `The vault owner missed their heartbeat. Switch activated by ${event.args.activator}. The contract is now paused and ownership has been transferred to the recovery address.`,
        event.args
      );
      break;

    case "EmergencyProposed":
      await alerts.warning(
        "Emergency Action Proposed",
        `Guardian ${event.args.proposer} proposed emergency action (proposal #${event.args.proposalId}). Action type: ${event.args.action}.`,
        event.args
      );
      break;

    case "EmergencyExecuted":
      await alerts.critical(
        "Emergency Action Executed",
        `Emergency proposal #${event.args.proposalId} has been executed by ${event.args.executor}. Action type: ${event.args.action}.`,
        event.args
      );
      break;

    case "RateLimitChanged":
      await alerts.info(
        "Rate Limit Configuration Changed",
        `Rate limit updated. New max: ${event.args.newMaxAmount} wei, new window: ${event.args.newWindowDuration}s.`,
        event.args
      );
      break;

    default:
      // Other events are stored but don't trigger alerts
      break;
  }
}

/**
 * Lambda handler — polls for new contract events.
 *
 * @param {Object} _event - EventBridge scheduled event (unused).
 * @returns {Promise<Object>} Summary of processed events.
 */
exports.handler = async (_event) => {
  const provider = getProvider();
  const contract = getContract();

  // 1. Determine block range to poll
  const currentBlock = await provider.getBlockNumber();
  let fromBlock = await dynamo.getLastPolledBlock();

  if (fromBlock === null) {
    // First run — start from (current - pollBlockRange)
    fromBlock = Math.max(0, currentBlock - config.pollBlockRange);
  } else {
    fromBlock = fromBlock + 1; // Don't re-process the last block
  }

  if (fromBlock > currentBlock) {
    console.log(`No new blocks. Current: ${currentBlock}, last polled: ${fromBlock - 1}`);
    return { processed: 0, fromBlock, toBlock: currentBlock };
  }

  console.log(`Polling blocks ${fromBlock} to ${currentBlock}`);

  // 2. Query all events from the contract
  const filter = { address: config.contractAddress, fromBlock, toBlock: currentBlock };
  const logs = await contract.queryFilter("*", fromBlock, currentBlock);

  console.log(`Found ${logs.length} events`);

  // 3. Get block timestamps (batch unique blocks)
  const blockNumbers = [...new Set(logs.map((l) => l.blockNumber))];
  const blockTimestamps = {};
  for (const bn of blockNumbers) {
    const block = await provider.getBlock(bn);
    blockTimestamps[bn] = block ? block.timestamp : Math.floor(Date.now() / 1000);
  }

  // 4. Parse, store, and alert on each event
  let processed = 0;
  for (const log of logs) {
    if (!log.fragment) continue; // Skip unrecognized events

    const event = parseEvent(log, blockTimestamps[log.blockNumber]);

    await dynamo.putEvent(event);
    await processAlerts(event);
    processed++;
  }

  // 5. Update the poll cursor
  await dynamo.putLastPolledBlock(currentBlock);

  console.log(`Processed ${processed} events through block ${currentBlock}`);
  return { processed, fromBlock, toBlock: currentBlock };
};
