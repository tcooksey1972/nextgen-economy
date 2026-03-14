/**
 * Interact: Platform Governance
 * Exercises the full governance lifecycle on a local Hardhat node.
 *
 * Usage:
 *   npx hardhat run platform-governance/scripts/interact.js --network localhost
 */
const { ethers } = require("hardhat");
const { time, mine } = require("@nomicfoundation/hardhat-network-helpers");

async function main() {
  const [deployer, , , recipient] = await ethers.getSigners();

  console.log("========================================");
  console.log("  Platform Governance - Interaction");
  console.log("========================================\n");

  // ── Step 1: Deploy NGEGovernanceToken ──────────────────────────
  console.log("--- Step 1: Deploy NGEGovernanceToken ---");
  const supplyCap = ethers.parseEther("100000000");   // 100M cap
  const initialMint = ethers.parseEther("10000000");   // 10M to deployer
  const token = await (await ethers.getContractFactory("NGEGovernanceToken")).deploy(supplyCap, initialMint);
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  console.log("  Token deployed to:", tokenAddr);
  console.log("  Total supply:", ethers.formatEther(await token.totalSupply()), "NGE");
  console.log("  Supply cap:", ethers.formatEther(supplyCap), "NGE");

  // ── Step 2: Deploy TimelockController (1 second delay) ────────
  console.log("\n--- Step 2: Deploy TimelockController ---");
  const TimelockFactory = await ethers.getContractFactory("TimelockController");
  const timelock = await TimelockFactory.deploy(
    1,                          // 1 second delay for testing
    [],                         // proposers (will add governor)
    [ethers.ZeroAddress],       // executors (anyone)
    deployer.address            // admin
  );
  await timelock.waitForDeployment();
  const timelockAddr = await timelock.getAddress();
  console.log("  TimelockController deployed to:", timelockAddr);
  console.log("  Min delay: 1 second");

  // ── Step 3: Deploy NGEGovernor ────────────────────────────────
  console.log("\n--- Step 3: Deploy NGEGovernor ---");
  const governor = await (await ethers.getContractFactory("NGEGovernor")).deploy(
    tokenAddr,
    timelockAddr
  );
  await governor.waitForDeployment();
  const governorAddr = await governor.getAddress();
  console.log("  NGEGovernor deployed to:", governorAddr);
  console.log("  Voting delay:", (await governor.votingDelay()).toString(), "blocks");
  console.log("  Voting period:", (await governor.votingPeriod()).toString(), "blocks");

  // ── Step 4: Grant roles on timelock ───────────────────────────
  console.log("\n--- Step 4: Grant roles on timelock ---");
  const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
  const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();
  const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
  await (await timelock.grantRole(PROPOSER_ROLE, governorAddr)).wait();
  await (await timelock.grantRole(CANCELLER_ROLE, governorAddr)).wait();
  await (await timelock.grantRole(EXECUTOR_ROLE, governorAddr)).wait();
  console.log("  Governor granted PROPOSER_ROLE");
  console.log("  Governor granted CANCELLER_ROLE");
  console.log("  Governor granted EXECUTOR_ROLE");

  // ── Step 5: Transfer token ownership to timelock ──────────────
  console.log("\n--- Step 5: Transfer token ownership to timelock ---");
  await (await token.transferOwnership(timelockAddr)).wait();
  console.log("  Token ownership transferred to timelock:", timelockAddr);
  console.log("  (Timelock can now execute mint calls via governance)");

  // ── Step 6: Delegate votes ────────────────────────────────────
  console.log("\n--- Step 6: Delegate votes ---");
  await (await token.delegate(deployer.address)).wait();
  const votes = await token.getVotes(deployer.address);
  console.log("  Deployer delegated votes to self");
  console.log("  Voting power:", ethers.formatEther(votes), "NGE");

  // ── Step 7: Mine a block (record delegation checkpoint) ───────
  console.log("\n--- Step 7: Mine a block ---");
  await mine(1);
  console.log("  Mined 1 block to record delegation checkpoint");

  // ── Step 8: Create a proposal to mint tokens ──────────────────
  console.log("\n--- Step 8: Create proposal ---");
  const mintAmount = ethers.parseEther("1000");
  const targets = [tokenAddr];
  const values = [0];
  const calldatas = [token.interface.encodeFunctionData("mint", [recipient.address, mintAmount])];
  const description = "Mint 1000 NGE to recipient";
  const descHash = ethers.keccak256(ethers.toUtf8Bytes(description));

  const proposeTx = await governor.propose(targets, values, calldatas, description);
  const proposeReceipt = await proposeTx.wait();
  const proposalId = proposeReceipt.logs.find(
    (l) => l.fragment && l.fragment.name === "ProposalCreated"
  ).args.proposalId;
  console.log("  Proposal created!");
  console.log("  Proposal ID:", proposalId.toString());
  console.log("  Description:", description);
  console.log("  Mint amount:", ethers.formatEther(mintAmount), "NGE to", recipient.address);

  // ── Step 9: Advance past voting delay (mine 7201 blocks) ─────
  console.log("\n--- Step 9: Advance past voting delay ---");
  await mine(7201);
  console.log("  Mined 7201 blocks (voting delay passed)");
  const stateAfterDelay = await governor.state(proposalId);
  console.log("  Proposal state:", stateAfterDelay.toString(), "(1 = Active)");

  // ── Step 10: Cast vote ────────────────────────────────────────
  console.log("\n--- Step 10: Cast vote ---");
  await (await governor.castVote(proposalId, 1)).wait(); // 1 = For
  console.log("  Deployer voted: FOR");
  const { forVotes, againstVotes, abstainVotes } = await governor.proposalVotes(proposalId);
  console.log("  Votes - For:", ethers.formatEther(forVotes),
    "Against:", ethers.formatEther(againstVotes),
    "Abstain:", ethers.formatEther(abstainVotes));

  // ── Step 11: Advance past voting period (mine 50401 blocks) ───
  console.log("\n--- Step 11: Advance past voting period ---");
  await mine(50401);
  console.log("  Mined 50401 blocks (voting period passed)");
  const stateAfterVoting = await governor.state(proposalId);
  console.log("  Proposal state:", stateAfterVoting.toString(), "(4 = Succeeded)");

  // ── Step 12: Queue ────────────────────────────────────────────
  console.log("\n--- Step 12: Queue proposal ---");
  await (await governor.queue(targets, values, calldatas, descHash)).wait();
  console.log("  Proposal queued in timelock");
  const stateAfterQueue = await governor.state(proposalId);
  console.log("  Proposal state:", stateAfterQueue.toString(), "(5 = Queued)");

  // ── Step 13: Wait for timelock ────────────────────────────────
  console.log("\n--- Step 13: Wait for timelock delay ---");
  await time.increase(2);
  console.log("  Advanced time by 2 seconds (timelock delay passed)");

  // ── Step 14: Execute ──────────────────────────────────────────
  console.log("\n--- Step 14: Execute proposal ---");
  await (await governor.execute(targets, values, calldatas, descHash)).wait();
  console.log("  Proposal executed!");

  // ── Step 15: Verify token was minted ──────────────────────────
  console.log("\n--- Step 15: Verify results ---");
  const recipientBalance = await token.balanceOf(recipient.address);
  const newTotalSupply = await token.totalSupply();
  console.log("  Recipient balance:", ethers.formatEther(recipientBalance), "NGE");
  console.log("  New total supply:", ethers.formatEther(newTotalSupply), "NGE");
  console.log("  Minting via governance:", recipientBalance === mintAmount ? "SUCCESS" : "FAILED");

  console.log("\n========================================");
  console.log("  Governance lifecycle complete!");
  console.log("========================================");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
