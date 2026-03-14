/**
 * @file getBalance.js
 * @description Lambda handler for querying NGE token balances.
 *
 * Free Tier notes:
 *   - Lambda: Read-only, 128 MB memory — maximizes free tier GB-seconds.
 *   - API Gateway: HTTP API (not REST) — 1M requests/mo free for 12 months.
 *   - DynamoDB cache avoids unnecessary RPC calls. Falls back to on-chain
 *     only when cache miss or ?onchain=true is specified.
 *
 * Endpoint: GET /balance?address=0x...
 * Optional: ?onchain=true to force on-chain query
 *
 * @see aws/cloudformation/token-api.yaml
 */
const { ethers } = require("ethers");
const { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");

const TOKEN_ABI = [
  "function balanceOf(address account) external view returns (uint256)",
  "function totalSupply() external view returns (uint256)",
  "function name() external view returns (string)",
  "function symbol() external view returns (string)",
  "function decimals() external view returns (uint8)",
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

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const { address, onchain } = params;

  if (!address || !ethers.isAddress(address)) {
    return response(400, { error: "Missing or invalid address parameter" });
  }

  const checksumAddr = ethers.getAddress(address);

  // Fast path: DynamoDB cache
  if (onchain !== "true") {
    try {
      const dbResult = await dynamodb.send(
        new GetItemCommand({
          TableName: process.env.BALANCES_TABLE,
          Key: { address: { S: checksumAddr } },
        })
      );
      if (dbResult.Item) {
        return response(200, {
          address: checksumAddr,
          balance: dbResult.Item.balance.S,
          votingPower: dbResult.Item.votingPower?.S || "0",
          delegate: dbResult.Item.delegate?.S || ethers.ZeroAddress,
          updatedAt: dbResult.Item.updatedAt.S,
          source: "cache",
        });
      }
    } catch {
      // Cache miss — fall through to on-chain
    }
  }

  // On-chain query
  const provider = getProvider();
  const token = new ethers.Contract(
    process.env.CONTRACT_ADDRESS,
    TOKEN_ABI,
    provider
  );

  const [balance, votingPower, delegate] = await Promise.all([
    token.balanceOf(checksumAddr),
    token.getVotes(checksumAddr),
    token.delegates(checksumAddr),
  ]);

  return response(200, {
    address: checksumAddr,
    balance: balance.toString(),
    balanceFormatted: ethers.formatEther(balance),
    votingPower: votingPower.toString(),
    votingPowerFormatted: ethers.formatEther(votingPower),
    delegate,
    source: "onchain",
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
