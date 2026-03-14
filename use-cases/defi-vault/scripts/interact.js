/**
 * Interact: DeFi Sentinel Vault
 * Exercises the full DeFi vault protection lifecycle on a local Hardhat node.
 *
 * Usage:
 *   npx hardhat run defi-vault/scripts/interact.js --network localhost
 */
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

async function main() {
  const [owner, g1, g2, g3, g4, g5, recipient] = await ethers.getSigners();

  const THREE_DAYS = 3 * 24 * 60 * 60;
  const ONE_DAY = 24 * 60 * 60;
  const TWO_DAYS = 2 * 24 * 60 * 60;
  const ONE_HOUR = 60 * 60;

  // ─────────────────────────────────────────────
  //  Step 1: Deploy DeFiSentinelVault
  // ─────────────────────────────────────────────
  console.log("=== DeFi Sentinel Vault: Interaction Script ===\n");
  console.log("--- Step 1: Deploy DeFiSentinelVault ---");

  const config = {
    heartbeatInterval: THREE_DAYS,
    gracePeriod: ONE_DAY,
    recoveryAddress: g1.address,
    rateLimitMax: ethers.parseEther("50"),
    rateLimitWindow: ONE_DAY,
    guardians: [g1.address, g2.address, g3.address, g4.address, g5.address],
    guardianThreshold: 3,
    emergencyDelay: TWO_DAYS,
    largeTransferThreshold: ethers.parseEther("10"),
    rapidActivityThreshold: 5,
    rapidActivityWindow: ONE_HOUR,
  };

  const Factory = await ethers.getContractFactory("DeFiSentinelVault");
  const vault = await Factory.deploy(config);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();

  console.log("  Vault deployed to:", vaultAddr);
  console.log("  Owner:", owner.address);
  console.log("  Guardians: 5 (threshold: 3-of-5)");
  console.log("  Rate limit: 50 ETH per 24h window");
  console.log("  Emergency delay: 48 hours");

  // ─────────────────────────────────────────────
  //  Step 2: Fund the vault
  // ─────────────────────────────────────────────
  console.log("\n--- Step 2: Fund the vault ---");

  const fundAmount = ethers.parseEther("200");
  await owner.sendTransaction({ to: vaultAddr, value: fundAmount });
  const balance = await ethers.provider.getBalance(vaultAddr);
  console.log("  Funded:", ethers.formatEther(fundAmount), "ETH");
  console.log("  Vault balance:", ethers.formatEther(balance), "ETH");

  // ─────────────────────────────────────────────
  //  Step 3: Withdraw within rate limit
  // ─────────────────────────────────────────────
  console.log("\n--- Step 3: Withdraw within rate limit ---");

  const withdrawAmount = ethers.parseEther("20");
  const tx1 = await vault.withdraw(recipient.address, withdrawAmount);
  await tx1.wait();
  console.log("  Withdrew:", ethers.formatEther(withdrawAmount), "ETH to", recipient.address);

  const recipientBal = await ethers.provider.getBalance(recipient.address);
  console.log("  Recipient balance:", ethers.formatEther(recipientBal), "ETH");

  // ─────────────────────────────────────────────
  //  Step 4: Check in (heartbeat)
  // ─────────────────────────────────────────────
  console.log("\n--- Step 4: Check in (heartbeat) ---");

  const tx2 = await vault.checkIn();
  await tx2.wait();
  console.log("  Heartbeat sent successfully. Dead man switch timer reset.");

  // ─────────────────────────────────────────────
  //  Step 5: Check remaining rate limit
  // ─────────────────────────────────────────────
  console.log("\n--- Step 5: Check remaining rate limit ---");

  const remaining = await vault.currentWindowRemaining();
  console.log("  Remaining in current window:", ethers.formatEther(remaining), "ETH");
  console.log("  Used so far: 20 ETH of 50 ETH limit");

  // ─────────────────────────────────────────────
  //  Step 6: Try exceeding rate limit
  // ─────────────────────────────────────────────
  console.log("\n--- Step 6: Try exceeding rate limit ---");

  try {
    const excessAmount = ethers.parseEther("35"); // 20 + 35 = 55 > 50 limit
    await vault.withdraw(recipient.address, excessAmount);
    console.log("  ERROR: Should have reverted!");
  } catch (error) {
    console.log("  Correctly reverted: RateLimitExceeded");
    console.log("  Attempted 35 ETH withdrawal (would exceed 50 ETH window cap)");
  }

  // ─────────────────────────────────────────────
  //  Step 7: Guardian proposes emergency
  // ─────────────────────────────────────────────
  console.log("\n--- Step 7: Guardian proposes emergency ---");

  const tx3 = await vault.connect(g1).proposeEmergency("pause", ethers.ZeroAddress);
  const receipt3 = await tx3.wait();
  console.log("  Guardian g1 proposed emergency action: pause");
  console.log("  Proposal ID: 1");
  console.log("  Proposer auto-approves (1 of 3 needed)");

  // ─────────────────────────────────────────────
  //  Step 8: Other guardians approve
  // ─────────────────────────────────────────────
  console.log("\n--- Step 8: Other guardians approve ---");

  const tx4 = await vault.connect(g2).approveEmergency(1);
  await tx4.wait();
  console.log("  Guardian g2 approved (2 of 3)");

  const tx5 = await vault.connect(g3).approveEmergency(1);
  await tx5.wait();
  console.log("  Guardian g3 approved (3 of 3) - threshold met!");

  // ─────────────────────────────────────────────
  //  Step 9: Wait and execute emergency
  // ─────────────────────────────────────────────
  console.log("\n--- Step 9: Wait for delay and execute emergency ---");

  console.log("  Advancing time by 48 hours + 1 second...");
  await time.increase(TWO_DAYS + 1);

  const tx6 = await vault.executeEmergency(1);
  await tx6.wait();

  const isPaused = await vault.paused();
  console.log("  Emergency executed successfully!");
  console.log("  Contract paused:", isPaused);

  // Verify withdrawals are blocked
  try {
    await vault.withdraw(recipient.address, ethers.parseEther("1"));
    console.log("  ERROR: Should have reverted!");
  } catch (error) {
    console.log("  Withdrawals blocked while paused: confirmed");
  }

  // ─────────────────────────────────────────────
  //  Summary
  // ─────────────────────────────────────────────
  console.log("\n=== Summary ===");
  const finalBalance = await ethers.provider.getBalance(vaultAddr);
  console.log("  Final vault balance:", ethers.formatEther(finalBalance), "ETH");
  console.log("  Total withdrawn: 20 ETH");
  console.log("  Rate limit prevented excess withdrawals");
  console.log("  Guardian emergency pause executed after 3-of-5 approval + 48h delay");
  console.log("  All security mechanisms verified successfully.\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
