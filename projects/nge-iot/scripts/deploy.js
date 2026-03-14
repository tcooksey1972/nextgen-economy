/**
 * @file deploy.js
 * @description Hardhat deploy script for NGE IoT — deploys AnchoredDeviceRegistry.
 *
 * AnchoredDeviceRegistry inherits both DeviceRegistry (ERC-721 device identity)
 * and DataAnchor (tamper-proof data anchoring), giving a single contract that
 * handles device registration + sensor data anchoring.
 *
 * Usage:
 *   npx hardhat run scripts/deploy.js --network sepolia
 *
 * Required env vars:
 *   DEPLOYER_PRIVATE_KEY — Private key of the deployer account
 *   ETH_RPC_URL          — Ethereum JSON-RPC endpoint
 *
 * After deployment:
 *   node ../../scripts/ssm-store.js --project iot --address <deployed-address>
 */
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying AnchoredDeviceRegistry with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // Deploy AnchoredDeviceRegistry (combines DeviceRegistry + DataAnchor)
  const Factory = await ethers.getContractFactory("AnchoredDeviceRegistry");
  const registry = await Factory.deploy();
  await registry.waitForDeployment();
  const address = await registry.getAddress();

  console.log("\n  AnchoredDeviceRegistry deployed to:", address);
  console.log("\n  Next steps:");
  console.log(`    1. Verify on Etherscan:  npx hardhat verify --network sepolia ${address}`);
  console.log(`    2. Store in SSM:         node ../../scripts/ssm-store.js --project iot --address ${address}`);
  console.log(`    3. Update IoT bridge:    Deploy aws/cloudformation/iot-blockchain-bridge.yaml\n`);

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
