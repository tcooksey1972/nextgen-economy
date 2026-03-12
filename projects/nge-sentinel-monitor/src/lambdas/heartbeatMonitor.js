/**
 * @file heartbeatMonitor.js
 * @description Lambda function that monitors the DeadManSwitch heartbeat
 * status. Triggered by EventBridge on an hourly schedule.
 *
 * Flow:
 *   1. Read the vault's current state from the blockchain
 *   2. Calculate time remaining until the switch deadline
 *   3. Send WARNING if deadline is within the configured warning window
 *   4. Send CRITICAL if the deadline has passed (switch can be activated)
 *   5. Store the state snapshot in DynamoDB for the dashboard
 *
 * This is separate from the event poller because:
 *   - Heartbeat monitoring is time-based, not event-based
 *   - We need to alert BEFORE anything happens on-chain
 *   - Runs less frequently (hourly) to conserve Lambda invocations
 *
 * @see ../lib/contract.js - Reads vault state from blockchain
 * @see ../lib/dynamo.js - Stores state snapshots
 * @see ../lib/alerts.js - Sends SNS alerts
 */
const { getVaultState } = require("../lib/contract");
const dynamo = require("../lib/dynamo");
const alerts = require("../lib/alerts");
const config = require("../lib/config");

/**
 * Formats seconds into a human-readable duration string.
 *
 * @param {number} seconds - Duration in seconds.
 * @returns {string} e.g., "3 days, 4 hours" or "45 minutes".
 */
function formatDuration(seconds) {
  if (seconds <= 0) return "0 seconds";

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days} day${days !== 1 ? "s" : ""}`);
  if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? "s" : ""}`);
  if (minutes > 0 && days === 0) parts.push(`${minutes} minute${minutes !== 1 ? "s" : ""}`);

  return parts.join(", ") || "less than 1 minute";
}

/**
 * Formats wei as ETH with 4 decimal places.
 *
 * @param {string} wei - Amount in wei as a string.
 * @returns {string} e.g., "1.5000 ETH".
 */
function formatEth(wei) {
  const eth = Number(BigInt(wei)) / 1e18;
  return `${eth.toFixed(4)} ETH`;
}

/**
 * Lambda handler — checks heartbeat status and vault health.
 *
 * @param {Object} _event - EventBridge scheduled event (unused).
 * @returns {Promise<Object>} Health status summary.
 */
exports.handler = async (_event) => {
  // 1. Read vault state from blockchain
  const state = await getVaultState();

  // 2. Store snapshot in DynamoDB for the dashboard
  await dynamo.putState(state);

  const now = Math.floor(Date.now() / 1000);
  const { deadManSwitch } = state;
  const secondsRemaining = deadManSwitch.switchDeadline - now;
  const warningThreshold = config.heartbeatWarningHours * 3600;

  console.log(`Vault health check:`);
  console.log(`  Balance: ${formatEth(state.balance)}`);
  console.log(`  Paused: ${state.paused}`);
  console.log(`  Switch activated: ${deadManSwitch.isSwitchActivated}`);
  console.log(`  Deadline: ${new Date(deadManSwitch.switchDeadline * 1000).toISOString()}`);
  console.log(`  Time remaining: ${formatDuration(Math.max(0, secondsRemaining))}`);

  // 3. Determine alert level
  let alertLevel = "OK";

  if (deadManSwitch.isSwitchActivated) {
    // Switch already fired — CRITICAL
    alertLevel = "SWITCH_ACTIVATED";
    await alerts.critical(
      "Dead Man Switch Is Active",
      `The vault's dead man switch has already been activated. The contract is paused and ownership was transferred to ${deadManSwitch.recoveryAddress}. Balance: ${formatEth(state.balance)}.`
    );
  } else if (secondsRemaining <= 0) {
    // Deadline passed but switch not yet triggered — CRITICAL
    alertLevel = "DEADLINE_PASSED";
    await alerts.critical(
      "Heartbeat Deadline Passed",
      `The owner's heartbeat deadline passed ${formatDuration(Math.abs(secondsRemaining))} ago. Anyone can now call activateSwitch() to pause the contract and transfer ownership. Last check-in: ${new Date(deadManSwitch.lastCheckIn * 1000).toISOString()}.`
    );
  } else if (secondsRemaining <= warningThreshold) {
    // Approaching deadline — WARNING
    alertLevel = "APPROACHING_DEADLINE";
    await alerts.warning(
      "Heartbeat Deadline Approaching",
      `The owner's heartbeat deadline is ${formatDuration(secondsRemaining)} away. The owner should call checkIn() soon to reset the timer. Last check-in: ${new Date(deadManSwitch.lastCheckIn * 1000).toISOString()}.`
    );
  }

  // 4. Check if contract is paused (for any reason)
  if (state.paused && !deadManSwitch.isSwitchActivated) {
    await alerts.warning(
      "Vault Is Paused",
      `The vault is currently paused (not due to dead man switch). Withdrawals are blocked. Balance: ${formatEth(state.balance)}.`
    );
  }

  // 5. Check rate limiter utilization
  const rlMax = BigInt(state.rateLimiter.maxAmount);
  const rlUsed = BigInt(state.rateLimiter.currentUsage);
  if (rlMax > 0n && rlUsed > 0n) {
    const utilization = Number((rlUsed * 100n) / rlMax);
    if (utilization >= 80) {
      await alerts.info(
        "Rate Limit Near Capacity",
        `Rate limiter is at ${utilization}% utilization (${formatEth(state.rateLimiter.currentUsage)} of ${formatEth(state.rateLimiter.maxAmount)} used in current window).`
      );
    }
  }

  const result = {
    status: alertLevel,
    balance: state.balance,
    paused: state.paused,
    switchActivated: deadManSwitch.isSwitchActivated,
    secondsRemaining: Math.max(0, secondsRemaining),
    blockNumber: state.blockNumber,
  };

  console.log(`Health check complete: ${alertLevel}`);
  return result;
};
