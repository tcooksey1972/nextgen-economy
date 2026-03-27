/**
 * @file dynamo.js
 * @description DynamoDB helpers for the nge-identity platform.
 *
 * Single-table design:
 *   PK=DID#{hash}     SK=PROFILE                     → DID metadata
 *   PK=DID#{hash}     SK=CREDENTIAL#{credentialId}    → Credential reference
 *   PK=DID#{hash}     SK=LISTING#{listingId}          → Marketplace listing
 *   PK=CRED#{id}      SK=DETAIL                       → Credential details
 *   PK=ISSUER#{did}   SK=CREDENTIAL#{credentialId}    → Issuer's credentials
 *   PK=LISTING#{id}   SK=DETAIL                       → Listing details
 *   PK=DEVICE#{did}   SK=BATCH#{batchId}              → Sensor data batch
 *   PK=STATE#{code}   SK=SCHEMA                       → State ID schema
 */
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
} = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

/**
 * Puts an item into a DynamoDB table.
 */
async function putItem(tableName, item) {
  await docClient.send(new PutCommand({ TableName: tableName, Item: item }));
}

/**
 * Gets an item from a DynamoDB table.
 */
async function getItem(tableName, pk, sk) {
  const result = await docClient.send(
    new GetCommand({ TableName: tableName, Key: { pk, sk } })
  );
  return result.Item || null;
}

/**
 * Queries items by partition key.
 */
async function queryByPK(tableName, pk, limit = 50) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": pk },
      Limit: limit,
      ScanIndexForward: false,
    })
  );
  return result.Items || [];
}

/**
 * Queries items by partition key with a sort key prefix.
 */
async function queryByPKAndSKPrefix(tableName, pk, skPrefix, limit = 50) {
  const result = await docClient.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :skPrefix)",
      ExpressionAttributeValues: { ":pk": pk, ":skPrefix": skPrefix },
      Limit: limit,
      ScanIndexForward: false,
    })
  );
  return result.Items || [];
}

module.exports = { putItem, getItem, queryByPK, queryByPKAndSKPrefix };
