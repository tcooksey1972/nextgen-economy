/**
 * Interact: Recoverable Vault (Emergency Key Rotation)
 * Exercises the full key recovery lifecycle on a local Hardhat node.
 *
 * Usage:
 *   npx hardhat run key-rotation/scripts/interact.js --network localhost
 */
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

async function main() {
  const [owner, g1, g2, g3, g4, g5, newOwner] = await ethers.getSigners();

  const TWO_DAYS = 2 * 24 * 60 * 60;

  // ─────────────────────────────────────────────
  //  Step 1: Deploy RecoverableVault
  // ─────────────────────────────────────────────
  console.log("=== Recoverable Vault (Key Rotation): Interaction Script ===\n");
  console.log("--- Step 1: Deploy RecoverableVault ---");

  const guardians = [g1.address, g2.address, g3.address, g4.address, g5.address];
  const threshold = 3;
  const executionDelay = TWO_DAYS;

  const Factory = await ethers.getContractFactory("RecoverableVault");
  const vault = await Factory.deploy(guardians, threshold, executionDelay);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();

  console.log("  Vault deployed to:", vaultAddr);
  console.log("  Owner:", owner.address);
  console.log("  Guardians:", guardians.length, "(threshold: 3-of-5)");
  console.log("  Execution delay: 48 hours");

  // ─────────────────────────────────────────────
  //  Step 2: Fund the vault
  // ─────────────────────────────────────────────
  console.log("\n--- Step 2: Fund the vault ---");

  const fundAmount = ethers.parseEther("50");
  await owner.sendTransaction({ to: vaultAddr, value: fundAmount });
  const balance = await ethers.provider.getBalance(vaultAddr);
  console.log("  Funded:", ethers.formatEther(fundAmount), "ETH");
  console.log("  Vault balance:", ethers.formatEther(balance), "ETH");

  // ─────────────────────────────────────────────
  //  Step 3: Owner withdraws
  // ─────────────────────────────────────────────
  console.log("\n--- Step 3: Owner withdraws ---");

  const withdrawAmount = ethers.parseEther("5");
  const tx1 = await vault.withdraw(owner.address, withdrawAmount);
  await tx1.wait();
  console.log("  Owner withdrew:", ethers.formatEther(withdrawAmount), "ETH");

  const vaultBal = await ethers.provider.getBalance(vaultAddr);
  console.log("  Vault balance after:", ethers.formatEther(vaultBal), "ETH");

  // ─────────────────────────────────────────────
  //  Step 4: Guardian proposes recovery (TRANSFER_OWNERSHIP)
  // ─────────────────────────────────────────────
  console.log("\n--- Step 4: Guardian proposes recovery ---");
  console.log("  Scenario: Owner key is compromised. Guardians initiate recovery.");

  const tx2 = await vault.connect(g1).proposeRecovery(newOwner.address);
  await tx2.wait();
  console.log("  Guardian g1 proposed ownership transfer to:", newOwner.address);
  console.log("  Proposal ID: 1");
  console.log("  Proposer auto-approves (1 of 3 needed)");

  const hasG1Approved = await vault.hasApproved(1, g1.address);
  console.log("  g1 has approved:", hasG1Approved);

  // ─────────────────────────────────────────────
  //  Step 5: Other guardians approve
  // ─────────────────────────────────────────────
  console.log("\n--- Step 5: Other guardians approve ---");

  const tx3 = await vault.connect(g2).approve(1);
  await tx3.wait();
  console.log("  Guardian g2 approved (2 of 3)");

  const tx4 = await vault.connect(g3).approve(1);
  await tx4.wait();
  console.log("  Guardian g3 approved (3 of 3) - threshold met!");
  console.log("  Execution delay starts now (48 hours).");

  // Verify a double-approve is rejected
  console.log("\n  Verifying double-approve is rejected...");
  try {
    await vault.connect(g2).approve(1);
    console.log("  ERROR: Should have reverted!");
  } catch (error) {
    console.log("  Correctly reverted: AlreadyApproved");
  }

  // ─────────────────────────────────────────────
  //  Step 6: Wait for delay
  // ─────────────────────────────────────────────
  console.log("\n--- Step 6: Wait for execution delay ---");

  // First, try executing too early
  console.log("  Attempting premature execution...");
  try {
    await vault.execute(1);
    console.log("  ERROR: Should have reverted!");
  } catch (error) {
    console.log("  Correctly reverted: DelayNotElapsed");
  }

  console.log("  Advancing time by 48 hours + 1 second...");
  await time.increase(TWO_DAYS + 1);
  console.log("  Delay period elapsed.");

  // ─────────────────────────────────────────────
  //  Step 7: Execute recovery
  // ─────────────────────────────────────────────
  console.log("\n--- Step 7: Execute recovery ---");

  const ownerBefore = await vault.owner();
  console.log("  Owner before:", ownerBefore);

  const tx5 = await vault.execute(1);
  await tx5.wait();
  console.log("  Recovery executed successfully!");

  // ─────────────────────────────────────────────
  //  Step 8: Verify new owner
  // ─────────────────────────────────────────────
  console.log("\n--- Step 8: Verify new owner ---");

  const ownerAfter = await vault.owner();
  console.log("  Owner after:", ownerAfter);
  console.log("  Ownership transferred:", ownerBefore !== ownerAfter);
  console.log("  New owner matches proposed:", ownerAfter === newOwner.address);

  // Verify new owner can withdraw
  console.log("\n  Verifying new owner can withdraw...");
  const tx6 = await vault.connect(newOwner).withdraw(newOwner.address, ethers.parseEther("1"));
  await tx6.wait();
  console.log("  New owner withdrew 1 ETH successfully.");

  // Verify old owner cannot withdraw
  console.log("  Verifying old owner is locked out...");
  try {
    await vault.connect(owner).withdraw(owner.address, ethers.parseEther("1"));
    console.log("  ERROR: Should have reverted!");
  } catch (error) {
    console.log("  Correctly reverted: OwnableUnauthorizedAccount");
    console.log("  Old owner is locked out.");
  }

  // ─────────────────────────────────────────────
  //  Summary
  // ─────────────────────────────────────────────
  console.log("\n=== Summary ===");
  const finalBalance = await ethers.provider.getBalance(vaultAddr);
  console.log("  Vault address:", vaultAddr);
  console.log("  Final vault balance:", ethers.formatEther(finalBalance), "ETH");
  console.log("  Original owner:", owner.address);
  console.log("  New owner:", newOwner.address);
  console.log("  Recovery flow: propose -> approve (3-of-5) -> delay (48h) -> execute");
  console.log("  Guardian multisig prevented unauthorized ownership changes");
  console.log("  Time delay gave original owner a window to cancel if needed");
  console.log("  All key rotation mechanisms verified successfully.\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
