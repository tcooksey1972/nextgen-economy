/**
 * Interact: Data Validator Staking
 * Exercises the full staking, validation, reward/slash, and unstake lifecycle
 * on a local Hardhat node.
 *
 * Usage:
 *   npx hardhat run staking-rewards/scripts/interact.js --network localhost
 */
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

async function main() {
  const [admin, validator1, validator2] = await ethers.getSigners();

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║       Data Validator Staking – Full Lifecycle           ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // ── Configuration ─────────────────────────────────────────────────────
  const MIN_STAKE = ethers.parseEther("1000");
  const COOLDOWN = 7 * 24 * 60 * 60;  // 7 days in seconds
  const REWARD = ethers.parseEther("10");
  const SLASH = ethers.parseEther("50");
  const STAKE_AMOUNT = ethers.parseEther("5000");
  const DEVICE_ID = 42;
  const DATA_HASH = ethers.keccak256(ethers.toUtf8Bytes("suspicious-sensor-reading"));

  // ── 1. Deploy NGEGovernanceToken ──────────────────────────────────────
  console.log("── Step 1: Deploy NGEGovernanceToken (staking token) ──");
  const token = await (await ethers.getContractFactory("NGEGovernanceToken"))
    .deploy(ethers.parseEther("100000000"), ethers.parseEther("1000000"));
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  console.log("  Token deployed at:", tokenAddr);
  console.log("  Admin balance:", ethers.formatEther(await token.balanceOf(admin.address)), "NGE\n");

  // ── 2. Deploy DataValidatorStaking ────────────────────────────────────
  console.log("── Step 2: Deploy DataValidatorStaking ──");
  const staking = await (await ethers.getContractFactory("DataValidatorStaking"))
    .deploy(tokenAddr, MIN_STAKE, COOLDOWN, REWARD, SLASH);
  await staking.waitForDeployment();
  const stakingAddr = await staking.getAddress();
  console.log("  Staking contract deployed at:", stakingAddr);
  console.log("  Min stake:", ethers.formatEther(MIN_STAKE), "NGE");
  console.log("  Unstake cooldown:", COOLDOWN / 86400, "days");
  console.log("  Reward per validation:", ethers.formatEther(REWARD), "NGE");
  console.log("  Slash amount:", ethers.formatEther(SLASH), "NGE\n");

  // ── 3. Fund reward pool ───────────────────────────────────────────────
  console.log("── Step 3: Fund reward pool ──");
  const rewardFunding = ethers.parseEther("100000");
  await (await token.approve(stakingAddr, rewardFunding)).wait();
  await (await staking.fundRewards(rewardFunding)).wait();
  console.log("  Funded reward pool with:", ethers.formatEther(rewardFunding), "NGE");
  console.log("  Reward pool balance:", ethers.formatEther(await staking.rewardPool()), "NGE\n");

  // ── 4. Transfer tokens to validators ──────────────────────────────────
  console.log("── Step 4: Transfer tokens to validators ──");
  await (await token.transfer(validator1.address, ethers.parseEther("10000"))).wait();
  console.log("  Validator 1:", validator1.address);
  console.log("    Balance:", ethers.formatEther(await token.balanceOf(validator1.address)), "NGE");
  await (await token.transfer(validator2.address, ethers.parseEther("10000"))).wait();
  console.log("  Validator 2:", validator2.address);
  console.log("    Balance:", ethers.formatEther(await token.balanceOf(validator2.address)), "NGE\n");

  // ── 5. Validators stake ───────────────────────────────────────────────
  console.log("── Step 5: Validators stake tokens ──");
  await (await token.connect(validator1).approve(stakingAddr, STAKE_AMOUNT)).wait();
  await (await staking.connect(validator1).stake(STAKE_AMOUNT)).wait();
  console.log("  Validator 1 staked:", ethers.formatEther(STAKE_AMOUNT), "NGE");

  await (await token.connect(validator2).approve(stakingAddr, STAKE_AMOUNT)).wait();
  await (await staking.connect(validator2).stake(STAKE_AMOUNT)).wait();
  console.log("  Validator 2 staked:", ethers.formatEther(STAKE_AMOUNT), "NGE");

  const activeCount = await staking.activeValidatorCount();
  console.log("  Active validators:", activeCount.toString(), "\n");

  // ── 6. Create validation task ─────────────────────────────────────────
  console.log("── Step 6: Create validation task ──");
  await (await staking.createTask(DEVICE_ID, DATA_HASH)).wait();
  console.log("  Task #1 created");
  console.log("  Device ID:", DEVICE_ID);
  console.log("  Data hash:", DATA_HASH.slice(0, 18) + "...\n");

  // ── 7. Validators submit validations ──────────────────────────────────
  console.log("── Step 7: Validators submit validations ──");
  await (await staking.connect(validator1).submitValidation(1, true)).wait();
  console.log("  Validator 1 flagged ANOMALY (correct answer)");
  await (await staking.connect(validator2).submitValidation(1, false)).wait();
  console.log("  Validator 2 flagged NO ANOMALY (incorrect answer)\n");

  // ── 7b. Try double validation (expected error) ────────────────────────
  console.log("── Step 7b: Attempt double validation (expected error) ──");
  try {
    await staking.connect(validator1).submitValidation(1, true);
    console.log("  ERROR: Double validation was not rejected!");
  } catch (e) {
    console.log("  Correctly rejected: validator cannot validate twice\n");
  }

  // ── 8. Resolve task ───────────────────────────────────────────────────
  console.log("── Step 8: Admin resolves task ──");
  await (await staking.resolveTask(1, true)).wait();  // It WAS an anomaly
  console.log("  Task #1 resolved: anomaly confirmed (wasAnomaly = true)\n");

  // ── 9. Distribute rewards ─────────────────────────────────────────────
  console.log("── Step 9: Distribute rewards and slashing ──");

  // Reward validator 1 (correct)
  const v1BalBefore = await token.balanceOf(validator1.address);
  await (await staking.distributeReward(1, validator1.address)).wait();
  const v1BalAfter = await token.balanceOf(validator1.address);
  console.log("  Validator 1 (correct): rewarded", ethers.formatEther(v1BalAfter - v1BalBefore), "NGE");

  // Slash validator 2 (incorrect)
  const [v2StakeBefore] = await staking.getValidator(validator2.address);
  await (await staking.distributeReward(1, validator2.address)).wait();
  const [v2StakeAfter] = await staking.getValidator(validator2.address);
  console.log("  Validator 2 (incorrect): slashed", ethers.formatEther(v2StakeBefore - v2StakeAfter), "NGE from stake\n");

  // ── 10. Check validator stats ─────────────────────────────────────────
  console.log("── Step 10: Check validator stats ──");
  const [v1Staked, v1Rewards, v1Slashed, v1Validations] = await staking.getValidator(validator1.address);
  console.log("  Validator 1:");
  console.log("    Staked:", ethers.formatEther(v1Staked), "NGE");
  console.log("    Rewards earned:", ethers.formatEther(v1Rewards), "NGE");
  console.log("    Slashed:", ethers.formatEther(v1Slashed), "NGE");
  console.log("    Validations:", v1Validations.toString());

  const [v2Staked, v2Rewards, v2Slashed, v2Validations] = await staking.getValidator(validator2.address);
  console.log("  Validator 2:");
  console.log("    Staked:", ethers.formatEther(v2Staked), "NGE");
  console.log("    Rewards earned:", ethers.formatEther(v2Rewards), "NGE");
  console.log("    Slashed:", ethers.formatEther(v2Slashed), "NGE");
  console.log("    Validations:", v2Validations.toString(), "\n");

  // ── 11. Check device confidence score ─────────────────────────────────
  console.log("── Step 11: Check device confidence score ──");
  const confidence = await staking.deviceConfidenceScore(DEVICE_ID);
  console.log("  Device", DEVICE_ID, "confidence score:", confidence.toString() + "%");
  console.log("  (1 anomaly out of 1 resolved task = 0% confidence)\n");

  // ── 12. Unstake lifecycle ─────────────────────────────────────────────
  console.log("── Step 12: Unstake lifecycle (Validator 1) ──");

  // Request unstake
  await (await staking.connect(validator1).requestUnstake()).wait();
  console.log("  Unstake requested");

  // Try unstake before cooldown (expected error)
  console.log("  Attempt unstake before cooldown (expected error)...");
  try {
    await staking.connect(validator1).unstake();
    console.log("  ERROR: Early unstake was not rejected!");
  } catch (e) {
    console.log("  Correctly rejected: cooldown not elapsed");
  }

  // Wait for cooldown
  console.log("  Advancing time by", COOLDOWN / 86400, "days + 1 second...");
  await time.increase(COOLDOWN + 1);

  // Unstake
  const balBeforeUnstake = await token.balanceOf(validator1.address);
  await (await staking.connect(validator1).unstake()).wait();
  const balAfterUnstake = await token.balanceOf(validator1.address);
  console.log("  Unstaked successfully!");
  console.log("  Tokens returned:", ethers.formatEther(balAfterUnstake - balBeforeUnstake), "NGE");

  const [v1StakedFinal] = await staking.getValidator(validator1.address);
  console.log("  Validator 1 staked balance:", ethers.formatEther(v1StakedFinal), "NGE");
  const activeAfter = await staking.activeValidatorCount();
  console.log("  Active validators:", activeAfter.toString());

  // ── Summary ───────────────────────────────────────────────────────────
  console.log("\n  ✓ Staking lifecycle completed successfully!");
  console.log("  ✓ Validators staked, validated, were rewarded/slashed, and unstaked.");
  console.log("  ✓ Device confidence score tracked correctly.");

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║                    Run Complete                         ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
