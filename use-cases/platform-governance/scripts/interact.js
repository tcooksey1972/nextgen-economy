/**
 * Interact: Platform Governance
 * Exercises the full on-chain governance lifecycle on a local Hardhat node.
 *
 * Usage:
 *   npx hardhat run platform-governance/scripts/interact.js --network localhost
 */
const { ethers } = require("hardhat");
const { time, mine } = require("@nomicfoundation/hardhat-network-helpers");

async function main() {
  const [deployer, , , recipient] = await ethers.getSigners();

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║         Platform Governance – Full Lifecycle            ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // ── Step 1: Deploy NGEGovernanceToken ──────────────────────────────────
  console.log("── Step 1: Deploy NGEGovernanceToken ──");
  const supplyCap = ethers.parseEther("100000000");   // 100M cap
  const initialMint = ethers.parseEther("10000000");   // 10M to deployer
  const token = await (await ethers.getContractFactory("NGEGovernanceToken"))
    .deploy(supplyCap, initialMint);
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  console.log("  Token deployed at:", tokenAddr);
  console.log("  Supply cap:", ethers.formatEther(supplyCap), "NGE");
  console.log("  Initial supply:", ethers.formatEther(await token.totalSupply()), "NGE");
  console.log("  Deployer balance:", ethers.formatEther(await token.balanceOf(deployer.address)), "NGE\n");

  // ── Step 2: Deploy TimelockController (1 second delay for testing) ────
  console.log("── Step 2: Deploy TimelockController ──");
  const TimelockFactory = await ethers.getContractFactory("TimelockController");
  const timelock = await TimelockFactory.deploy(
    1,                            // 1 second min delay for testing
    [],                           // proposers (governor added next)
    [ethers.ZeroAddress],         // executors (anyone)
    deployer.address              // admin
  );
  await timelock.waitForDeployment();
  const timelockAddr = await timelock.getAddress();
  console.log("  Timelock deployed at:", timelockAddr);
  console.log("  Min delay: 1 second\n");

  // ── Step 3: Deploy NGEGovernor ────────────────────────────────────────
  console.log("── Step 3: Deploy NGEGovernor ──");
  const governor = await (await ethers.getContractFactory("NGEGovernor"))
    .deploy(tokenAddr, timelockAddr);
  await governor.waitForDeployment();
  const governorAddr = await governor.getAddress();
  console.log("  Governor deployed at:", governorAddr);
  console.log("  Governor name:", await governor.name());
  console.log("  Voting delay:", (await governor.votingDelay()).toString(), "blocks");
  console.log("  Voting period:", (await governor.votingPeriod()).toString(), "blocks\n");

  // ── Step 4: Grant roles on timelock ───────────────────────────────────
  console.log("── Step 4: Grant roles on Timelock ──");
  const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
  const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();
  const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
  await (await timelock.grantRole(PROPOSER_ROLE, governorAddr)).wait();
  await (await timelock.grantRole(CANCELLER_ROLE, governorAddr)).wait();
  await (await timelock.grantRole(EXECUTOR_ROLE, governorAddr)).wait();
  console.log("  Governor granted PROPOSER_ROLE");
  console.log("  Governor granted CANCELLER_ROLE");
  console.log("  Governor granted EXECUTOR_ROLE\n");

  // ── Step 5: Transfer token ownership to timelock ──────────────────────
  console.log("── Step 5: Transfer token ownership to Timelock ──");
  await (await token.transferOwnership(timelockAddr)).wait();
  console.log("  Token owner is now:", await token.owner());
  console.log("  (Only the Timelock can mint tokens via governance)\n");

  // ── Step 6: Delegate votes ────────────────────────────────────────────
  console.log("── Step 6: Delegate votes ──");
  await (await token.delegate(deployer.address)).wait();
  console.log("  Deployer delegated voting power to self");
  const votes = await token.getVotes(deployer.address);
  console.log("  Voting power:", ethers.formatEther(votes), "NGE\n");

  // ── Step 7: Mine a block (record delegation checkpoint) ───────────────
  console.log("── Step 7: Mine a block for delegation checkpoint ──");
  await mine(1);
  console.log("  Mined 1 block to record delegation checkpoint\n");

  // ── Step 8: Create a proposal to mint tokens ──────────────────────────
  console.log("── Step 8: Create proposal to mint 1,000 NGE ──");
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

  console.log("  Proposal ID:", proposalId.toString());
  console.log("  Description:", description);
  console.log("  Mint amount:", ethers.formatEther(mintAmount), "NGE");
  console.log("  Recipient:", recipient.address, "\n");

  // ── Step 9: Advance past voting delay (7201 blocks) ───────────────────
  console.log("── Step 9: Advance past voting delay (mine 7201 blocks) ──");
  await mine(7201);
  const stateAfterDelay = await governor.state(proposalId);
  console.log("  Mined 7201 blocks — voting is now open");
  console.log("  Proposal state:", stateAfterDelay.toString(), "(1 = Active)\n");

  // ── Step 10: Cast vote ────────────────────────────────────────────────
  console.log("── Step 10: Cast vote ──");
  await (await governor.castVote(proposalId, 1)).wait(); // 1 = For
  console.log("  Deployer voted: FOR");
  const { forVotes, againstVotes, abstainVotes } = await governor.proposalVotes(proposalId);
  console.log("  For:", ethers.formatEther(forVotes),
    "| Against:", ethers.formatEther(againstVotes),
    "| Abstain:", ethers.formatEther(abstainVotes), "\n");

  // ── Step 11: Advance past voting period (50401 blocks) ────────────────
  console.log("── Step 11: Advance past voting period (mine 50401 blocks) ──");
  await mine(50401);
  const stateAfterVoting = await governor.state(proposalId);
  console.log("  Mined 50401 blocks — voting period ended");
  console.log("  Proposal state:", stateAfterVoting.toString(), "(4 = Succeeded)\n");

  // ── Step 12: Queue the proposal ───────────────────────────────────────
  console.log("── Step 12: Queue proposal in Timelock ──");
  await (await governor.queue(targets, values, calldatas, descHash)).wait();
  const stateAfterQueue = await governor.state(proposalId);
  console.log("  Proposal queued successfully");
  console.log("  Proposal state:", stateAfterQueue.toString(), "(5 = Queued)\n");

  // ── Step 13: Wait for timelock delay ──────────────────────────────────
  console.log("── Step 13: Wait for timelock delay ──");
  await time.increase(2);
  console.log("  Advanced time by 2 seconds (past 1-second delay)\n");

  // ── Step 14: Execute the proposal ─────────────────────────────────────
  console.log("── Step 14: Execute proposal ──");
  await (await governor.execute(targets, values, calldatas, descHash)).wait();
  console.log("  Proposal executed successfully!\n");

  // ── Step 15: Verify token was minted ──────────────────────────────────
  console.log("── Step 15: Verify results ──");
  const recipientBalance = await token.balanceOf(recipient.address);
  const newTotalSupply = await token.totalSupply();
  console.log("  Recipient balance:", ethers.formatEther(recipientBalance), "NGE");
  console.log("  New total supply:", ethers.formatEther(newTotalSupply), "NGE");

  if (recipientBalance === mintAmount) {
    console.log("  Minting via governance: SUCCESS");
  } else {
    console.error("  Minting via governance: FAILED");
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
