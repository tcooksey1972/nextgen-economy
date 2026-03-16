/**
 * Interact: Environmental Monitor
 * Exercises the full environmental monitoring & carbon credit lifecycle on a local Hardhat node.
 *
 * Usage:
 *   npx hardhat run environmental/scripts/interact.js --network localhost
 */
const { ethers } = require("hardhat");

async function main() {
  const [admin, operator] = await ethers.getSigners();

  // ── Deploy ────────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════");
  console.log("  Environmental Monitor — Interaction Script");
  console.log("═══════════════════════════════════════════\n");

  console.log("[Deploy] Deploying EnvironmentalMonitor...");
  const Factory = await ethers.getContractFactory("EnvironmentalMonitor");
  const monitor = await Factory.deploy();
  await monitor.waitForDeployment();
  const addr = await monitor.getAddress();
  console.log("[Deploy] EnvironmentalMonitor deployed to:", addr);
  console.log("[Deploy] Admin:   ", admin.address);
  console.log("[Deploy] Operator:", operator.address);

  // ── Step 1: Register sensor with zone ─────────────────────────────
  console.log("\n── Step 1: Register Sensor with Zone ──────────────");
  const zone = "Industrial Zone A";
  const regTx = await monitor.registerSensor(operator.address, zone);
  await regTx.wait();
  console.log("Sensor registered (ID: 0)");
  console.log("  Operator:   ", operator.address);
  console.log("  Zone:       ", await monitor.sensorZone(0));
  console.log("  Token owner:", await monitor.ownerOf(0));

  // ── Step 2: Set baseline for zone ─────────────────────────────────
  console.log("\n── Step 2: Set Baseline for Zone ───────────────────");
  const baselinePm25 = 3500; // 35.00 ug/m3
  const baselineCo2  = 450;  // 450 ppm
  const baselineNox  = 80;   // 80 ppb
  const tx2 = await monitor.setBaseline(zone, baselinePm25, baselineCo2, baselineNox);
  await tx2.wait();
  console.log("Baseline set for '" + zone + "':");
  console.log("  PM2.5:", baselinePm25, "(= 35.00 ug/m3)");
  console.log("  CO2:  ", baselineCo2, "ppm");
  console.log("  NOx:  ", baselineNox, "ppb");

  const baseline = await monitor.baselines(zone);
  console.log("  Verified on-chain — isSet:", baseline.isSet);

  // ── Step 3: Anchor multi-metric reading ───────────────────────────
  console.log("\n── Step 3: Anchor Multi-Metric Reading ────────────");
  const readingRaw = "2024-01-15T12:00:00Z|pm25:2800|co2:380|nox:60";
  const readingHash = ethers.keccak256(ethers.toUtf8Bytes(readingRaw));
  const pm25 = 2800; // 28.00 ug/m3
  const co2  = 380;  // 380 ppm
  const nox  = 60;   // 60 ppb
  const tx3 = await monitor.connect(operator).anchorReading(0, pm25, co2, nox, readingHash);
  await tx3.wait();
  console.log("Reading anchored:");
  console.log("  PM2.5:", pm25, "(= 28.00 ug/m3)  [baseline: 35.00 — improved]");
  console.log("  CO2:  ", co2, "ppm             [baseline: 450  — improved]");
  console.log("  NOx:  ", nox, "ppb              [baseline: 80   — improved]");
  console.log("  Data hash:", readingHash);
  console.log("  Reading count:", (await monitor.sensorReadingCount(0)).toString());

  // ── Step 4: Issue carbon credit (CO2 below baseline) ──────────────
  console.log("\n── Step 4: Issue Carbon Credit ─────────────────────");
  const measuredCo2 = 380;
  const creditAmount = 10;
  const co2Reduction = ((baselineCo2 - measuredCo2) / baselineCo2 * 100).toFixed(1);
  const tx4 = await monitor.issueCarbonCredit(0, measuredCo2, creditAmount);
  await tx4.wait();
  console.log("Carbon credits issued:");
  console.log("  Sensor ID:     0");
  console.log("  Measured CO2: ", measuredCo2, "ppm");
  console.log("  Baseline CO2: ", baselineCo2, "ppm");
  console.log("  Reduction:    ", co2Reduction + "%");
  console.log("  Credits:      ", creditAmount);
  console.log("  Total credits:", (await monitor.totalCreditsIssued()).toString());

  // ── Step 5: Try issuing credit with no reduction (expect error) ───
  console.log("\n── Step 5: Issue Credit with No Reduction (expect error)");
  try {
    await monitor.issueCarbonCredit(0, 450, 5); // CO2 = baseline, no reduction
    console.log("ERROR: Transaction should have reverted!");
  } catch (error) {
    console.log("Correctly reverted: CO2 is not below baseline");
    const reason = error.message.includes("NoReduction")
      ? "NoReduction"
      : error.message.substring(0, 120);
    console.log("  Error:", reason);
  }

  // ── Step 6: Check total credits issued ────────────────────────────
  console.log("\n── Step 6: Check Total Credits Issued ─────────────");
  // Issue a second batch of credits to show accumulation
  await (await monitor.issueCarbonCredit(0, 400, 5)).wait();
  console.log("Second credit issuance: 5 credits (CO2 = 400 ppm)");
  const totalCredits = await monitor.totalCreditsIssued();
  console.log("Total credits issued across all issuances:", totalCredits.toString());

  // ── Step 7: Verify anchored reading ───────────────────────────────
  console.log("\n── Step 7: Verify Anchored Reading ─────────────────");
  const isAnchored = await monitor.isAnchored(readingHash);
  console.log("isAnchored(readingHash):", isAnchored);
  const [sensorId, timestamp, rPm25, rCo2, rNox] = await monitor.getReading(readingHash);
  console.log("getReading(readingHash):");
  console.log("  Sensor ID: ", sensorId.toString());
  console.log("  Timestamp: ", timestamp.toString());
  console.log("  PM2.5:     ", rPm25.toString());
  console.log("  CO2:       ", rCo2.toString(), "ppm");
  console.log("  NOx:       ", rNox.toString(), "ppb");

  const unknownHash = ethers.keccak256(ethers.toUtf8Bytes("not-anchored"));
  console.log("isAnchored(unknownHash):", await monitor.isAnchored(unknownHash));

  // ── Summary ───────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════");
  console.log("  Environmental Monitor — All steps complete");
  console.log("═══════════════════════════════════════════\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
