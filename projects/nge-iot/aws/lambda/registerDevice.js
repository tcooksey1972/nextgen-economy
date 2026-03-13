/**
 * @file registerDevice.js
 * @description Lambda handler for registering an IoT device on-chain.
 *
 * Free Tier notes:
 *   - Lambda: 1M requests + 400K GB-sec/mo (always free). Device registration
 *     is low-frequency — even 1000 devices/month uses <0.1% of the free tier.
 *   - DynamoDB: 25 GB + 200M requests/mo (always free). One write per registration.
 *   - Secrets Manager: $0.40/secret/mo (NOT free tier). Consider SSM Parameter
 *     Store SecureString as a free alternative if you don't need auto-rotation.
 *
 * Flow:
 *   1. AWS IoT Core provisions a new Thing (device)
 *   2. IoT Rule triggers this Lambda via MQTT topic `nge/devices/register`
 *   3. Lambda calls DeviceRegistry.registerDevice() on-chain
 *   4. Returns the on-chain deviceId and transaction hash
 *
 * Environment Variables:
 *   - ETH_RPC_URL:        Ethereum JSON-RPC endpoint (from Secrets Manager)
 *   - CONTRACT_ADDRESS:   DeviceRegistry contract address
 *   - SIGNER_PRIVATE_KEY: Admin wallet private key (from Secrets Manager)
 *   - DYNAMODB_TABLE:     Device mapping table name
 *
 * @see aws/cloudformation/iot-blockchain-bridge.yaml
 */
const { ethers } = require("ethers");
const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");

const REGISTRY_ABI = [
  "function registerDevice(address owner, bytes32 fwHash, string uri) external returns (uint256)",
  "event DeviceRegistered(uint256 indexed deviceId, address indexed owner, bytes32 firmwareHash)",
];

const dynamodb = new DynamoDBClient({});
const secrets = new SecretsManagerClient({});

let cachedProvider = null;
let cachedSigner = null;

/**
 * Initializes ethers provider and signer from Secrets Manager.
 * Caches across warm Lambda invocations.
 */
async function getSignerAndProvider() {
  if (cachedSigner) return { provider: cachedProvider, signer: cachedSigner };

  const rpcUrl = process.env.ETH_RPC_URL;
  const privateKey = process.env.SIGNER_PRIVATE_KEY;

  // In production, fetch from Secrets Manager instead of env vars:
  // const secret = await secrets.send(new GetSecretValueCommand({
  //   SecretId: process.env.SECRET_ARN,
  // }));
  // const { rpcUrl, privateKey } = JSON.parse(secret.SecretString);

  cachedProvider = new ethers.JsonRpcProvider(rpcUrl);
  cachedSigner = new ethers.Wallet(privateKey, cachedProvider);
  return { provider: cachedProvider, signer: cachedSigner };
}

/**
 * Lambda handler — registers a device on the blockchain DeviceRegistry.
 *
 * @param {Object} event - Event from IoT Rule or API Gateway
 * @param {string} event.thingName - AWS IoT Thing name
 * @param {string} event.ownerAddress - Ethereum address of the device owner
 * @param {string} event.firmwareHash - keccak256 hash of device firmware
 * @param {string} event.metadataUri - IPFS/S3 URI for device metadata
 * @returns {Object} { deviceId, transactionHash, thingName }
 */
exports.handler = async (event) => {
  console.log("RegisterDevice event:", JSON.stringify(event));

  const { thingName, ownerAddress, firmwareHash, metadataUri } = event;

  // Validate inputs
  if (!thingName || !ownerAddress || !firmwareHash || !metadataUri) {
    throw new Error("Missing required fields: thingName, ownerAddress, firmwareHash, metadataUri");
  }

  if (!ethers.isAddress(ownerAddress)) {
    throw new Error(`Invalid Ethereum address: ${ownerAddress}`);
  }

  const { signer } = await getSignerAndProvider();
  const registry = new ethers.Contract(
    process.env.CONTRACT_ADDRESS,
    REGISTRY_ABI,
    signer
  );

  // Send on-chain transaction
  const tx = await registry.registerDevice(ownerAddress, firmwareHash, metadataUri);
  const receipt = await tx.wait();

  // Extract deviceId from event logs
  const event_ = receipt.logs
    .map((log) => {
      try {
        return registry.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((e) => e && e.name === "DeviceRegistered");

  const deviceId = event_ ? Number(event_.args.deviceId) : null;

  // Store mapping in DynamoDB: AWS IoT Thing ↔ On-chain Device ID
  await dynamodb.send(
    new PutItemCommand({
      TableName: process.env.DYNAMODB_TABLE,
      Item: {
        thingName: { S: thingName },
        deviceId: { N: String(deviceId) },
        ownerAddress: { S: ownerAddress },
        firmwareHash: { S: firmwareHash },
        metadataUri: { S: metadataUri },
        transactionHash: { S: receipt.hash },
        registeredAt: { S: new Date().toISOString() },
        status: { S: "ACTIVE" },
      },
    })
  );

  console.log(`Device registered: thingName=${thingName}, deviceId=${deviceId}, tx=${receipt.hash}`);

  return {
    statusCode: 200,
    body: {
      deviceId,
      transactionHash: receipt.hash,
      thingName,
      blockNumber: receipt.blockNumber,
    },
  };
};
