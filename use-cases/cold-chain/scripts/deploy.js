/**
 * Deploy: Cold Chain Registry
 *
 * Usage:
 *   npx hardhat run cold-chain/scripts/deploy.js --network localhost
 *   npx hardhat run cold-chain/scripts/deploy.js --network sepolia
 */
const { ethers } = require("hardhat");

async function main() {
  const [deployer, sensorOwner] = await ethers.getSigners();

  console.log("=== Cold Chain Registry ===");
  console.log("Deployer:", deployer.address);

  const registry = await (await ethers.getContractFactory("ColdChainRegistry")).deploy();
  await registry.waitForDeployment();
  const address = await registry.getAddress();

  console.log("\n  ColdChainRegistry deployed to:", address);
  console.log("  Compliance range: 2.00°C — 8.00°C");

  // Register a demo sensor
  const owner = sensorOwner?.address || deployer.address;
  const fwHash = ethers.keccak256(ethers.toUtf8Bytes("firmware-v1.2.3"));
  const tx = await registry.registerSensor(owner, fwHash, "https://api.example.com/sensors/0");
  const receipt = await tx.wait();
  console.log("  Demo sensor registered (ID: 0)");
  console.log("  Firmware hash:", fwHash);

  // Anchor a compliant reading
  const reading = { sensorId: 0, temp: 450, raw: "2024-01-15T10:00:00Z|4.50C" };
  const dataHash = ethers.keccak256(ethers.toUtf8Bytes(reading.raw));

  if (sensorOwner) {
    const tx2 = await registry.connect(sensorOwner).anchorTemperature(0, reading.temp, dataHash);
    await tx2.wait();
    console.log("  Temperature reading anchored: 4.50°C (compliant)");
    console.log("  Data hash:", dataHash);

    // Verify
    const anchored = await registry.isAnchored(dataHash);
    console.log("  Verified on-chain:", anchored);
  }

  console.log("\n  Workflow:");
  console.log("    1. Register sensor:   registerSensor(owner, fwHash, metadataUri)");
  console.log("    2. Anchor reading:    anchorTemperature(sensorId, tempCelsius*100, dataHash)");
  console.log("    3. Verify on-chain:   isAnchored(dataHash) → true/false (free, no gas)");
  console.log("    4. Get details:       getAnchor(dataHash) → (sensorId, timestamp, block, temp)");
}

main().catch((error) => { console.error(error); process.exit(1); });
