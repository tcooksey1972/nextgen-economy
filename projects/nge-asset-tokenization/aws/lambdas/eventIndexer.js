/**
 * @file eventIndexer.js
 * @description Scheduled Lambda that polls the blockchain for asset contract
 *              events and indexes them in DynamoDB.
 *
 * Triggered every 1 minute by EventBridge. Maintains a cursor in DynamoDB
 * to track the last polled block, ensuring no events are missed.
 *
 * Indexed events: AssetRegistered, AssetStatusChanged, AssetDisposed,
 * IdentifierLinked, JournalEntryRecorded, DepreciationRecorded,
 * ItemsIssued, ItemsReturned, InspectionRecorded.
 */
const config = require("../lib/config");
const { getProvider, getContract, queryEvents, getAssetSnapshot } = require("../lib/contract");
const dynamo = require("../lib/dynamo");
const alerts = require("../lib/alerts");

/** Event names to poll. */
const EVENT_NAMES = [
  "AssetRegistered",
  "AssetStatusChanged",
  "AssetDisposed",
  "IdentifierLinked",
  "JournalEntryRecorded",
  "DepreciationRecorded",
  "ItemsIssued",
  "ItemsReturned",
  "InspectionRecorded",
];

/**
 * Converts BigInt values in event args to strings for DynamoDB storage.
 */
function serializeArgs(args, fragment) {
  const result = {};
  for (let i = 0; i < fragment.inputs.length; i++) {
    const input = fragment.inputs[i];
    const val = args[i];
    result[input.name] = typeof val === "bigint" ? val.toString() : val;
  }
  return result;
}

exports.handler = async () => {
  const provider = getProvider();
  const contract = getContract();
  const currentBlock = await provider.getBlockNumber();

  // Get cursor or default to pollBlockRange blocks back
  let lastBlock = await dynamo.getLastPolledBlock();
  if (!lastBlock) {
    lastBlock = Math.max(0, currentBlock - config.pollBlockRange);
  }

  const fromBlock = lastBlock + 1;
  if (fromBlock > currentBlock) {
    return { processed: 0, message: "No new blocks" };
  }

  let totalProcessed = 0;

  for (const eventName of EVENT_NAMES) {
    try {
      const events = await queryEvents(eventName, fromBlock, currentBlock);

      for (const event of events) {
        const block = await provider.getBlock(event.blockNumber);
        const fragment = contract.interface.getEvent(eventName);
        const decoded = serializeArgs(event.args, fragment);

        await dynamo.putEvent({
          eventName,
          blockNumber: event.blockNumber,
          transactionHash: event.transactionHash,
          timestamp: block?.timestamp || 0,
          args: decoded,
        });

        // Update asset snapshot if this event affects an asset
        if (decoded.tokenId !== undefined) {
          try {
            const snapshot = await getAssetSnapshot(Number(decoded.tokenId));
            await dynamo.putAsset(snapshot);
          } catch (err) {
            console.warn(`Failed to snapshot asset ${decoded.tokenId}:`, err.message);
          }
        }

        // Alert on inspection discrepancies
        if (eventName === "InspectionRecorded" && decoded.discrepancy) {
          await alerts.warning(
            "Inspection Discrepancy",
            `Asset #${decoded.tokenId}: physical=${decoded.physicalCount}, on-chain=${decoded.onChainBalance}`,
            decoded
          );
        }

        // Alert on large disposals
        if (eventName === "AssetDisposed") {
          await alerts.info("Asset Disposed", `Asset #${decoded.tokenId}: ${decoded.amount} units`, decoded);
        }

        totalProcessed++;
      }
    } catch (err) {
      console.error(`Error polling ${eventName}:`, err.message);
    }
  }

  await dynamo.putLastPolledBlock(currentBlock);

  return {
    processed: totalProcessed,
    fromBlock,
    toBlock: currentBlock,
  };
};
