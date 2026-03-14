/**
 * Deploy: Platform Governance (Token + Timelock + Governor)
 *
 * Usage:
 *   npx hardhat run platform-governance/scripts/deploy.js --network localhost
 *   npx hardhat run platform-governance/scripts/deploy.js --network sepolia
 */
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("=== Platform Governance ===");
  console.log("Deployer:", deployer.address);

  // 1. Deploy governance token
  const supplyCap = ethers.parseEther("100000000");   // 100M cap
  const initialMint = ethers.parseEther("10000000");   // 10M to deployer
  const token = await (await ethers.getContractFactory("NGEGovernanceToken")).deploy(supplyCap, initialMint);
  await token.waitForDeployment();
  console.log("\n  NGEGovernanceToken:", await token.getAddress());
  console.log("  Supply:", ethers.formatEther(await token.totalSupply()), "NGE");

  // 2. Deploy TimelockController
  const minDelay = 1 * 24 * 60 * 60; // 1 day
  const TimelockFactory = await ethers.getContractFactory("@openzeppelin/contracts/governance/TimelockController.sol:TimelockController");
  const timelock = await TimelockFactory.deploy(
    minDelay,
    [],                          // proposers (will add governor)
    [ethers.ZeroAddress],        // executors (anyone)
    deployer.address             // admin (will renounce)
  );
  await timelock.waitForDeployment();
  console.log("  TimelockController:", await timelock.getAddress());

  // 3. Deploy Governor
  const governor = await (await ethers.getContractFactory("NGEGovernor")).deploy(
    await token.getAddress(),
    await timelock.getAddress()
  );
  await governor.waitForDeployment();
  console.log("  NGEGovernor:", await governor.getAddress());

  // 4. Configure roles: governor as proposer on timelock
  const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
  const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();
  await (await timelock.grantRole(PROPOSER_ROLE, await governor.getAddress())).wait();
  await (await timelock.grantRole(CANCELLER_ROLE, await governor.getAddress())).wait();
  console.log("  Governor granted PROPOSER + CANCELLER roles on Timelock");

  // 5. Delegate voting power to self
  await (await token.delegate(deployer.address)).wait();
  console.log("  Deployer delegated voting power to self");

  console.log("\n  Governance flow:");
  console.log("    1. Delegate tokens:  token.delegate(yourAddress)");
  console.log("    2. Create proposal:  governor.propose(targets, values, calldatas, description)");
  console.log("    3. Vote:             governor.castVote(proposalId, 1) // 0=Against, 1=For, 2=Abstain");
  console.log("    4. Queue:            governor.queue(targets, values, calldatas, descriptionHash)");
  console.log("    5. Wait for timelock (1 day)");
  console.log("    6. Execute:          governor.execute(targets, values, calldatas, descriptionHash)");
}

main().catch((error) => { console.error(error); process.exit(1); });
