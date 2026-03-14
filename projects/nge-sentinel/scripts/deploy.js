/**
 * @file deploy.js
 * @description Hardhat deploy script for NGE Sentinel — deploys FullSentinelVault.
 *
 * Usage:
 *   npx hardhat run scripts/deploy.js --network sepolia
 *
 * Required env vars:
 *   DEPLOYER_PRIVATE_KEY — Private key of the deployer account
 *   ETH_RPC_URL          — Ethereum JSON-RPC endpoint
 *
 * After deployment, run the root-level SSM wiring script to store
 * the contract address in AWS SSM Parameter Store:
 *   node ../../scripts/ssm-store.js --project sentinel --address <deployed-address>
 */
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying FullSentinelVault with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // Deploy FullSentinelVault
  const Factory = await ethers.getContractFactory("FullSentinelVault");
  const vault = await Factory.deploy();
  await vault.waitForDeployment();
  const address = await vault.getAddress();

  console.log("\n  FullSentinelVault deployed to:", address);
  console.log("\n  Next steps:");
  console.log(`    1. Verify on Etherscan:  npx hardhat verify --network sepolia ${address}`);
  console.log(`    2. Store in SSM:         node ../../scripts/ssm-store.js --project sentinel --address ${address}`);
  console.log(`    3. Update monitor:       Update CONTRACT_ADDRESS in nge-sentinel-monitor config\n`);

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
