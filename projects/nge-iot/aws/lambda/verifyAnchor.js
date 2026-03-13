/**
 * @file verifyAnchor.js
 * @description Lambda handler for verifying data integrity via on-chain anchors.
 *
 * Flow:
 *   1. Client sends a verification request via API Gateway
 *   2. Lambda checks DynamoDB for the anchor record (fast path)
 *   3. Optionally verifies against the blockchain (trustless path)
 *   4. Returns verification result with provenance details
 *
 * Environment Variables:
 *   - ETH_RPC_URL:      Ethereum JSON-RPC endpoint
 *   - CONTRACT_ADDRESS:  AnchoredDeviceRegistry contract address
 *   - ANCHORS_TABLE:     Data anchors DynamoDB table
 *
 * @see aws/cloudformation/iot-blockchain-bridge.yaml
 */
const { ethers } = require("ethers");
const { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");

const ANCHOR_ABI = [
  "function isAnchored(bytes32 dataHash) external view returns (bool)",
  "function getAnchor(bytes32 dataHash) external view returns (uint256 deviceId, uint256 timestamp, uint256 blockNumber)",
  "function deviceAnchorCount(uint256 deviceId) external view returns (uint256)",
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
 * Lambda handler — verifies data was anchored on-chain.
 *
 * @param {Object} event - API Gateway event
 * @param {string} event.queryStringParameters.dataHash - Data hash to verify
 * @param {string} [event.queryStringParameters.payload] - Raw payload to hash and verify
 * @param {boolean} [event.queryStringParameters.onchain] - Force on-chain verification
 * @returns {Object} Verification result
 */
exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  let { dataHash, payload, onchain } = params;

  // If raw payload provided, compute its hash
  if (!dataHash && payload) {
    const parsed = JSON.parse(payload);
    const canonical = JSON.stringify(parsed, Object.keys(parsed).sort());
    dataHash = ethers.keccak256(ethers.toUtf8Bytes(canonical));
  }

  if (!dataHash) {
    return response(400, { error: "Missing dataHash or payload parameter" });
  }

  // Fast path: check DynamoDB cache
  const dbResult = await dynamodb.send(
    new GetItemCommand({
      TableName: process.env.ANCHORS_TABLE,
      Key: { dataHash: { S: dataHash } },
    })
  );

  let offchainRecord = null;
  if (dbResult.Item) {
    offchainRecord = {
      deviceId: Number(dbResult.Item.deviceId.N),
      thingName: dbResult.Item.thingName.S,
      transactionHash: dbResult.Item.transactionHash.S,
      blockNumber: Number(dbResult.Item.blockNumber.N),
      anchoredAt: dbResult.Item.anchoredAt.S,
      type: dbResult.Item.type.S,
    };
  }

  // On-chain verification (trustless)
  let onchainRecord = null;
  if (onchain === "true" || !offchainRecord) {
    const provider = getProvider();
    const anchor = new ethers.Contract(
      process.env.CONTRACT_ADDRESS,
      ANCHOR_ABI,
      provider
    );

    const isOnChain = await anchor.isAnchored(dataHash);

    if (isOnChain) {
      const [deviceId, timestamp, blockNumber] = await anchor.getAnchor(dataHash);
      onchainRecord = {
        verified: true,
        deviceId: Number(deviceId),
        timestamp: Number(timestamp),
        blockNumber: Number(blockNumber),
      };
    } else {
      onchainRecord = { verified: false };
    }
  }

  const verified = onchainRecord
    ? onchainRecord.verified
    : offchainRecord !== null;

  return response(200, {
    dataHash,
    verified,
    offchain: offchainRecord,
    onchain: onchainRecord,
  });
};

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
