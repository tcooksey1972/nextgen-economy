/**
 * @file deploy.js
 * @description Hardhat deployment script for all NGE Identity Platform contracts.
 *
 * Deploys in order:
 *   1. SimpleDIDRegistry
 *   2. CredentialRegistry
 *   3. SensorDataAnchor
 *   4. SkillsMarketplace (depends on CredentialRegistry)
 *
 * Usage:
 *   npx hardhat run scripts/deploy.js --network baseSepolia
 */
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  // 1. Deploy SimpleDIDRegistry
  console.log("\n1. Deploying SimpleDIDRegistry...");
  const DIDFactory = await ethers.getContractFactory("SimpleDIDRegistry");
  const didRegistry = await DIDFactory.deploy();
  await didRegistry.waitForDeployment();
  const didAddr = await didRegistry.getAddress();
  console.log("   SimpleDIDRegistry deployed to:", didAddr);

  // 2. Deploy CredentialRegistry
  console.log("\n2. Deploying CredentialRegistry...");
  const CredFactory = await ethers.getContractFactory("CredentialRegistry");
  const credRegistry = await CredFactory.deploy();
  await credRegistry.waitForDeployment();
  const credAddr = await credRegistry.getAddress();
  console.log("   CredentialRegistry deployed to:", credAddr);

  // 3. Deploy SensorDataAnchor
  console.log("\n3. Deploying SensorDataAnchor...");
  const SensorFactory = await ethers.getContractFactory("SensorDataAnchor");
  const sensorAnchor = await SensorFactory.deploy();
  await sensorAnchor.waitForDeployment();
  const sensorAddr = await sensorAnchor.getAddress();
  console.log("   SensorDataAnchor deployed to:", sensorAddr);

  // 4. Deploy SkillsMarketplace
  const treasury = deployer.address; // Use deployer as treasury for testnet
  const platformFeeBps = 250; // 2.5%
  console.log("\n4. Deploying SkillsMarketplace...");
  const MarketFactory = await ethers.getContractFactory("SkillsMarketplace");
  const marketplace = await MarketFactory.deploy(credAddr, treasury, platformFeeBps);
  await marketplace.waitForDeployment();
  const marketAddr = await marketplace.getAddress();
  console.log("   SkillsMarketplace deployed to:", marketAddr);

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("  NGE Identity Platform — Deployment Complete");
  console.log("=".repeat(60));
  console.log(`  SimpleDIDRegistry:    ${didAddr}`);
  console.log(`  CredentialRegistry:   ${credAddr}`);
  console.log(`  SensorDataAnchor:     ${sensorAddr}`);
  console.log(`  SkillsMarketplace:    ${marketAddr}`);
  console.log(`  Treasury:             ${treasury}`);
  console.log(`  Platform Fee:         ${platformFeeBps / 100}%`);
  console.log("=".repeat(60));

  // Return addresses for use by other scripts
  return { didAddr, credAddr, sensorAddr, marketAddr };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
