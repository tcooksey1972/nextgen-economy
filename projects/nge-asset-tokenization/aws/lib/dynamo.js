/**
 * @file dynamo.js
 * @description DynamoDB helpers for the Asset Tokenization Lambda functions.
 *
 * Uses AWS SDK v3 (provided by the Lambda runtime — no npm install needed).
 * Lazy-loads the client for warm-start optimization.
 */
const config = require("./config");

let _client = null;

function getClient() {
  if (!_client) {
    const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
    const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
    _client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  }
  return _client;
}

/** TTL: 90 days from now (in seconds). */
function ttl90d() {
  return Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60;
}

// ─── Assets Table ──────────────────────────────────────

/**
 * Stores or updates an asset snapshot.
 * PK: ASSET#{tokenId}, SK: LATEST
 */
async function putAsset(asset) {
  const { PutCommand } = require("@aws-sdk/lib-dynamodb");
  await getClient().send(new PutCommand({
    TableName: config.assetsTable,
    Item: {
      pk: `ASSET#${asset.tokenId}`,
      sk: "LATEST",
      ...asset,
      updatedAt: new Date().toISOString(),
    },
  }));
}

/**
 * Gets a single asset by token ID.
 */
async function getAsset(tokenId) {
  const { GetCommand } = require("@aws-sdk/lib-dynamodb");
  const result = await getClient().send(new GetCommand({
    TableName: config.assetsTable,
    Key: { pk: `ASSET#${tokenId}`, sk: "LATEST" },
  }));
  return result.Item || null;
}

/**
 * Lists all assets (scan — fine for small inventories).
 */
async function listAssets(limit = 100) {
  const { ScanCommand } = require("@aws-sdk/lib-dynamodb");
  const result = await getClient().send(new ScanCommand({
    TableName: config.assetsTable,
    FilterExpression: "sk = :sk",
    ExpressionAttributeValues: { ":sk": "LATEST" },
    Limit: limit,
  }));
  return result.Items || [];
}

// ─── Events Table ──────────────────────────────────────

/**
 * Stores a contract event.
 * PK: EVENT#{eventName}, SK: {blockNumber}#{txHash}
 */
async function putEvent(event) {
  const { PutCommand } = require("@aws-sdk/lib-dynamodb");
  await getClient().send(new PutCommand({
    TableName: config.eventsTable,
    Item: {
      pk: `EVENT#${event.eventName}`,
      sk: `${String(event.blockNumber).padStart(12, "0")}#${event.transactionHash}`,
      ...event,
      ttl: ttl90d(),
    },
  }));
}

/**
 * Gets recent events, optionally filtered by type.
 */
async function getRecentEvents(eventName, limit = 50) {
  const { QueryCommand } = require("@aws-sdk/lib-dynamodb");
  const result = await getClient().send(new QueryCommand({
    TableName: config.eventsTable,
    KeyConditionExpression: "pk = :pk",
    ExpressionAttributeValues: { ":pk": `EVENT#${eventName}` },
    ScanIndexForward: false,
    Limit: limit,
  }));
  return result.Items || [];
}

/**
 * Gets all recent events across all types.
 */
async function getAllRecentEvents(limit = 50) {
  const eventTypes = [
    "AssetRegistered", "AssetStatusChanged", "AssetDisposed",
    "IdentifierLinked", "JournalEntryRecorded", "DepreciationRecorded",
    "ItemsIssued", "ItemsReturned", "InspectionRecorded",
  ];

  const results = await Promise.all(
    eventTypes.map((name) => getRecentEvents(name, limit))
  );

  return results
    .flat()
    .sort((a, b) => (b.sk || "").localeCompare(a.sk || ""))
    .slice(0, limit);
}

// ─── State Table (poll cursor) ─────────────────────────

async function putLastPolledBlock(blockNumber) {
  const { PutCommand } = require("@aws-sdk/lib-dynamodb");
  await getClient().send(new PutCommand({
    TableName: config.stateTable,
    Item: {
      pk: "POLL_CURSOR",
      sk: "LATEST",
      blockNumber,
      updatedAt: new Date().toISOString(),
    },
  }));
}

async function getLastPolledBlock() {
  const { GetCommand } = require("@aws-sdk/lib-dynamodb");
  const result = await getClient().send(new GetCommand({
    TableName: config.stateTable,
    Key: { pk: "POLL_CURSOR", sk: "LATEST" },
  }));
  return result.Item?.blockNumber || null;
}

module.exports = {
  putAsset, getAsset, listAssets,
  putEvent, getRecentEvents, getAllRecentEvents,
  putLastPolledBlock, getLastPolledBlock,
};
