/**
 * @file tenantScope.js
 * @description Helpers for tenant-scoped DynamoDB operations.
 *
 * All DynamoDB records in a multi-tenant system must include a tenantId.
 * This module provides helpers to:
 *   - Add tenantId to items before writing
 *   - Add tenantId filter conditions to queries
 *   - Validate that a record belongs to the requesting tenant
 *
 * Usage:
 *
 *   const { scopedPutItem, scopedQuery, scopedGetItem } = require("nge-auth/src/tenantScope");
 *
 *   // Write with automatic tenantId injection
 *   await scopedPutItem(dynamodb, "MyTable", tenantId, {
 *     pk: { S: "device#123" },
 *     name: { S: "Sensor A" },
 *   });
 *
 *   // Query with automatic tenantId filter
 *   const items = await scopedQuery(dynamodb, {
 *     TableName: "MyTable",
 *     IndexName: "deviceId-index",
 *     KeyConditionExpression: "deviceId = :d",
 *     ExpressionAttributeValues: { ":d": { N: "123" } },
 *   }, tenantId);
 */

const {
  PutItemCommand,
  GetItemCommand,
  QueryCommand,
} = require("@aws-sdk/client-dynamodb");

/**
 * PutItem with automatic tenantId injection.
 *
 * @param {DynamoDBClient} client
 * @param {string} tableName
 * @param {string} tenantId
 * @param {Object} item - DynamoDB attribute map (without tenantId)
 * @returns {Promise}
 */
async function scopedPutItem(client, tableName, tenantId, item) {
  return client.send(
    new PutItemCommand({
      TableName: tableName,
      Item: {
        ...item,
        tenantId: { S: tenantId },
      },
    })
  );
}

/**
 * GetItem with tenant validation. Returns null if item doesn't belong
 * to the given tenant.
 *
 * @param {DynamoDBClient} client
 * @param {string} tableName
 * @param {Object} key - DynamoDB key
 * @param {string} tenantId
 * @returns {Promise<Object|null>} The item or null
 */
async function scopedGetItem(client, tableName, key, tenantId) {
  const result = await client.send(
    new GetItemCommand({ TableName: tableName, Key: key })
  );

  if (!result.Item) return null;

  // Verify tenant ownership
  if (result.Item.tenantId?.S !== tenantId) return null;

  return result.Item;
}

/**
 * Query with automatic tenantId filter condition.
 *
 * @param {DynamoDBClient} client
 * @param {Object} params - Standard DynamoDB QueryCommand params
 * @param {string} tenantId
 * @returns {Promise<Object[]>} Array of matching items
 */
async function scopedQuery(client, params, tenantId) {
  const filterExpr = params.FilterExpression
    ? `(${params.FilterExpression}) AND tenantId = :_tenantId`
    : "tenantId = :_tenantId";

  const result = await client.send(
    new QueryCommand({
      ...params,
      FilterExpression: filterExpr,
      ExpressionAttributeValues: {
        ...params.ExpressionAttributeValues,
        ":_tenantId": { S: tenantId },
      },
    })
  );

  return result.Items || [];
}

module.exports = { scopedPutItem, scopedGetItem, scopedQuery };
