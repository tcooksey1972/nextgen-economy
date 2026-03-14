/**
 * Interact: Device Certification
 * Exercises the full device certification voting lifecycle on a local Hardhat node.
 *
 * Usage:
 *   npx hardhat run device-certification/scripts/interact.js --network localhost
 */
const { ethers } = require("hardhat");
const { mine } = require("@nomicfoundation/hardhat-network-helpers");

async function main() {
  const [admin, voter1, voter2, voter3, manufacturer] = await ethers.getSigners();

  console.log("========================================");
  console.log("  Device Certification - Interaction");
  console.log("========================================\n");

  // ── Step 1: Deploy DeviceCertification ────────────────────────
  console.log("--- Step 1: Deploy DeviceCertification ---");
  const cert = await (await ethers.getContractFactory("DeviceCertification")).deploy(
    100,    // votingPeriodBlocks
    5000    // approvalThresholdBps (50%)
  );
  await cert.waitForDeployment();
  const certAddr = await cert.getAddress();
  console.log("  Contract deployed to:", certAddr);
  console.log("  Voting period: 100 blocks");
  console.log("  Approval threshold: 50% (5000 bps)");

  // ── Step 2: Grant VOTER_ROLE to voters ────────────────────────
  console.log("\n--- Step 2: Grant VOTER_ROLE ---");
  const VOTER_ROLE = await cert.VOTER_ROLE();
  await (await cert.grantRole(VOTER_ROLE, voter1.address)).wait();
  await (await cert.grantRole(VOTER_ROLE, voter2.address)).wait();
  await (await cert.grantRole(VOTER_ROLE, voter3.address)).wait();
  console.log("  Voter 1:", voter1.address);
  console.log("  Voter 2:", voter2.address);
  console.log("  Voter 3:", voter3.address);

  // ── Step 3: Propose certification for a manufacturer ──────────
  console.log("\n--- Step 3: Propose certification ---");
  const tx = await cert.connect(voter1).proposeCertification(
    manufacturer.address,
    "Acme Sensors Inc.",
    "ipfs://QmExampleSpecDocument"
  );
  await tx.wait();
  const proposalCount = await cert.proposalCount();
  console.log("  Proposal #" + proposalCount.toString() + " created");
  console.log("  Manufacturer:", manufacturer.address);
  console.log("  Name: Acme Sensors Inc.");
  console.log("  Spec URI: ipfs://QmExampleSpecDocument");

  // ── Step 4: Voters vote ───────────────────────────────────────
  console.log("\n--- Step 4: Cast votes ---");
  await (await cert.connect(voter1).vote(1, true)).wait();
  console.log("  Voter 1 voted: FOR");

  await (await cert.connect(voter2).vote(1, true)).wait();
  console.log("  Voter 2 voted: FOR");

  await (await cert.connect(voter3).vote(1, false)).wait();
  console.log("  Voter 3 voted: AGAINST");

  console.log("  Vote tally: 2 FOR, 1 AGAINST (66.7% approval)");

  // Try double voting (expected to fail)
  try {
    await cert.connect(voter1).vote(1, true);
    console.log("  ERROR: Double vote should have failed!");
  } catch (e) {
    console.log("  Double vote correctly rejected (AlreadyVoted)");
  }

  // ── Step 5: Mine past voting period ───────────────────────────
  console.log("\n--- Step 5: Advance past voting period ---");
  await mine(101);
  console.log("  Mined 101 blocks (voting period ended)");

  // Verify voting after deadline fails
  try {
    await cert.connect(voter1).vote(1, true);
    console.log("  ERROR: Late vote should have failed!");
  } catch (e) {
    console.log("  Late vote correctly rejected (ProposalNotActive)");
  }

  // ── Step 6: Finalize - manufacturer gets certified ────────────
  console.log("\n--- Step 6: Finalize proposal ---");
  await (await cert.finalize(1)).wait();
  console.log("  Proposal #1 finalized");

  // ── Step 7: Check isCertified ─────────────────────────────────
  console.log("\n--- Step 7: Verify certification ---");
  const isCertified = await cert.isCertified(manufacturer.address);
  console.log("  isCertified(" + manufacturer.address + "):", isCertified);
  console.log("  Certification status:", isCertified ? "CERTIFIED" : "NOT CERTIFIED");

  const certifiedCount = await cert.certifiedCount();
  console.log("  Total certified manufacturers:", certifiedCount.toString());

  const CERTIFIED_MANUFACTURER = await cert.CERTIFIED_MANUFACTURER();
  const hasRole = await cert.hasRole(CERTIFIED_MANUFACTURER, manufacturer.address);
  console.log("  Has CERTIFIED_MANUFACTURER role:", hasRole);

  // ── Step 8: Revoke certification ──────────────────────────────
  console.log("\n--- Step 8: Revoke certification ---");
  await (await cert.revokeManufacturer(manufacturer.address, "Quality failure detected")).wait();
  console.log("  Manufacturer revoked. Reason: Quality failure detected");

  // ── Step 9: Verify no longer certified ────────────────────────
  console.log("\n--- Step 9: Verify revocation ---");
  const isStillCertified = await cert.isCertified(manufacturer.address);
  console.log("  isCertified(" + manufacturer.address + "):", isStillCertified);
  console.log("  Certification status:", isStillCertified ? "CERTIFIED" : "REVOKED");

  console.log("\n========================================");
  console.log("  Device certification lifecycle complete!");
  console.log("========================================");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
