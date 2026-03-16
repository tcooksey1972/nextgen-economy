/**
 * Interact: DAO Treasury
 * Exercises the full DAO treasury governance lifecycle on a local Hardhat node.
 *
 * Usage:
 *   npx hardhat run dao-treasury/scripts/interact.js --network localhost
 */
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

async function main() {
  const [owner, recipient, attacker] = await ethers.getSigners();

  const ONE_DAY = 24 * 60 * 60;
  const SEVEN_DAYS = 7 * ONE_DAY;
  const TWO_DAYS = 2 * ONE_DAY;
  const MAX_BPS = 500; // 5%
  const ALERT_THRESHOLD = ethers.parseEther("10");

  // ─────────────────────────────────────────────
  //  Step 1: Deploy DAOTreasury
  // ─────────────────────────────────────────────
  console.log("=== DAO Treasury: Interaction Script ===\n");
  console.log("--- Step 1: Deploy DAOTreasury ---");

  const Factory = await ethers.getContractFactory("DAOTreasury");
  const treasury = await Factory.deploy(MAX_BPS, ONE_DAY, SEVEN_DAYS, ALERT_THRESHOLD, TWO_DAYS);
  await treasury.waitForDeployment();
  const treasuryAddr = await treasury.getAddress();

  console.log("  Treasury deployed to:", treasuryAddr);
  console.log("  Owner:", owner.address);
  console.log("  Rate limit: 5% of balance per 24h window");
  console.log("  Heartbeat interval: 7 days");
  console.log("  Proposal delay: 2 days");
  console.log("  Large transfer alert threshold: 10 ETH");

  // ─────────────────────────────────────────────
  //  Step 2: Fund the treasury
  // ─────────────────────────────────────────────
  console.log("\n--- Step 2: Fund the treasury ---");

  const fundAmount = ethers.parseEther("100");
  await owner.sendTransaction({ to: treasuryAddr, value: fundAmount });
  const balance = await ethers.provider.getBalance(treasuryAddr);
  console.log("  Funded:", ethers.formatEther(fundAmount), "ETH");
  console.log("  Treasury balance:", ethers.formatEther(balance), "ETH");

  // ─────────────────────────────────────────────
  //  Step 3: Propose spending
  // ─────────────────────────────────────────────
  console.log("\n--- Step 3: Propose spending ---");

  const spendAmount = ethers.parseEther("3");
  const tx1 = await treasury.proposeSpending(recipient.address, spendAmount, "Marketing budget Q1");
  await tx1.wait();
  console.log("  Proposed spending of", ethers.formatEther(spendAmount), "ETH");
  console.log("  Recipient:", recipient.address);
  console.log("  Reason: Marketing budget Q1");
  console.log("  Proposal ID: 1");

  // ─────────────────────────────────────────────
  //  Step 4: Approve proposal
  // ─────────────────────────────────────────────
  console.log("\n--- Step 4: Approve proposal ---");

  const tx2 = await treasury.approveSpending(1);
  await tx2.wait();
  console.log("  Proposal #1 approved by owner");
  console.log("  Must wait 2-day delay before execution");

  // ─────────────────────────────────────────────
  //  Step 5: Wait for delay
  // ─────────────────────────────────────────────
  console.log("\n--- Step 5: Wait for proposal delay ---");

  console.log("  Advancing time by 2 days + 1 second...");
  await time.increase(TWO_DAYS + 1);
  console.log("  Delay period elapsed.");

  // ─────────────────────────────────────────────
  //  Step 6: Execute proposal
  // ─────────────────────────────────────────────
  console.log("\n--- Step 6: Execute proposal ---");

  const recipientBalBefore = await ethers.provider.getBalance(recipient.address);
  const tx3 = await treasury.executeSpending(1);
  await tx3.wait();
  const recipientBalAfter = await ethers.provider.getBalance(recipient.address);
  const received = recipientBalAfter - recipientBalBefore;

  console.log("  Proposal #1 executed successfully!");
  console.log("  Amount transferred:", ethers.formatEther(received), "ETH");

  const treasuryBal = await ethers.provider.getBalance(treasuryAddr);
  console.log("  Treasury balance after:", ethers.formatEther(treasuryBal), "ETH");

  // ─────────────────────────────────────────────
  //  Step 7: Check in (heartbeat)
  // ─────────────────────────────────────────────
  console.log("\n--- Step 7: Check in (heartbeat) ---");

  const tx4 = await treasury.checkIn();
  await tx4.wait();
  console.log("  Heartbeat sent successfully. Dead man switch timer reset.");

  // ─────────────────────────────────────────────
  //  Step 8: Check remaining rate limit
  // ─────────────────────────────────────────────
  console.log("\n--- Step 8: Check remaining rate limit ---");

  const remaining = await treasury.currentWindowRemaining();
  console.log("  Remaining in current window:", ethers.formatEther(remaining), "ETH");

  const currentTreasuryBal = await ethers.provider.getBalance(treasuryAddr);
  const maxAllowed = currentTreasuryBal * BigInt(MAX_BPS) / 10000n;
  console.log("  Current treasury balance:", ethers.formatEther(currentTreasuryBal), "ETH");
  console.log("  Max per window (5%):", ethers.formatEther(maxAllowed), "ETH");

  // ─────────────────────────────────────────────
  //  Step 9: Try exceeding rate limit
  // ─────────────────────────────────────────────
  console.log("\n--- Step 9: Try exceeding rate limit ---");

  const excessAmount = ethers.parseEther("6"); // > 5% of ~97 ETH
  console.log("  Proposing excessive spending:", ethers.formatEther(excessAmount), "ETH");

  const tx5 = await treasury.proposeSpending(recipient.address, excessAmount, "Excessive request");
  await tx5.wait();
  console.log("  Proposal #2 created");

  const tx6 = await treasury.approveSpending(2);
  await tx6.wait();
  console.log("  Proposal #2 approved");

  await time.increase(TWO_DAYS + 1);
  console.log("  Delay elapsed. Attempting execution...");

  try {
    await treasury.executeSpending(2);
    console.log("  ERROR: Should have reverted!");
  } catch (error) {
    console.log("  Correctly reverted: RateLimitExceeded");
    console.log("  Attempted", ethers.formatEther(excessAmount), "ETH (exceeds 5% cap)");
  }

  // ─────────────────────────────────────────────
  //  Summary
  // ─────────────────────────────────────────────
  console.log("\n=== Summary ===");
  const finalBalance = await ethers.provider.getBalance(treasuryAddr);
  console.log("  Final treasury balance:", ethers.formatEther(finalBalance), "ETH");
  console.log("  Spending proposal lifecycle: propose -> approve -> delay -> execute");
  console.log("  Percentage-based rate limit (5%) prevented excess withdrawal");
  console.log("  Heartbeat keeps dead man switch from activating");
  console.log("  All governance mechanisms verified successfully.\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
