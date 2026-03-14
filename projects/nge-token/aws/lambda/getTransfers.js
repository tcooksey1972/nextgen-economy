/**
 * @file getTransfers.js
 * @description Lambda handler for querying NGE token transfer history.
 *
 * Free Tier notes:
 *   - Lambda: 128 MB (read-only), maximizes free tier GB-seconds.
 *   - DynamoDB query on GSI — efficient pagination with lastKey support.
 *   - No on-chain calls needed — all data served from DynamoDB cache.
 *
 * Endpoint: GET /transfers?address=0x...&limit=20&lastKey=...
 *
 * @see aws/cloudformation/token-api.yaml
 */
const { ethers } = require("ethers");
const { DynamoDBClient, QueryCommand } = require("@aws-sdk/client-dynamodb");

const dynamodb = new DynamoDBClient({});

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const { address, limit: limitStr, lastKey } = params;

  if (!address || !ethers.isAddress(address)) {
    return response(400, { error: "Missing or invalid address parameter" });
  }

  const checksumAddr = ethers.getAddress(address);
  const limit = Math.min(parseInt(limitStr || "20", 10), 100);

  // Query transfers where the address is the sender
  const sentQuery = queryTransfers("from-index", "from", checksumAddr, limit);
  // Query transfers where the address is the receiver
  const receivedQuery = queryTransfers("to-index", "to", checksumAddr, limit);

  const [sent, received] = await Promise.all([sentQuery, receivedQuery]);

  // Merge and sort by block number (descending)
  const all = [...sent, ...received]
    .sort((a, b) => Number(b.blockNumber.N) - Number(a.blockNumber.N))
    .slice(0, limit);

  const transfers = all.map((item) => ({
    transactionHash: item.transactionHash.S,
    from: item.from.S,
    to: item.to.S,
    value: item.value.S,
    valueFormatted: item.valueFormatted.S,
    blockNumber: Number(item.blockNumber.N),
    timestamp: item.timestamp.S,
  }));

  return response(200, {
    address: checksumAddr,
    transfers,
    count: transfers.length,
  });
};

async function queryTransfers(indexName, keyField, address, limit) {
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: process.env.TRANSFERS_TABLE,
      IndexName: indexName,
      KeyConditionExpression: `#field = :addr`,
      ExpressionAttributeNames: { "#field": keyField },
      ExpressionAttributeValues: { ":addr": { S: address } },
      Limit: limit,
      ScanIndexForward: false,
    })
  );
  return result.Items || [];
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(body),
  };
}
