/**
 * Deploy: Energy Meter Registry
 *
 * Usage:
 *   npx hardhat run smart-grid/scripts/deploy.js --network localhost
 *   npx hardhat run smart-grid/scripts/deploy.js --network sepolia
 */
const { ethers } = require("hardhat");

async function main() {
  const [deployer, homeowner] = await ethers.getSigners();

  console.log("=== Energy Meter Registry ===");
  console.log("Deployer (utility):", deployer.address);

  const registry = await (await ethers.getContractFactory("EnergyMeterRegistry")).deploy();
  await registry.waitForDeployment();
  const address = await registry.getAddress();

  console.log("\n  EnergyMeterRegistry deployed to:", address);

  // Register a demo meter
  const owner = homeowner?.address || deployer.address;
  const fwHash = ethers.keccak256(ethers.toUtf8Bytes("smartmeter-fw-2.0"));
  await (await registry.registerMeter(owner, fwHash)).wait();
  console.log("  Demo meter registered (ID: 0)");
  console.log("  Homeowner:", owner);

  // Anchor a reading
  if (homeowner) {
    const dataHash = ethers.keccak256(ethers.toUtf8Bytes("2024-01-15T12:00:00Z|prod:5200|cons:3100"));
    await (await registry.connect(homeowner).anchorReading(0, 5200, 3100, dataHash)).wait();
    console.log("  Reading anchored: produced 5200 Wh, consumed 3100 Wh (net: +2100 Wh)");

    const anchored = await registry.isAnchored(dataHash);
    console.log("  Verified on-chain:", anchored);
  }

  console.log("\n  Workflow:");
  console.log("    1. Utility registers meter: registerMeter(homeowner, fwHash)");
  console.log("    2. Meter anchors hourly:    anchorReading(meterId, prodWh, consWh, hash)");
  console.log("    3. Either party verifies:   isAnchored(hash) + getReading(hash)");
  console.log("    4. Monthly settlement:      recordSettlement(meterId, start, end, prod, cons, count)");
}

main().catch((error) => { console.error(error); process.exit(1); });
