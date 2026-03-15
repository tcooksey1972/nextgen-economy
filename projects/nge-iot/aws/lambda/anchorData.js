/**
 * @file anchorData.js
 * @description Lambda handler for anchoring IoT sensor data on-chain.
 *
 * Free Tier notes:
 *   - This is the highest-volume Lambda. At 50 devices / 5-min intervals with
 *     30-min batch windows, expect ~72K invocations/mo — well within the 1M
 *     free tier limit. Batch mode is critical for staying within free tier:
 *     it reduces invocations by 6x vs single-anchor mode.
 *   - DynamoDB writes: ~72K/mo (one per batch) — negligible vs 200M free tier.
 *   - IoT Core messages: ~432K/mo ($0.43) — covered by $200 credit.
 *   - For high-frequency devices (>1 msg/sec), consider IoT Core Basic Ingest
 *     ($aws/rules/{rule}/topic) to eliminate per-message IoT charges entirely.
 *
 * Flow:
 *   1. Device publishes sensor data to MQTT topic `nge/devices/{thingName}/data`
 *   2. IoT Rule triggers this Lambda
 *   3. Lambda hashes the sensor payload and calls DataAnchor.anchorData()
 *   4. Stores the anchor record in DynamoDB for fast off-chain queries
 *
 * Supports both single and batch anchoring. For high-frequency devices,
 * batch mode accumulates readings in SQS and anchors them periodically.
 *
 * Environment Variables:
 *   - ETH_RPC_URL:        Ethereum JSON-RPC endpoint
 *   - CONTRACT_ADDRESS:   AnchoredDeviceRegistry contract address
 *   - SIGNER_PRIVATE_KEY: Authorized relayer wallet private key
 *   - DYNAMODB_TABLE:     Device mapping table
 *   - ANCHORS_TABLE:      Data anchors table
 *
 * @see aws/cloudformation/iot-blockchain-bridge.yaml
 */
const { ethers } = require("ethers");
const { DynamoDBClient, PutItemCommand, GetItemCommand } = require("@aws-sdk/client-dynamodb");

const ANCHOR_ABI = [
  "function anchorData(uint256 deviceId, bytes32 dataHash) external",
  "function anchorBatch(uint256 deviceId, bytes32[] dataHashes) external",
  "event DataAnchored(uint256 indexed deviceId, bytes32 indexed dataHash, uint256 timestamp, uint256 nonce)",
  "event BatchAnchored(uint256 indexed deviceId, bytes32 indexed batchRoot, uint256 count, uint256 timestamp)",
];

const dynamodb = new DynamoDBClient({});

let cachedProvider = null;
let cachedSigner = null;

async function getSignerAndProvider() {
  if (cachedSigner) return { provider: cachedProvider, signer: cachedSigner };

  cachedProvider = new ethers.JsonRpcProvider(process.env.ETH_RPC_URL);
  cachedSigner = new ethers.Wallet(process.env.SIGNER_PRIVATE_KEY, cachedProvider);
  return { provider: cachedProvider, signer: cachedSigner };
}

/**
 * Resolves an AWS IoT Thing name to the on-chain device ID via DynamoDB.
 *
 * @param {string} thingName - AWS IoT Thing name
 * @returns {number} On-chain device ID
 */
/**
 * Resolves an AWS IoT Thing name to the on-chain device ID and tenantId via DynamoDB.
 *
 * @param {string} thingName - AWS IoT Thing name
 * @returns {{ deviceId: number, tenantId: string }} On-chain device ID and tenant
 */
async function resolveDevice(thingName) {
  const result = await dynamodb.send(
    new GetItemCommand({
      TableName: process.env.DYNAMODB_TABLE,
      Key: { thingName: { S: thingName } },
    })
  );

  if (!result.Item) {
    throw new Error(`Unknown device: ${thingName}. Register it first.`);
  }

  return {
    deviceId: Number(result.Item.deviceId.N),
    tenantId: result.Item.tenantId?.S || null,
  };
}

/**
 * Lambda handler — anchors IoT sensor data on-chain.
 *
 * Single anchor mode:
 * @param {Object} event
 * @param {string} event.thingName - AWS IoT Thing name
 * @param {Object} event.payload - Raw sensor data (temperature, humidity, etc.)
 *
 * Batch anchor mode:
 * @param {Object} event
 * @param {string} event.thingName - AWS IoT Thing name
 * @param {Object[]} event.payloads - Array of sensor readings
 *
 * @returns {Object} { dataHash, transactionHash, deviceId }
 */
exports.handler = async (event) => {
  console.log("AnchorData event:", JSON.stringify(event));

  const { thingName, payload, payloads } = event;

  if (!thingName) {
    throw new Error("Missing required field: thingName");
  }

  const { deviceId, tenantId } = await resolveDevice(thingName);
  const { signer } = await getSignerAndProvider();
  const anchor = new ethers.Contract(
    process.env.CONTRACT_ADDRESS,
    ANCHOR_ABI,
    signer
  );

  let result;

  if (payloads && Array.isArray(payloads) && payloads.length > 0) {
    // Batch mode
    result = await handleBatch(anchor, deviceId, thingName, payloads, tenantId);
  } else if (payload) {
    // Single mode
    result = await handleSingle(anchor, deviceId, thingName, payload, tenantId);
  } else {
    throw new Error("Missing required field: payload or payloads");
  }

  return { statusCode: 200, body: result };
};

/**
 * Anchors a single sensor reading on-chain.
 */
async function handleSingle(anchor, deviceId, thingName, payload, tenantId) {
  // Hash the canonical JSON representation of the payload
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  const dataHash = ethers.keccak256(ethers.toUtf8Bytes(canonical));

  const tx = await anchor.anchorData(deviceId, dataHash);
  const receipt = await tx.wait();

  // Store in DynamoDB for fast off-chain queries
  const item = {
    dataHash: { S: dataHash },
    deviceId: { N: String(deviceId) },
    thingName: { S: thingName },
    payload: { S: canonical },
    transactionHash: { S: receipt.hash },
    blockNumber: { N: String(receipt.blockNumber) },
    anchoredAt: { S: new Date().toISOString() },
    type: { S: "SINGLE" },
  };
  if (tenantId) item.tenantId = { S: tenantId };

  await dynamodb.send(
    new PutItemCommand({ TableName: process.env.ANCHORS_TABLE, Item: item })
  );

  console.log(`Data anchored: device=${deviceId}, hash=${dataHash}, tx=${receipt.hash}`);

  return {
    dataHash,
    deviceId,
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
  };
}

/**
 * Anchors a batch of sensor readings on-chain as a single root hash.
 */
async function handleBatch(anchor, deviceId, thingName, payloads, tenantId) {
  const dataHashes = payloads.map((p) => {
    const canonical = JSON.stringify(p, Object.keys(p).sort());
    return ethers.keccak256(ethers.toUtf8Bytes(canonical));
  });

  const tx = await anchor.anchorBatch(deviceId, dataHashes);
  const receipt = await tx.wait();

  // Compute batch root (matches on-chain keccak256(abi.encodePacked(hashes)))
  const types = dataHashes.map(() => "bytes32");
  const batchRoot = ethers.keccak256(ethers.solidityPacked(types, dataHashes));

  // Store batch record
  const item = {
    dataHash: { S: batchRoot },
    deviceId: { N: String(deviceId) },
    thingName: { S: thingName },
    individualHashes: { L: dataHashes.map((h) => ({ S: h })) },
    count: { N: String(payloads.length) },
    transactionHash: { S: receipt.hash },
    blockNumber: { N: String(receipt.blockNumber) },
    anchoredAt: { S: new Date().toISOString() },
    type: { S: "BATCH" },
  };
  if (tenantId) item.tenantId = { S: tenantId };

  await dynamodb.send(
    new PutItemCommand({ TableName: process.env.ANCHORS_TABLE, Item: item })
  );

  console.log(`Batch anchored: device=${deviceId}, root=${batchRoot}, count=${payloads.length}, tx=${receipt.hash}`);

  return {
    batchRoot,
    count: payloads.length,
    deviceId,
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
  };
}
