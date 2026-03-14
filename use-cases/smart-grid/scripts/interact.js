/**
 * Interact: Energy Meter Registry
 * Exercises the full smart-grid energy metering lifecycle on a local Hardhat node.
 *
 * Usage:
 *   npx hardhat run smart-grid/scripts/interact.js --network localhost
 */
const { ethers } = require("hardhat");

async function main() {
  const [admin, homeowner] = await ethers.getSigners();

  // ── Deploy ────────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════");
  console.log("  Energy Meter Registry — Interaction Script");
  console.log("═══════════════════════════════════════════\n");

  console.log("[Deploy] Deploying EnergyMeterRegistry...");
  const Factory = await ethers.getContractFactory("EnergyMeterRegistry");
  const registry = await Factory.deploy();
  await registry.waitForDeployment();
  const addr = await registry.getAddress();
  console.log("[Deploy] EnergyMeterRegistry deployed to:", addr);
  console.log("[Deploy] Admin (utility):", admin.address);
  console.log("[Deploy] Homeowner:      ", homeowner.address);

  // ── Step 1: Register a meter ──────────────────────────────────────
  console.log("\n── Step 1: Register Meter ──────────────────────────");
  const fwHash = ethers.keccak256(ethers.toUtf8Bytes("smartmeter-fw-2.0"));
  const regTx = await registry.registerMeter(homeowner.address, fwHash);
  await regTx.wait();
  console.log("Meter registered (ID: 0)");
  console.log("  Homeowner:    ", homeowner.address);
  console.log("  Firmware hash:", fwHash);
  console.log("  Token owner:  ", await registry.ownerOf(0));
  console.log("  Status:       ", await registry.meterStatus(0), "(1 = Active)");

  // ── Step 2: Anchor energy reading ─────────────────────────────────
  console.log("\n── Step 2: Anchor Energy Reading ───────────────────");
  const readingRaw = "2024-01-15T12:00:00Z|prod:5200|cons:3100";
  const readingHash = ethers.keccak256(ethers.toUtf8Bytes(readingRaw));
  const prodWh = 5200;
  const consWh = 3100;
  const tx2 = await registry.connect(homeowner).anchorReading(0, prodWh, consWh, readingHash);
  await tx2.wait();
  console.log("Reading anchored:");
  console.log("  Produced:  ", prodWh, "Wh");
  console.log("  Consumed:  ", consWh, "Wh");
  console.log("  Net energy:", prodWh - consWh, "Wh (surplus)");
  console.log("  Data hash: ", readingHash);
  console.log("  Tx hash:   ", tx2.hash);
  console.log("  Reading count:", (await registry.meterReadingCount(0)).toString());

  // ── Step 3: Record settlement period ──────────────────────────────
  console.log("\n── Step 3: Record Settlement Period ────────────────");
  const periodStart = 1705276800; // Jan 15, 2024 00:00 UTC
  const periodEnd   = 1707955200; // Feb 15, 2024 00:00 UTC
  const totalProd = 156000;
  const totalCons = 93000;
  const readingCount = 720;
  const tx3 = await registry.recordSettlement(0, periodStart, periodEnd, totalProd, totalCons, readingCount);
  await tx3.wait();
  console.log("Settlement recorded for meter 0:");
  console.log("  Period:          ", new Date(periodStart * 1000).toISOString(), "to", new Date(periodEnd * 1000).toISOString());
  console.log("  Total produced:  ", totalProd, "Wh");
  console.log("  Total consumed:  ", totalCons, "Wh");
  console.log("  Reading count:   ", readingCount);

  // ── Step 4: Get settlement data ───────────────────────────────────
  console.log("\n── Step 4: Get Settlement Data ─────────────────────");
  const [net, prod, cons] = await registry.getSettlement(0, periodStart);
  console.log("Settlement for meter 0, period starting", periodStart + ":");
  console.log("  Net energy:     ", net.toString(), "Wh");
  console.log("  Total produced: ", prod.toString(), "Wh");
  console.log("  Total consumed: ", cons.toString(), "Wh");
  if (net > 0n) {
    console.log("  Status:          NET PRODUCER (earned credits for surplus)");
  } else if (net < 0n) {
    console.log("  Status:          NET CONSUMER (owes for deficit)");
  } else {
    console.log("  Status:          BALANCED");
  }

  // ── Step 5: Verify reading ────────────────────────────────────────
  console.log("\n── Step 5: Verify Anchored Reading ─────────────────");
  const isAnchored = await registry.isAnchored(readingHash);
  console.log("isAnchored(readingHash):", isAnchored);
  const [meterId, timestamp, rProd, rCons] = await registry.getReading(readingHash);
  console.log("getReading(readingHash):");
  console.log("  Meter ID:  ", meterId.toString());
  console.log("  Timestamp: ", timestamp.toString());
  console.log("  Produced:  ", rProd.toString(), "Wh");
  console.log("  Consumed:  ", rCons.toString(), "Wh");

  const unknownHash = ethers.keccak256(ethers.toUtf8Bytes("not-anchored"));
  console.log("isAnchored(unknownHash):", await registry.isAnchored(unknownHash));

  // ── Step 6: Deactivate meter ──────────────────────────────────────
  console.log("\n── Step 6: Deactivate Meter ────────────────────────");
  const tx6 = await registry.connect(homeowner).deactivateMeter(0);
  await tx6.wait();
  const status = await registry.meterStatus(0);
  console.log("Meter 0 deactivated");
  console.log("  Status:", status.toString(), "(0 = Inactive)");

  // ── Summary ───────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════");
  console.log("  Energy Meter Registry — All steps complete");
  console.log("═══════════════════════════════════════════\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
