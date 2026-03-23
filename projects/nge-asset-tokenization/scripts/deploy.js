/**
 * @file deploy.js
 * @description Deployment script for the SimpleAssetManager contract.
 *
 * @usage
 *   npx hardhat run scripts/deploy.js --network sepolia
 *   BASE_URI="https://api.example.com/assets/" npx hardhat run scripts/deploy.js --network sepolia
 */
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log(
    "Balance:",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "ETH"
  );

  const baseUri = process.env.BASE_URI || "https://api.nextgen.economy/assets/{id}.json";

  const Factory = await ethers.getContractFactory("SimpleAssetManager");
  const contract = await Factory.deploy(baseUri);
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log("SimpleAssetManager deployed to:", address);
  console.log("Base URI:", baseUri);
  console.log("\nNext steps:");
  console.log(`  npx hardhat verify --network sepolia ${address} "${baseUri}"`);
  console.log(`  node ../../scripts/ssm-store.js --project asset-tokenization --address ${address}`);

  return address;
}

main()
  .then((address) => {
    console.log("\n✓ Deployment complete:", address);
    process.exit(0);
  })
  .catch((error) => {
    console.error("✗ Deployment failed:", error);
    process.exit(1);
  });
