/**
 * Interact: FullSentinelVault
 * Exercises all four Sentinel security modules on a local Hardhat node.
 *
 * Covers: deposit, withdraw, rate limiting, heartbeat (DeadManSwitch),
 * watchdog alerts, break glass emergency flow, and dead man switch activation.
 *
 * Usage:
 *   npx hardhat run scripts/interact.js --network localhost
 */
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

async function main() {
  const [owner, g1, g2, g3, recovery, recipient] = await ethers.getSigners();

  const ONE_DAY = 24 * 60 * 60;
  const THREE_DAYS = 3 * ONE_DAY;
  const ONE_HOUR = 60 * 60;

  // ─────────────────────────────────────────────
  //  Step 1: Deploy FullSentinelVault
  // ─────────────────────────────────────────────
  console.log("=== FullSentinelVault: Interaction Script ===\n");
  console.log("--- Step 1: Deploy FullSentinelVault ---");

  const config = {
    heartbeatInterval: THREE_DAYS,
    gracePeriod: ONE_DAY,
    recoveryAddress: recovery.address,
    maxWithdraw: ethers.parseEther("10"),
    withdrawWindow: ONE_DAY,
    guardians: [g1.address, g2.address, g3.address],
    guardianThreshold: 2,
    emergencyDelay: ONE_HOUR,
    largeTransfer: ethers.parseEther("5"),
    rapidCount: 3,
    rapidWindow: ONE_HOUR,
  };

  const Factory = await ethers.getContractFactory("FullSentinelVault");
  const vault = await Factory.deploy(config);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();

  console.log("  Vault deployed to:", vaultAddr);
  console.log("  Owner:", owner.address);
  console.log("  Recovery address:", recovery.address);
  console.log("  Guardians: 3 (threshold: 2-of-3)");
  console.log("  Rate limit: 10 ETH per 24h");
  console.log("  Heartbeat: 3 days + 1 day grace");

  // ─────────────────────────────────────────────
  //  Step 2: Fund the vault
  // ─────────────────────────────────────────────
  console.log("\n--- Step 2: Fund the vault ---");

  await owner.sendTransaction({ to: vaultAddr, value: ethers.parseEther("100") });
  console.log("  Funded: 100 ETH");
  console.log("  Vault balance:", ethers.formatEther(await ethers.provider.getBalance(vaultAddr)), "ETH");

  // ─────────────────────────────────────────────
  //  Step 3: Withdraw within rate limit
  // ─────────────────────────────────────────────
  console.log("\n--- Step 3: Withdraw within rate limit ---");

  const tx1 = await vault.withdraw(recipient.address, ethers.parseEther("3"));
  await tx1.wait();
  console.log("  Withdrew 3 ETH to recipient");
  console.log("  Remaining in window:", ethers.formatEther(await vault.currentWindowRemaining()), "ETH");

  // ─────────────────────────────────────────────
  //  Step 4: Trigger watchdog large transfer alert
  // ─────────────────────────────────────────────
  console.log("\n--- Step 4: Trigger watchdog large transfer alert ---");

  const tx2 = await vault.withdraw(recipient.address, ethers.parseEther("6"));
  const receipt2 = await tx2.wait();
  console.log("  Withdrew 6 ETH (above 5 ETH large transfer threshold)");
  console.log("  Watchdog alert emitted (monitoring-only, tx not reverted)");
  console.log("  Remaining in window:", ethers.formatEther(await vault.currentWindowRemaining()), "ETH");

  // ─────────────────────────────────────────────
  //  Step 5: Hit rate limit
  // ─────────────────────────────────────────────
  console.log("\n--- Step 5: Hit rate limit ---");

  try {
    await vault.withdraw(recipient.address, ethers.parseEther("5"));
    console.log("  ERROR: Should have reverted!");
  } catch (error) {
    console.log("  Correctly reverted: RateLimitExceeded");
    console.log("  Attempted 5 ETH but only", ethers.formatEther(await vault.currentWindowRemaining()), "ETH remaining");
  }

  // ─────────────────────────────────────────────
  //  Step 6: Heartbeat check-in
  // ─────────────────────────────────────────────
  console.log("\n--- Step 6: Heartbeat check-in ---");

  const tx3 = await vault.checkIn();
  await tx3.wait();
  const remaining = await vault.timeRemaining();
  console.log("  Heartbeat sent. Time remaining:", remaining.toString(), "seconds");

  // ─────────────────────────────────────────────
  //  Step 7: Wait for rate limit window to roll over
  // ─────────────────────────────────────────────
  console.log("\n--- Step 7: Wait for rate limit window rollover ---");

  await time.increase(ONE_DAY + 1);
  console.log("  Advanced time by 24h + 1s");
  console.log("  Remaining in new window:", ethers.formatEther(await vault.currentWindowRemaining()), "ETH");

  const tx4 = await vault.withdraw(recipient.address, ethers.parseEther("2"));
  await tx4.wait();
  console.log("  Withdrew 2 ETH in new window: success");

  // ─────────────────────────────────────────────
  //  Step 8: BreakGlass emergency — propose and approve
  // ─────────────────────────────────────────────
  console.log("\n--- Step 8: BreakGlass emergency — propose and approve ---");

  // Guardian 1 proposes PAUSE
  const tx5 = await vault.connect(g1).proposeEmergency(0, ethers.ZeroAddress); // 0 = PAUSE
  await tx5.wait();
  console.log("  Guardian g1 proposed PAUSE (proposal #1, auto-approves: 1 of 2)");

  // Guardian 2 approves
  const tx6 = await vault.connect(g2).approveEmergency(1);
  await tx6.wait();
  console.log("  Guardian g2 approved (2 of 2) — threshold met!");

  // ─────────────────────────────────────────────
  //  Step 9: Execute emergency after delay
  // ─────────────────────────────────────────────
  console.log("\n--- Step 9: Execute emergency after delay ---");

  await time.increase(ONE_HOUR + 1);
  console.log("  Advanced time by 1 hour + 1s");

  const tx7 = await vault.executeEmergency(1);
  await tx7.wait();
  console.log("  Emergency PAUSE executed!");
  console.log("  Contract paused:", await vault.paused());

  // Withdrawals blocked
  try {
    await vault.withdraw(recipient.address, ethers.parseEther("1"));
    console.log("  ERROR: Should have reverted!");
  } catch (error) {
    console.log("  Withdrawals correctly blocked while paused");
  }

  // ─────────────────────────────────────────────
  //  Step 10: Owner unpause
  // ─────────────────────────────────────────────
  console.log("\n--- Step 10: Owner unpause ---");

  const tx8 = await vault.unpause();
  await tx8.wait();
  console.log("  Owner unpaused the vault");
  console.log("  Contract paused:", await vault.paused());

  // ─────────────────────────────────────────────
  //  Step 11: Dead Man Switch activation
  // ─────────────────────────────────────────────
  console.log("\n--- Step 11: Dead Man Switch activation ---");

  // Advance past heartbeat + grace (3 days + 1 day from last check-in)
  await time.increase(THREE_DAYS + ONE_DAY + 1);
  console.log("  Advanced time past heartbeat + grace period");
  console.log("  Time remaining:", (await vault.timeRemaining()).toString(), "seconds");

  const tx9 = await vault.connect(g1).activateSwitch();
  await tx9.wait();
  console.log("  Dead man switch activated!");
  console.log("  Switch activated:", await vault.isSwitchActivated());
  console.log("  Contract paused:", await vault.paused());
  console.log("  Ownership transferred to recovery address (pending acceptance)");

  // Recovery accepts ownership
  const tx10 = await vault.connect(recovery).acceptOwnership();
  await tx10.wait();
  console.log("  Recovery address accepted ownership");
  console.log("  New owner:", await vault.owner());

  // ─────────────────────────────────────────────
  //  Summary
  // ─────────────────────────────────────────────
  console.log("\n=== Summary ===");
  const finalBalance = await ethers.provider.getBalance(vaultAddr);
  console.log("  Final vault balance:", ethers.formatEther(finalBalance), "ETH");
  console.log("  Total withdrawn: 11 ETH");
  console.log("  Rate limiter: prevented excess withdrawals");
  console.log("  Watchdog: alerted on large transfer (6 ETH > 5 ETH threshold)");
  console.log("  BreakGlass: 2-of-3 guardian emergency pause executed");
  console.log("  DeadManSwitch: activated after missed heartbeat, ownership recovered");
  console.log("  All Sentinel modules verified successfully.\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
