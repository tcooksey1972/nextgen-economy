/**
 * Deploy: Environmental Monitor
 *
 * Usage:
 *   npx hardhat run environmental/scripts/deploy.js --network localhost
 *   npx hardhat run environmental/scripts/deploy.js --network sepolia
 */
const { ethers } = require("hardhat");

async function main() {
  const [deployer, sensorOp] = await ethers.getSigners();

  console.log("=== Environmental Monitor ===");
  console.log("Deployer:", deployer.address);

  const monitor = await (await ethers.getContractFactory("EnvironmentalMonitor")).deploy();
  await monitor.waitForDeployment();
  const address = await monitor.getAddress();

  console.log("\n  EnvironmentalMonitor deployed to:", address);

  // Register sensor and set baseline
  const op = sensorOp?.address || deployer.address;
  await (await monitor.registerSensor(op, "Industrial Zone A")).wait();
  console.log("  Sensor 0 registered in 'Industrial Zone A'");

  await (await monitor.setBaseline("Industrial Zone A", 3500, 450, 80)).wait();
  console.log("  Baseline set: PM2.5=35.00, CO2=450ppm, NOx=80ppb");

  // Anchor a reading showing improvement
  if (sensorOp) {
    const dataHash = ethers.keccak256(ethers.toUtf8Bytes("2024-01-15T12:00:00Z|pm25:2800|co2:380|nox:60"));
    await (await monitor.connect(sensorOp).anchorReading(0, 2800, 380, 60, dataHash)).wait();
    console.log("  Reading anchored: PM2.5=28.00, CO2=380ppm, NOx=60ppb");

    // Issue credits for the CO2 reduction
    await (await monitor.issueCarbonCredit(0, 380, 10)).wait();
    console.log("  Carbon credits issued: 10 (CO2 reduced from 450 to 380 = 15.5%)");
  }

  console.log("\n  Workflow:");
  console.log("    1. Register sensor:     registerSensor(operator, zone)");
  console.log("    2. Set zone baseline:   setBaseline(zone, pm25, co2, nox)");
  console.log("    3. Anchor readings:     anchorReading(sensorId, pm25, co2, nox, hash)");
  console.log("    4. Issue credits:       issueCarbonCredit(sensorId, measuredCo2, amount)");
  console.log("    5. Public verification: isAnchored(hash) + getReading(hash)");
}

main().catch((error) => { console.error(error); process.exit(1); });
