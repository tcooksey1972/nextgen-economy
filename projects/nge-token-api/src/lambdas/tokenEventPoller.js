/**
 * @file tokenEventPoller.js
 * @description Polls blockchain for NGE token Transfer, Approval, and delegation
 * events. Indexes transfers in DynamoDB for fast frontend queries.
 *
 * Triggered by EventBridge on a 1-minute schedule.
 *
 * Events indexed:
 *   - Transfer (from, to, value)
 *   - DelegateChanged (delegator, fromDelegate, toDelegate)
 *   - DelegateVotesChanged (delegate, previousVotes, newVotes)
 */
const { getProvider, getTokenContract } = require("../lib/contract");
const dynamo = require("../lib/dynamo");
const config = require("../lib/config");

function parseTransfer(log, blockTimestamp) {
  return {
    eventName: "Transfer",
    from: log.args[0],
    to: log.args[1],
    value: log.args[2].toString(),
    blockNumber: log.blockNumber,
    transactionHash: log.transactionHash,
    logIndex: log.index,
    timestamp: blockTimestamp,
  };
}

function parseEvent(log, blockTimestamp) {
  const args = {};
  if (log.fragment && log.fragment.inputs) {
    for (const input of log.fragment.inputs) {
      const val = log.args[input.name];
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

exports.handler = async (_event) => {
  const provider = getProvider();
  const token = getTokenContract();

  const currentBlock = await provider.getBlockNumber();
  let fromBlock = await dynamo.getLastPolledBlock();

  if (fromBlock === null) {
    fromBlock = Math.max(0, currentBlock - config.pollBlockRange);
  } else {
    fromBlock = fromBlock + 1;
  }

  if (fromBlock > currentBlock) {
    console.log(`No new blocks. Current: ${currentBlock}`);
    return { processed: 0 };
  }

  console.log(`Polling token events: blocks ${fromBlock} to ${currentBlock}`);

  // Query Transfer events
  const transferFilter = token.filters.Transfer();
  const transferLogs = await token.queryFilter(transferFilter, fromBlock, currentBlock);

  // Query delegation events
  const delegateFilter = token.filters.DelegateChanged();
  const delegateLogs = await token.queryFilter(delegateFilter, fromBlock, currentBlock);

  const votesFilter = token.filters.DelegateVotesChanged();
  const votesLogs = await token.queryFilter(votesFilter, fromBlock, currentBlock);

  const allLogs = [...transferLogs, ...delegateLogs, ...votesLogs];
  console.log(`Found ${allLogs.length} events (${transferLogs.length} transfers)`);

  // Get block timestamps
  const blockNumbers = [...new Set(allLogs.map((l) => l.blockNumber))];
  const blockTimestamps = {};
  for (const bn of blockNumbers) {
    const block = await provider.getBlock(bn);
    blockTimestamps[bn] = block ? block.timestamp : Math.floor(Date.now() / 1000);
  }

  let processed = 0;

  // Index transfers (double-indexed by sender and recipient)
  for (const log of transferLogs) {
    const transfer = parseTransfer(log, blockTimestamps[log.blockNumber]);
    await dynamo.putTransfer(transfer);
    processed++;
  }

  // Index delegation events
  for (const log of [...delegateLogs, ...votesLogs]) {
    if (!log.fragment) continue;
    const event = parseEvent(log, blockTimestamps[log.blockNumber]);
    await dynamo.putTokenEvent(event);
    processed++;
  }

  await dynamo.putLastPolledBlock(currentBlock);

  console.log(`Processed ${processed} token events through block ${currentBlock}`);
  return { processed, fromBlock, toBlock: currentBlock };
};
