/**
 * @file dynamo.js
 * @description DynamoDB helper for token events, transfer history, and governance data.
 * Uses AWS SDK v3 (provided by Lambda runtime).
 */
const config = require("./config");

let _ddbSdk = null;
let _docSdk = null;
let _client = null;

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

function docSdk() {
  if (!_docSdk) _docSdk = require("@aws-sdk/lib-dynamodb");
  return _docSdk;
}

const TTL_DAYS = 90;
function ttl() {
  return Math.floor(Date.now() / 1000) + TTL_DAYS * 86400;
}

// ─── Token Events ──────────────────────────────────────────

async function putTransfer(transfer) {
  const client = getClient();
  await client.send(
    new (docSdk().PutCommand)({
      TableName: config.eventsTable,
      Item: {
        pk: `TRANSFER#${transfer.from}`,
        sk: `${transfer.blockNumber}#${transfer.transactionHash}#${transfer.logIndex}`,
        ...transfer,
        ttl: ttl(),
      },
    })
  );
  // Also store by recipient for lookups
  await client.send(
    new (docSdk().PutCommand)({
      TableName: config.eventsTable,
      Item: {
        pk: `TRANSFER#${transfer.to}`,
        sk: `${transfer.blockNumber}#${transfer.transactionHash}#${transfer.logIndex}`,
        ...transfer,
        ttl: ttl(),
      },
    })
  );
}

async function getTransfers(address, limit = 50) {
  const client = getClient();
  const result = await client.send(
    new (docSdk().QueryCommand)({
      TableName: config.eventsTable,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": `TRANSFER#${address}` },
      ScanIndexForward: false,
      Limit: limit,
    })
  );
  return result.Items || [];
}

async function putTokenEvent(event) {
  const client = getClient();
  await client.send(
    new (docSdk().PutCommand)({
      TableName: config.eventsTable,
      Item: {
        pk: `EVENT#${event.eventName}`,
        sk: `${event.blockNumber}#${event.transactionHash}`,
        ...event,
        ttl: ttl(),
      },
    })
  );
}

async function putLastPolledBlock(blockNumber) {
  const client = getClient();
  await client.send(
    new (docSdk().PutCommand)({
      TableName: config.eventsTable,
      Item: {
        pk: "POLL_CURSOR",
        sk: "TOKEN_EVENTS",
        blockNumber,
        updatedAt: Math.floor(Date.now() / 1000),
      },
    })
  );
}

async function getLastPolledBlock() {
  const client = getClient();
  const result = await client.send(
    new (docSdk().GetCommand)({
      TableName: config.eventsTable,
      Key: { pk: "POLL_CURSOR", sk: "TOKEN_EVENTS" },
    })
  );
  return result.Item ? result.Item.blockNumber : null;
}

// ─── Governance ────────────────────────────────────────────

async function putProposal(proposal) {
  const client = getClient();
  await client.send(
    new (docSdk().PutCommand)({
      TableName: config.governanceTable,
      Item: {
        pk: "PROPOSAL",
        sk: proposal.proposalId,
        ...proposal,
        ttl: ttl(),
      },
    })
  );
}

async function getProposals(limit = 50) {
  const client = getClient();
  const result = await client.send(
    new (docSdk().QueryCommand)({
      TableName: config.governanceTable,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": "PROPOSAL" },
      ScanIndexForward: false,
      Limit: limit,
    })
  );
  return result.Items || [];
}

async function putVote(vote) {
  const client = getClient();
  await client.send(
    new (docSdk().PutCommand)({
      TableName: config.governanceTable,
      Item: {
        pk: `VOTE#${vote.proposalId}`,
        sk: `${vote.voter}`,
        ...vote,
        ttl: ttl(),
      },
    })
  );
}

async function getVotes(proposalId, limit = 200) {
  const client = getClient();
  const result = await client.send(
    new (docSdk().QueryCommand)({
      TableName: config.governanceTable,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": `VOTE#${proposalId}` },
      Limit: limit,
    })
  );
  return result.Items || [];
}

async function putGovernanceCursor(blockNumber) {
  const client = getClient();
  await client.send(
    new (docSdk().PutCommand)({
      TableName: config.governanceTable,
      Item: {
        pk: "POLL_CURSOR",
        sk: "GOVERNANCE_EVENTS",
        blockNumber,
        updatedAt: Math.floor(Date.now() / 1000),
      },
    })
  );
}

async function getGovernanceCursor() {
  const client = getClient();
  const result = await client.send(
    new (docSdk().GetCommand)({
      TableName: config.governanceTable,
      Key: { pk: "POLL_CURSOR", sk: "GOVERNANCE_EVENTS" },
    })
  );
  return result.Item ? result.Item.blockNumber : null;
}

module.exports = {
  putTransfer,
  getTransfers,
  putTokenEvent,
  putLastPolledBlock,
  getLastPolledBlock,
  putProposal,
  getProposals,
  putVote,
  getVotes,
  putGovernanceCursor,
  getGovernanceCursor,
};
