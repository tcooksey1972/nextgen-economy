/**
 * Deploy: Device Certification
 *
 * Usage:
 *   npx hardhat run device-certification/scripts/deploy.js --network localhost
 *   npx hardhat run device-certification/scripts/deploy.js --network sepolia
 */
const { ethers } = require("hardhat");

async function main() {
  const [deployer, voter1, voter2, manufacturer] = await ethers.getSigners();

  console.log("=== Device Certification ===");
  console.log("Admin:", deployer.address);

  const cert = await (await ethers.getContractFactory("DeviceCertification")).deploy(
    100,        // votingPeriodBlocks: ~100 blocks (~20 minutes on testnet)
    5000        // approvalThresholdBps: 50% approval needed
  );
  await cert.waitForDeployment();
  const address = await cert.getAddress();

  console.log("\n  DeviceCertification deployed to:", address);
  console.log("  Voting period: 100 blocks");
  console.log("  Approval threshold: 50%");

  // Grant voter roles
  const VOTER_ROLE = await cert.VOTER_ROLE();
  if (voter1) {
    await (await cert.grantRole(VOTER_ROLE, voter1.address)).wait();
    console.log("  Voter added:", voter1.address);
  }
  if (voter2) {
    await (await cert.grantRole(VOTER_ROLE, voter2.address)).wait();
    console.log("  Voter added:", voter2.address);
  }

  // Demo: Propose a manufacturer
  if (manufacturer && voter1) {
    const tx = await cert.proposeCertification(
      manufacturer.address,
      "Acme Sensors Inc.",
      "ipfs://QmExampleSpecDocument"
    );
    await tx.wait();
    console.log("  Proposal #1 created for Acme Sensors Inc.");

    // Vote
    await (await cert.connect(voter1).vote(1, true)).wait();
    console.log("  Voter1 voted: FOR");
  }

  console.log("\n  Certification flow:");
  console.log("    1. Propose:   proposeCertification(manufacturer, name, specUri)");
  console.log("    2. Vote:      vote(proposalId, true/false)");
  console.log("    3. Finalize:  finalize(proposalId) // after voting period");
  console.log("    4. Check:     isCertified(manufacturer) → true/false");
  console.log("    5. Revoke:    revokeManufacturer(manufacturer, reason)");
}

main().catch((error) => { console.error(error); process.exit(1); });
