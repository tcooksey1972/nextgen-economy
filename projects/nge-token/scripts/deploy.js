/**
 * @file deploy.js
 * @description Hardhat deploy script for NGE Token — deploys SimpleNGEToken.
 *
 * Deploys with a 100M supply cap and 10M pre-minted to the deployer.
 * For sentinel-secured deployments, use deploy-sentinel.js instead.
 *
 * Usage:
 *   npx hardhat run scripts/deploy.js --network sepolia
 *
 * Optional env vars (override defaults):
 *   SUPPLY_CAP     — Max supply in whole tokens (default: 100000000 = 100M)
 *   INITIAL_MINT   — Pre-mint to deployer in whole tokens (default: 10000000 = 10M)
 *
 * After deployment:
 *   node ../../scripts/ssm-store.js --project token --address <deployed-address>
 */
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying SimpleNGEToken with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // Configuration (override via env vars)
  const capTokens = process.env.SUPPLY_CAP || "100000000";
  const mintTokens = process.env.INITIAL_MINT || "10000000";
  const supplyCap = ethers.parseEther(capTokens);
  const initialMint = ethers.parseEther(mintTokens);

  console.log(`  Supply cap: ${capTokens} NGE`);
  console.log(`  Initial mint: ${mintTokens} NGE`);

  // Deploy SimpleNGEToken
  const Factory = await ethers.getContractFactory("SimpleNGEToken");
  const token = await Factory.deploy(supplyCap, initialMint);
  await token.waitForDeployment();
  const address = await token.getAddress();

  console.log("\n  SimpleNGEToken deployed to:", address);
  console.log(`  Name: ${await token.name()}`);
  console.log(`  Symbol: ${await token.symbol()}`);
  console.log(`  Total supply: ${ethers.formatEther(await token.totalSupply())} NGE`);
  console.log("\n  Next steps:");
  console.log(`    1. Verify on Etherscan:  npx hardhat verify --network sepolia ${address} ${supplyCap} ${initialMint}`);
  console.log(`    2. Store in SSM:         node ../../scripts/ssm-store.js --project token --address ${address}`);
  console.log(`    3. Deploy Token API:     Deploy aws/cloudformation/token-api.yaml\n`);

  return address;
}

main()
  .then((address) => {
    console.log("Deployment complete:", address);
    process.exit(0);
  })
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
