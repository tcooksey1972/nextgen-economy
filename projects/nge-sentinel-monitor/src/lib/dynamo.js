/**
 * @file dynamo.js
 * @description DynamoDB helper for storing and retrieving Sentinel events
 * and contract state snapshots.
 *
 * Uses the AWS SDK v3 DynamoDB Document Client (included in Lambda runtime,
 * no extra dependency needed). All items include a TTL field for automatic
 * cleanup of old data (90-day retention by default).
 */
const config = require("./config");

/**
 * Lazily loaded AWS SDK modules (provided by Lambda runtime, not installed locally).
 * @type {Object|null}
 */
let _ddbSdk = null;
let _docSdk = null;

/** @type {Object|null} */
let _client = null;

/**
 * Returns a cached DynamoDB Document Client. Reuses across warm starts.
 * AWS SDK modules are loaded lazily (they exist in Lambda runtime but
 * not in local dev/test environments).
 *
 * @returns {Object} DynamoDBDocumentClient instance.
 */
function getClient() {
  if (!_client) {
    if (!_ddbSdk) _ddbSdk = require("@aws-sdk/client-dynamodb");
    if (!_docSdk) _docSdk = require("@aws-sdk/lib-dynamodb");
    const ddb = new _ddbSdk.DynamoDBClient({});
    _client = _docSdk.DynamoDBDocumentClient.from(ddb, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return _client;
}

/** Helper to get SDK command classes lazily. */
function docSdk() {
  if (!_docSdk) _docSdk = require("@aws-sdk/lib-dynamodb");
  return _docSdk;
}

/** Default TTL: 90 days from now (in seconds). */
const TTL_DAYS = 90;
function ttl() {
  return Math.floor(Date.now() / 1000) + TTL_DAYS * 86400;
}

/**
 * Stores a contract event in the events table.
 *
 * @param {Object} event - Parsed event data.
 * @param {string} event.eventName - e.g., "WatchdogAlerted", "OutflowRecorded".
 * @param {number} event.blockNumber - Block number where the event occurred.
 * @param {string} event.transactionHash - Transaction hash.
 * @param {number} event.timestamp - Block timestamp (unix seconds).
 * @param {Object} event.args - Decoded event arguments.
 * @returns {Promise<void>}
 */
async function putEvent(event) {
  const client = getClient();
  await client.send(
    new (docSdk().PutCommand)({
      TableName: config.eventsTable,
      Item: {
        pk: `EVENT#${event.eventName}`,
        sk: `${event.blockNumber}#${event.transactionHash}`,
        eventName: event.eventName,
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
        timestamp: event.timestamp,
        args: event.args,
        ttl: ttl(),
      },
    })
  );
}

/**
 * Retrieves recent events of a given type, newest first.
 *
 * @param {string} eventName - Event name to query.
 * @param {number} [limit=50] - Maximum number of events to return.
 * @returns {Promise<Object[]>} Array of event items.
 */
async function getRecentEvents(eventName, limit = 50) {
  const client = getClient();
  const result = await client.send(
    new (docSdk().QueryCommand)({
      TableName: config.eventsTable,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": `EVENT#${eventName}` },
      ScanIndexForward: false, // newest first
      Limit: limit,
    })
  );
  return result.Items || [];
}

/**
 * Retrieves all recent events across all types (up to limit per type).
 *
 * @param {number} [limit=20] - Max events per type.
 * @returns {Promise<Object[]>} Combined array sorted by timestamp descending.
 */
async function getAllRecentEvents(limit = 20) {
  const eventTypes = [
    "WatchdogAlerted",
    "OutflowRecorded",
    "HeartbeatReceived",
    "SwitchActivated",
    "EmergencyProposed",
    "EmergencyApproved",
    "EmergencyExecuted",
    "EmergencyCancelled",
    "RateLimitChanged",
    "RateLimitReset",
    "Deposited",
    "Withdrawn",
  ];

  const queries = eventTypes.map((name) => getRecentEvents(name, limit));
  const results = await Promise.all(queries);
  const all = results.flat();
  all.sort((a, b) => b.timestamp - a.timestamp);
  return all.slice(0, limit * 2);
}

/**
 * Stores a contract state snapshot.
 *
 * @param {Object} state - Vault state from contract.getVaultState().
 * @returns {Promise<void>}
 */
async function putState(state) {
  const client = getClient();
  await client.send(
    new (docSdk().PutCommand)({
      TableName: config.stateTable,
      Item: {
        pk: "VAULT_STATE",
        sk: "LATEST",
        ...state,
        ttl: ttl(),
      },
    })
  );
}

/**
 * Retrieves the latest vault state snapshot.
 *
 * @returns {Promise<Object|null>} State object or null if not found.
 */
async function getLatestState() {
  const client = getClient();
  const result = await client.send(
    new (docSdk().GetCommand)({
      TableName: config.stateTable,
      Key: { pk: "VAULT_STATE", sk: "LATEST" },
    })
  );
  return result.Item || null;
}

/**
 * Stores the last polled block number to avoid re-processing events.
 *
 * @param {number} blockNumber - The last block number that was polled.
 * @returns {Promise<void>}
 */
async function putLastPolledBlock(blockNumber) {
  const client = getClient();
  await client.send(
    new (docSdk().PutCommand)({
      TableName: config.stateTable,
      Item: {
        pk: "POLL_CURSOR",
        sk: "LATEST",
        blockNumber,
        updatedAt: Math.floor(Date.now() / 1000),
      },
    })
  );
}

/**
 * Retrieves the last polled block number.
 *
 * @returns {Promise<number|null>} Block number or null if never polled.
 */
async function getLastPolledBlock() {
  const client = getClient();
  const result = await client.send(
    new (docSdk().GetCommand)({
      TableName: config.stateTable,
      Key: { pk: "POLL_CURSOR", sk: "LATEST" },
    })
  );
  return result.Item ? result.Item.blockNumber : null;
}

module.exports = {
  putEvent,
  getRecentEvents,
  getAllRecentEvents,
  putState,
  getLatestState,
  putLastPolledBlock,
  getLastPolledBlock,
};
