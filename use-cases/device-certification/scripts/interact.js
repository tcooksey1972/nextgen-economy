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

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║        Device Certification – Full Lifecycle            ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // ── Step 1: Deploy DeviceCertification ────────────────────────────────
  console.log("── Step 1: Deploy DeviceCertification ──");
  const VOTING_PERIOD = 100;        // 100 blocks
  const APPROVAL_THRESHOLD = 5000;  // 50% (basis points)
  const cert = await (await ethers.getContractFactory("DeviceCertification"))
    .deploy(VOTING_PERIOD, APPROVAL_THRESHOLD);
  await cert.waitForDeployment();
  const certAddr = await cert.getAddress();
  console.log("  Contract deployed at:", certAddr);
  console.log("  Voting period:", VOTING_PERIOD, "blocks");
  console.log("  Approval threshold:", APPROVAL_THRESHOLD / 100 + "%");
  console.log("  Admin:", admin.address, "\n");

  // ── Step 2: Grant VOTER_ROLE to voters ────────────────────────────────
  console.log("── Step 2: Grant VOTER_ROLE to voters ──");
  const VOTER_ROLE = await cert.VOTER_ROLE();
  await (await cert.grantRole(VOTER_ROLE, voter1.address)).wait();
  console.log("  Voter 1 added:", voter1.address);
  await (await cert.grantRole(VOTER_ROLE, voter2.address)).wait();
  console.log("  Voter 2 added:", voter2.address);
  await (await cert.grantRole(VOTER_ROLE, voter3.address)).wait();
  console.log("  Voter 3 added:", voter3.address, "\n");

  // ── Step 3: Propose certification for a manufacturer ──────────────────
  console.log("── Step 3: Propose certification ──");
  const proposeTx = await cert.connect(voter1).proposeCertification(
    manufacturer.address,
    "Acme Sensors Inc.",
    "ipfs://QmExampleSpecDocument"
  );
  await proposeTx.wait();
  const proposalCount = await cert.proposalCount();
  console.log("  Proposal #" + proposalCount.toString() + " created");
  console.log("  Manufacturer:", manufacturer.address);
  console.log("  Name: Acme Sensors Inc.");
  console.log("  Spec URI: ipfs://QmExampleSpecDocument\n");

  // ── Step 4: Voters vote ───────────────────────────────────────────────
  console.log("── Step 4: Voters cast their votes ──");
  await (await cert.connect(voter1).vote(1, true)).wait();
  console.log("  Voter 1 voted: FOR");
  await (await cert.connect(voter2).vote(1, true)).wait();
  console.log("  Voter 2 voted: FOR");
  await (await cert.connect(voter3).vote(1, false)).wait();
  console.log("  Voter 3 voted: AGAINST");
  console.log("  Vote tally: 2 FOR, 1 AGAINST (66.7% approval)\n");

  // Try double voting (expected to fail)
  console.log("── Step 4b: Attempt double vote (expected error) ──");
  try {
    await cert.connect(voter1).vote(1, true);
    console.log("  ERROR: Double vote should have failed!");
  } catch (e) {
    console.log("  Correctly rejected: voter cannot vote twice (AlreadyVoted)\n");
  }

  // ── Step 5: Mine past voting period ───────────────────────────────────
  console.log("── Step 5: Advance past voting period (mine", VOTING_PERIOD + 1, "blocks) ──");
  await mine(VOTING_PERIOD + 1);
  console.log("  Mined", VOTING_PERIOD + 1, "blocks — voting period ended\n");

  // Verify voting after deadline fails
  console.log("── Step 5b: Attempt vote after deadline (expected error) ──");
  try {
    await cert.connect(voter1).vote(1, true);
    console.log("  ERROR: Late vote should have failed!");
  } catch (e) {
    console.log("  Correctly rejected: voting period has ended (ProposalNotActive)\n");
  }

  // ── Step 6: Finalize — manufacturer gets certified ────────────────────
  console.log("── Step 6: Finalize proposal ──");
  const finalizeTx = await cert.finalize(1);
  const finalizeReceipt = await finalizeTx.wait();
  console.log("  Proposal #1 finalized (tx:", finalizeReceipt.hash.slice(0, 18) + "...)");

  const CERTIFIED_MANUFACTURER = await cert.CERTIFIED_MANUFACTURER();
  const hasCertRole = await cert.hasRole(CERTIFIED_MANUFACTURER, manufacturer.address);
  console.log("  Manufacturer has CERTIFIED_MANUFACTURER role:", hasCertRole);
  const certCount = await cert.certifiedCount();
  console.log("  Total certified manufacturers:", certCount.toString(), "\n");

  // ── Step 7: Check isCertified ─────────────────────────────────────────
  console.log("── Step 7: Check certification status ──");
  const isCertified = await cert.isCertified(manufacturer.address);
  console.log("  isCertified(manufacturer):", isCertified);

  if (isCertified) {
    console.log("  Manufacturer is CERTIFIED\n");
  } else {
    console.error("  ERROR: Manufacturer should be certified!");
    process.exit(1);
  }

  // ── Step 8: Revoke certification ──────────────────────────────────────
  console.log("── Step 8: Revoke certification ──");
  await (await cert.revokeManufacturer(manufacturer.address, "Quality control failure")).wait();
  console.log("  Revoked with reason: Quality control failure\n");

  // ── Step 9: Verify no longer certified ────────────────────────────────
  console.log("── Step 9: Verify revocation ──");
  const isCertifiedAfter = await cert.isCertified(manufacturer.address);
  console.log("  isCertified(manufacturer):", isCertifiedAfter);
  const hasCertRoleAfter = await cert.hasRole(CERTIFIED_MANUFACTURER, manufacturer.address);
  console.log("  Has CERTIFIED_MANUFACTURER role:", hasCertRoleAfter);
  console.log("  Certification status:", isCertifiedAfter ? "CERTIFIED" : "REVOKED");

  if (!isCertifiedAfter) {
    console.log("  Revocation verified successfully");
  } else {
    console.error("  ERROR: Revocation verification failed!");
    process.exit(1);
  }

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║                    Run Complete                         ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
