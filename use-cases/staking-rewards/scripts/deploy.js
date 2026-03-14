/**
 * Deploy: Data Validator Staking
 *
 * Deploys a simple ERC-20 token (for testing) and the staking contract.
 *
 * Usage:
 *   npx hardhat run staking-rewards/scripts/deploy.js --network localhost
 *   npx hardhat run staking-rewards/scripts/deploy.js --network sepolia
 */
const { ethers } = require("hardhat");

async function main() {
  const [deployer, validator1] = await ethers.getSigners();

  console.log("=== Data Validator Staking ===");
  console.log("Deployer:", deployer.address);

  // Deploy a governance token first (for staking)
  const token = await (await ethers.getContractFactory("NGEGovernanceToken")).deploy(
    ethers.parseEther("100000000"),   // 100M cap
    ethers.parseEther("1000000")      // 1M pre-mint
  );
  await token.waitForDeployment();
  console.log("\n  Stake Token:", await token.getAddress());

  // Deploy staking contract
  const staking = await (await ethers.getContractFactory("DataValidatorStaking")).deploy(
    await token.getAddress(),
    ethers.parseEther("1000"),     // minStake: 1000 NGE
    7 * 24 * 60 * 60,             // unstakeCooldown: 7 days
    ethers.parseEther("10"),       // rewardPerValidation: 10 NGE
    ethers.parseEther("50")        // slashAmount: 50 NGE
  );
  await staking.waitForDeployment();
  const address = await staking.getAddress();

  console.log("  DataValidatorStaking:", address);
  console.log("  Min stake: 1,000 NGE");
  console.log("  Reward per validation: 10 NGE");
  console.log("  Slash amount: 50 NGE");
  console.log("  Unstake cooldown: 7 days");

  // Fund reward pool
  await (await token.approve(address, ethers.parseEther("100000"))).wait();
  await (await staking.fundRewards(ethers.parseEther("100000"))).wait();
  console.log("  Reward pool funded: 100,000 NGE");

  // Demo: Stake as validator
  if (validator1) {
    const stakeAmount = ethers.parseEther("5000");
    await (await token.transfer(validator1.address, stakeAmount)).wait();
    await (await token.connect(validator1).approve(address, stakeAmount)).wait();
    await (await staking.connect(validator1).stake(stakeAmount)).wait();
    console.log("  Validator1 staked:", ethers.formatEther(stakeAmount), "NGE");
  }

  console.log("\n  Staking flow:");
  console.log("    1. Approve tokens:   token.approve(stakingAddress, amount)");
  console.log("    2. Stake:            staking.stake(amount)");
  console.log("    3. Admin creates task: createTask(deviceId, dataHash)");
  console.log("    4. Validate:         submitValidation(taskId, flagAnomaly)");
  console.log("    5. Admin resolves:   resolveTask(taskId, wasAnomaly)");
  console.log("    6. Distribute:       distributeReward(taskId, validator)");
  console.log("    7. Check confidence: deviceConfidenceScore(deviceId) → 0-100");
}

main().catch((error) => { console.error(error); process.exit(1); });
