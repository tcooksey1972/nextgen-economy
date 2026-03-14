/**
 * @file processTransferEvent.js
 * @description Lambda handler for processing NGE token Transfer events.
 *
 * Free Tier notes:
 *   - Lambda: 256 MB memory for ethers.js event parsing. At moderate transfer
 *     volume (~1K transfers/day), expect ~30K invocations/mo — well within 1M
 *     free tier limit.
 *   - DynamoDB: Updates balance cache + writes transfer history. ~60K writes/mo
 *     at 1K transfers/day — negligible vs 200M free tier.
 *   - EventBridge schedule triggers this every 1 minute. 43,200 invocations/mo
 *     from the schedule alone — still well under 1M.
 *
 * This Lambda polls for Transfer events from the NGE token contract, updates
 * the DynamoDB balance cache, and stores transfer history for fast queries.
 *
 * @see aws/cloudformation/token-api.yaml
 */
const { ethers } = require("ethers");
const {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  UpdateItemCommand,
} = require("@aws-sdk/client-dynamodb");

const TOKEN_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event TokensMinted(address indexed to, uint256 amount, address indexed minter)",
  "function balanceOf(address account) external view returns (uint256)",
  "function getVotes(address account) external view returns (uint256)",
  "function delegates(address account) external view returns (address)",
];

const dynamodb = new DynamoDBClient({});
let cachedProvider = null;

function getProvider() {
  if (!cachedProvider) {
    cachedProvider = new ethers.JsonRpcProvider(process.env.ETH_RPC_URL);
  }
  return cachedProvider;
}

/**
 * Fetches and stores the last processed block number from DynamoDB.
 */
async function getLastBlock() {
  const result = await dynamodb.send(
    new GetItemCommand({
      TableName: process.env.METADATA_TABLE,
      Key: { key: { S: "lastProcessedBlock" } },
    })
  );
  return result.Item ? Number(result.Item.value.N) : 0;
}

async function setLastBlock(blockNumber) {
  await dynamodb.send(
    new PutItemCommand({
      TableName: process.env.METADATA_TABLE,
      Item: {
        key: { S: "lastProcessedBlock" },
        value: { N: String(blockNumber) },
        updatedAt: { S: new Date().toISOString() },
      },
    })
  );
}

/**
 * Updates the cached balance for an address in DynamoDB.
 */
async function updateBalanceCache(token, address) {
  if (address === ethers.ZeroAddress) return;

  const [balance, votingPower, delegate] = await Promise.all([
    token.balanceOf(address),
    token.getVotes(address),
    token.delegates(address),
  ]);

  await dynamodb.send(
    new PutItemCommand({
      TableName: process.env.BALANCES_TABLE,
      Item: {
        address: { S: address },
        balance: { S: balance.toString() },
        votingPower: { S: votingPower.toString() },
        delegate: { S: delegate },
        updatedAt: { S: new Date().toISOString() },
      },
    })
  );
}

exports.handler = async () => {
  const provider = getProvider();
  const token = new ethers.Contract(
    process.env.CONTRACT_ADDRESS,
    TOKEN_ABI,
    provider
  );

  const lastBlock = await getLastBlock();
  const currentBlock = await provider.getBlockNumber();

  if (lastBlock >= currentBlock) {
    console.log("No new blocks to process");
    return { processed: 0 };
  }

  // Limit batch size to avoid Lambda timeout (process max 1000 blocks at a time)
  const toBlock = Math.min(lastBlock + 1000, currentBlock);

  const filter = token.filters.Transfer();
  const events = await token.queryFilter(filter, lastBlock + 1, toBlock);

  console.log(`Processing ${events.length} Transfer events (blocks ${lastBlock + 1}-${toBlock})`);

  const affectedAddresses = new Set();

  for (const event of events) {
    const { from, to, value } = event.args;
    const block = await event.getBlock();

    // Store transfer history
    await dynamodb.send(
      new PutItemCommand({
        TableName: process.env.TRANSFERS_TABLE,
        Item: {
          transactionHash: { S: event.transactionHash },
          logIndex: { N: String(event.index) },
          from: { S: from },
          to: { S: to },
          value: { S: value.toString() },
          valueFormatted: { S: ethers.formatEther(value) },
          blockNumber: { N: String(event.blockNumber) },
          timestamp: { S: new Date(block.timestamp * 1000).toISOString() },
        },
      })
    );

    affectedAddresses.add(from);
    affectedAddresses.add(to);
  }

  // Update balance cache for all affected addresses
  for (const addr of affectedAddresses) {
    await updateBalanceCache(token, addr);
  }

  await setLastBlock(toBlock);

  console.log(`Processed ${events.length} events, updated ${affectedAddresses.size} balances`);

  return {
    processed: events.length,
    fromBlock: lastBlock + 1,
    toBlock,
    addressesUpdated: affectedAddresses.size,
  };
};
