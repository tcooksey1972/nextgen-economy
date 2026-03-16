/**
 * Interact: Cold Chain Registry
 * Exercises the full cold-chain compliance lifecycle on a local Hardhat node.
 *
 * Usage:
 *   npx hardhat run cold-chain/scripts/interact.js --network localhost
 */
const { ethers } = require("hardhat");

async function main() {
  const [admin, sensorOwner] = await ethers.getSigners();

  // ── Deploy ────────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════");
  console.log("  Cold Chain Registry — Interaction Script");
  console.log("═══════════════════════════════════════════\n");

  console.log("[Deploy] Deploying ColdChainRegistry...");
  const Factory = await ethers.getContractFactory("ColdChainRegistry");
  const registry = await Factory.deploy();
  await registry.waitForDeployment();
  const addr = await registry.getAddress();
  console.log("[Deploy] ColdChainRegistry deployed to:", addr);
  console.log("[Deploy] Admin:", admin.address);
  console.log("[Deploy] Sensor owner:", sensorOwner.address);

  // ── Step 1: Register a sensor ─────────────────────────────────────
  console.log("\n── Step 1: Register Sensor ──────────────────────────");
  const fwHash = ethers.keccak256(ethers.toUtf8Bytes("firmware-v1.2.3"));
  const metadataUri = "https://api.example.com/sensors/0";
  const regTx = await registry.registerSensor(sensorOwner.address, fwHash, metadataUri);
  const regReceipt = await regTx.wait();
  console.log("Sensor registered (ID: 0)");
  console.log("  Owner:        ", sensorOwner.address);
  console.log("  Firmware hash:", fwHash);
  console.log("  Metadata URI: ", metadataUri);
  console.log("  Token owner:  ", await registry.ownerOf(0));
  console.log("  Status:       ", await registry.sensorStatus(0), "(1 = Active)");

  // ── Step 2: Anchor compliant temperature ──────────────────────────
  console.log("\n── Step 2: Anchor Compliant Temperature (4.50°C) ───");
  const compliantRaw = "2024-01-15T10:00:00Z|4.50C|sensor-0";
  const compliantHash = ethers.keccak256(ethers.toUtf8Bytes(compliantRaw));
  const tx2 = await registry.connect(sensorOwner).anchorTemperature(0, 450, compliantHash);
  const receipt2 = await tx2.wait();
  console.log("Temperature anchored: 4.50°C (within 2.00–8.00°C range)");
  console.log("  Data hash:", compliantHash);
  console.log("  Tx hash:  ", tx2.hash);

  // Check if ComplianceViolation was emitted (it should NOT be)
  const violationEvents2 = receipt2.logs.filter(
    (log) => {
      try { return registry.interface.parseLog(log)?.name === "ComplianceViolation"; }
      catch { return false; }
    }
  );
  console.log("  ComplianceViolation emitted:", violationEvents2.length > 0 ? "YES" : "NO (compliant)");

  // ── Step 3: Anchor non-compliant temperature ──────────────────────
  console.log("\n── Step 3: Anchor Non-Compliant Temperature (9.00°C)");
  const hotRaw = "2024-01-15T11:00:00Z|9.00C|sensor-0";
  const hotHash = ethers.keccak256(ethers.toUtf8Bytes(hotRaw));
  const tx3 = await registry.connect(sensorOwner).anchorTemperature(0, 900, hotHash);
  const receipt3 = await tx3.wait();
  console.log("Temperature anchored: 9.00°C (ABOVE 8.00°C maximum)");
  console.log("  Data hash:", hotHash);

  // Check for ComplianceViolation event
  const violationEvents3 = receipt3.logs.filter(
    (log) => {
      try { return registry.interface.parseLog(log)?.name === "ComplianceViolation"; }
      catch { return false; }
    }
  );
  if (violationEvents3.length > 0) {
    const parsed = registry.interface.parseLog(violationEvents3[0]);
    console.log("  ComplianceViolation emitted: YES");
    console.log("    Sensor ID:", parsed.args[0].toString());
    console.log("    Temp:     ", parsed.args[1].toString(), "(= 9.00°C)");
    console.log("    Reason:   ", parsed.args[2]);
  }

  // ── Step 4: Batch anchor multiple readings ────────────────────────
  console.log("\n── Step 4: Batch Anchor Multiple Readings ──────────");
  const batchHashes = [
    ethers.keccak256(ethers.toUtf8Bytes("batch-reading-1")),
    ethers.keccak256(ethers.toUtf8Bytes("batch-reading-2")),
    ethers.keccak256(ethers.toUtf8Bytes("batch-reading-3")),
  ];
  const tx4 = await registry.connect(sensorOwner).anchorBatch(0, batchHashes);
  await tx4.wait();
  console.log("Batch anchored: 3 readings in a single transaction");
  batchHashes.forEach((h, i) => console.log(`  [${i}] ${h}`));
  const anchorCount = await registry.sensorAnchorCount(0);
  console.log("  Total anchor count for sensor 0:", anchorCount.toString());

  // ── Step 5: Verify an anchored reading ────────────────────────────
  console.log("\n── Step 5: Verify Anchored Reading ─────────────────");
  const isAnchored = await registry.isAnchored(compliantHash);
  console.log("isAnchored(compliantHash):", isAnchored);
  const [sensorId, timestamp, blockNumber, temp] = await registry.getAnchor(compliantHash);
  console.log("getAnchor(compliantHash):");
  console.log("  Sensor ID:   ", sensorId.toString());
  console.log("  Timestamp:   ", timestamp.toString());
  console.log("  Block number:", blockNumber.toString());
  console.log("  Temperature: ", temp.toString(), "(= 4.50°C)");

  const unknownHash = ethers.keccak256(ethers.toUtf8Bytes("never-anchored"));
  console.log("isAnchored(unknownHash):", await registry.isAnchored(unknownHash));

  // ── Step 6: Deactivate sensor ─────────────────────────────────────
  console.log("\n── Step 6: Deactivate Sensor ───────────────────────");
  const tx6 = await registry.connect(sensorOwner).deactivateSensor(0);
  await tx6.wait();
  const status = await registry.sensorStatus(0);
  console.log("Sensor 0 deactivated");
  console.log("  Status:", status.toString(), "(0 = Inactive)");

  // ── Step 7: Try anchoring to inactive sensor ──────────────────────
  console.log("\n── Step 7: Anchor to Inactive Sensor (expect error)");
  try {
    const failHash = ethers.keccak256(ethers.toUtf8Bytes("should-fail"));
    await registry.connect(sensorOwner).anchorTemperature(0, 500, failHash);
    console.log("ERROR: Transaction should have reverted!");
  } catch (error) {
    console.log("Correctly reverted: sensor is not active");
    const reason = error.message.includes("SensorNotActive")
      ? "SensorNotActive"
      : error.message.substring(0, 120);
    console.log("  Error:", reason);
  }

  // ── Summary ───────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════");
  console.log("  Cold Chain Registry — All steps complete");
  console.log("═══════════════════════════════════════════\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
