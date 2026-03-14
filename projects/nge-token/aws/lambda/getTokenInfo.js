/**
 * @file getTokenInfo.js
 * @description Lambda handler for querying NGE token metadata and supply info.
 *
 * Free Tier notes:
 *   - Lambda: 128 MB (read-only). Simple on-chain view calls, no DynamoDB.
 *   - This is a low-frequency endpoint — mostly called by dashboards.
 *
 * Endpoint: GET /token-info
 *
 * @see aws/cloudformation/token-api.yaml
 */
const { ethers } = require("ethers");

const TOKEN_ABI = [
  "function name() external view returns (string)",
  "function symbol() external view returns (string)",
  "function decimals() external view returns (uint8)",
  "function totalSupply() external view returns (uint256)",
  "function supplyCap() external view returns (uint256)",
  "function mintableSupply() external view returns (uint256)",
  "function paused() external view returns (bool)",
  "function owner() external view returns (address)",
];

let cachedProvider = null;

function getProvider() {
  if (!cachedProvider) {
    cachedProvider = new ethers.JsonRpcProvider(process.env.ETH_RPC_URL);
  }
  return cachedProvider;
}

exports.handler = async () => {
  const provider = getProvider();
  const token = new ethers.Contract(
    process.env.CONTRACT_ADDRESS,
    TOKEN_ABI,
    provider
  );

  const [name, symbol, decimals, totalSupply, supplyCap, mintableSupply, paused, owner] =
    await Promise.all([
      token.name(),
      token.symbol(),
      token.decimals(),
      token.totalSupply(),
      token.supplyCap(),
      token.mintableSupply(),
      token.paused(),
      token.owner(),
    ]);

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({
      name,
      symbol,
      decimals: Number(decimals),
      totalSupply: totalSupply.toString(),
      totalSupplyFormatted: ethers.formatEther(totalSupply),
      supplyCap: supplyCap.toString(),
      supplyCapFormatted: supplyCap === 0n ? "unlimited" : ethers.formatEther(supplyCap),
      mintableSupply: mintableSupply.toString(),
      mintableSupplyFormatted:
        mintableSupply === ethers.MaxUint256
          ? "unlimited"
          : ethers.formatEther(mintableSupply),
      paused,
      owner,
      contractAddress: process.env.CONTRACT_ADDRESS,
    }),
  };
};
