/**
 * @file governancePoller.js
 * @description Polls blockchain for Governor contract events and indexes
 * proposals and votes in DynamoDB for fast API queries.
 *
 * Triggered by EventBridge on a 2-minute schedule.
 *
 * Events indexed:
 *   - ProposalCreated
 *   - ProposalQueued
 *   - ProposalExecuted
 *   - ProposalCanceled
 *   - VoteCast
 */
const { getProvider, getGovernorContract } = require("../lib/contract");
const dynamo = require("../lib/dynamo");
const config = require("../lib/config");

const PROPOSAL_STATES = [
  "Pending", "Active", "Canceled", "Defeated",
  "Succeeded", "Queued", "Expired", "Executed",
];

exports.handler = async (_event) => {
  const governor = getGovernorContract();
  if (!governor) {
    console.log("Governor contract not configured — skipping");
    return { processed: 0 };
  }

  const provider = getProvider();
  const currentBlock = await provider.getBlockNumber();
  let fromBlock = await dynamo.getGovernanceCursor();

  if (fromBlock === null) {
    fromBlock = Math.max(0, currentBlock - config.pollBlockRange);
  } else {
    fromBlock = fromBlock + 1;
  }

  if (fromBlock > currentBlock) {
    console.log(`No new blocks for governance. Current: ${currentBlock}`);
    return { processed: 0 };
  }

  console.log(`Polling governance events: blocks ${fromBlock} to ${currentBlock}`);

  // Query all governor events
  const proposalCreated = await governor.queryFilter(governor.filters.ProposalCreated(), fromBlock, currentBlock);
  const proposalQueued = await governor.queryFilter(governor.filters.ProposalQueued(), fromBlock, currentBlock);
  const proposalExecuted = await governor.queryFilter(governor.filters.ProposalExecuted(), fromBlock, currentBlock);
  const proposalCanceled = await governor.queryFilter(governor.filters.ProposalCanceled(), fromBlock, currentBlock);
  const voteCast = await governor.queryFilter(governor.filters.VoteCast(), fromBlock, currentBlock);

  let processed = 0;

  // Index new proposals
  for (const log of proposalCreated) {
    const proposalId = log.args[0].toString();
    let stateNum = 0;
    try {
      stateNum = Number(await governor.state(log.args[0]));
    } catch { /* proposal may not exist yet */ }

    const proposal = {
      proposalId,
      proposer: log.args[1],
      targets: [...log.args[2]],
      values: [...log.args[3]].map((v) => v.toString()),
      calldatas: [...log.args[5]],
      voteStart: Number(log.args[6]),
      voteEnd: Number(log.args[7]),
      description: log.args[8],
      state: stateNum,
      stateLabel: PROPOSAL_STATES[stateNum] || "Unknown",
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash,
      createdAt: Math.floor(Date.now() / 1000),
    };

    await dynamo.putProposal(proposal);
    processed++;
  }

  // Update proposal state for queued/executed/canceled
  for (const log of [...proposalQueued, ...proposalExecuted, ...proposalCanceled]) {
    const proposalId = log.args[0].toString();
    let stateNum = 0;
    try {
      stateNum = Number(await governor.state(log.args[0]));
    } catch { /* ignore */ }

    // Re-store with updated state
    const existing = (await dynamo.getProposals(200)).find((p) => p.proposalId === proposalId);
    if (existing) {
      existing.state = stateNum;
      existing.stateLabel = PROPOSAL_STATES[stateNum] || "Unknown";
      if (log.fragment?.name === "ProposalQueued") {
        existing.eta = log.args[1] ? Number(log.args[1]) : undefined;
      }
      await dynamo.putProposal(existing);
    }
    processed++;
  }

  // Index votes
  for (const log of voteCast) {
    const supportLabels = ["Against", "For", "Abstain"];
    const vote = {
      proposalId: log.args[1].toString(),
      voter: log.args[0],
      support: Number(log.args[2]),
      supportLabel: supportLabels[Number(log.args[2])] || "Unknown",
      weight: log.args[3].toString(),
      reason: log.args[4] || "",
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash,
      timestamp: Math.floor(Date.now() / 1000),
    };
    await dynamo.putVote(vote);
    processed++;
  }

  await dynamo.putGovernanceCursor(currentBlock);

  const total = proposalCreated.length + proposalQueued.length + proposalExecuted.length + proposalCanceled.length + voteCast.length;
  console.log(`Processed ${processed} governance events (${total} raw) through block ${currentBlock}`);
  return { processed, fromBlock, toBlock: currentBlock };
};
