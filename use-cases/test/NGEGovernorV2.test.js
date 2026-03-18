/**
 * @file NGEGovernorV2.test.js
 * @description Tests for NGEGovernorV2 — enhanced governor with GovernorPreventLateQuorum.
 *
 * Covers: deployment configuration, proposal lifecycle, late quorum prevention,
 * access control, and quorum thresholds.
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, mine } = require("@nomicfoundation/hardhat-network-helpers");

describe("NGEGovernorV2", function () {
  let token, governor, timelock;
  let deployer, voter1, voter2, voter3, recipient;

  const CAP = ethers.parseEther("100000000");       // 100M
  const INITIAL = ethers.parseEther("10000000");     // 10M

  const VOTING_DELAY = 7200n;
  const VOTING_PERIOD = 50400n;
  const LATE_QUORUM_EXTENSION = 14400n;
  const QUORUM_FRACTION = 4n; // 4%

  // Governor proposal states (from OpenZeppelin Governor.sol)
  const ProposalState = {
    Pending: 0,
    Active: 1,
    Canceled: 2,
    Defeated: 3,
    Succeeded: 4,
    Queued: 5,
    Executed: 7,
  };

  // Vote types from GovernorCountingSimple
  const VoteType = {
    Against: 0,
    For: 1,
    Abstain: 2,
  };

  /**
   * Helper: create a simple mint-proposal and return the proposal details.
   */
  function buildMintProposal(tokenContract, to, amount, description) {
    const targets = [tokenContract.target];
    const values = [0];
    const calldatas = [
      tokenContract.interface.encodeFunctionData("mint", [to, amount]),
    ];
    const descHash = ethers.keccak256(ethers.toUtf8Bytes(description));
    return { targets, values, calldatas, description, descHash };
  }

  /**
   * Helper: propose, advance past voting delay, and return proposalId.
   */
  async function proposeAndActivate(gov, proposal) {
    const tx = await gov.propose(
      proposal.targets,
      proposal.values,
      proposal.calldatas,
      proposal.description
    );
    const receipt = await tx.wait();
    const log = receipt.logs.find(
      (l) => l.fragment && l.fragment.name === "ProposalCreated"
    );
    const proposalId = log.args.proposalId;

    // Advance past voting delay so proposal becomes Active
    await mine(Number(VOTING_DELAY) + 1);
    return proposalId;
  }

  beforeEach(async function () {
    [deployer, voter1, voter2, voter3, recipient] = await ethers.getSigners();

    // 1. Deploy token
    const TokenFactory = await ethers.getContractFactory("NGEGovernanceToken");
    token = await TokenFactory.deploy(CAP, INITIAL);
    await token.waitForDeployment();

    // 2. Deploy timelock (1-second delay for testing)
    const TimelockFactory = await ethers.getContractFactory("TimelockController");
    timelock = await TimelockFactory.deploy(
      1,                    // minDelay
      [],                   // proposers (added below)
      [ethers.ZeroAddress], // anyone can execute
      deployer.address      // admin
    );
    await timelock.waitForDeployment();

    // 3. Deploy NGEGovernorV2
    const GovFactory = await ethers.getContractFactory("NGEGovernorV2");
    governor = await GovFactory.deploy(
      await token.getAddress(),
      await timelock.getAddress()
    );
    await governor.waitForDeployment();

    // 4. Grant governor roles on timelock
    const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
    const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();
    const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
    await timelock.grantRole(PROPOSER_ROLE, await governor.getAddress());
    await timelock.grantRole(CANCELLER_ROLE, await governor.getAddress());
    await timelock.grantRole(EXECUTOR_ROLE, await governor.getAddress());

    // 5. Delegate deployer's votes to self
    await token.delegate(deployer.address);

    // Mine a block so delegation checkpoint is recorded
    await mine(1);
  });

  // ─────────────────────────────────────────────
  //  1. Deployment
  // ─────────────────────────────────────────────
  describe("Deployment", function () {
    it("sets governor name to 'NGE Governor'", async function () {
      expect(await governor.name()).to.equal("NGE Governor");
    });

    it("sets votingDelay to 7200 blocks", async function () {
      expect(await governor.votingDelay()).to.equal(VOTING_DELAY);
    });

    it("sets votingPeriod to 50400 blocks", async function () {
      expect(await governor.votingPeriod()).to.equal(VOTING_PERIOD);
    });

    it("sets proposalThreshold to 0", async function () {
      expect(await governor.proposalThreshold()).to.equal(0);
    });

    it("sets quorum to 4% of total supply", async function () {
      // quorum() requires a block number; use the latest block
      const blockNum = await ethers.provider.getBlockNumber();
      const quorum = await governor.quorum(blockNum - 1);
      const expectedQuorum = (INITIAL * QUORUM_FRACTION) / 100n;
      expect(quorum).to.equal(expectedQuorum);
    });

    it("reports lateQuorumVoteExtension as 14400 blocks", async function () {
      expect(await governor.lateQuorumVoteExtension()).to.equal(
        LATE_QUORUM_EXTENSION
      );
    });

    it("has the correct token reference", async function () {
      expect(await governor.token()).to.equal(await token.getAddress());
    });

    it("uses the timelock as executor", async function () {
      expect(await governor.timelock()).to.equal(await timelock.getAddress());
    });
  });

  // ─────────────────────────────────────────────
  //  2. Proposal Lifecycle
  // ─────────────────────────────────────────────
  describe("Proposal Lifecycle", function () {
    let proposal;
    const mintAmount = ethers.parseEther("1000");

    beforeEach(async function () {
      proposal = buildMintProposal(
        token,
        recipient.address,
        mintAmount,
        "Mint 1000 NGE to recipient"
      );
    });

    it("creates a proposal", async function () {
      const tx = await governor.propose(
        proposal.targets,
        proposal.values,
        proposal.calldatas,
        proposal.description
      );
      const receipt = await tx.wait();
      const log = receipt.logs.find(
        (l) => l.fragment && l.fragment.name === "ProposalCreated"
      );
      expect(log).to.not.be.undefined;
      expect(log.args.proposalId).to.be.gt(0);
    });

    it("proposal starts in Pending state", async function () {
      const tx = await governor.propose(
        proposal.targets,
        proposal.values,
        proposal.calldatas,
        proposal.description
      );
      const receipt = await tx.wait();
      const proposalId = receipt.logs.find(
        (l) => l.fragment && l.fragment.name === "ProposalCreated"
      ).args.proposalId;

      expect(await governor.state(proposalId)).to.equal(ProposalState.Pending);
    });

    it("proposal becomes Active after voting delay", async function () {
      const proposalId = await proposeAndActivate(governor, proposal);
      expect(await governor.state(proposalId)).to.equal(ProposalState.Active);
    });

    it("allows casting a For vote", async function () {
      const proposalId = await proposeAndActivate(governor, proposal);
      await expect(governor.castVote(proposalId, VoteType.For))
        .to.emit(governor, "VoteCast")
        .withArgs(deployer.address, proposalId, VoteType.For, INITIAL, "");
    });

    it("allows casting an Against vote", async function () {
      const proposalId = await proposeAndActivate(governor, proposal);
      await expect(governor.castVote(proposalId, VoteType.Against))
        .to.emit(governor, "VoteCast");
    });

    it("allows casting an Abstain vote", async function () {
      const proposalId = await proposeAndActivate(governor, proposal);
      await expect(governor.castVote(proposalId, VoteType.Abstain))
        .to.emit(governor, "VoteCast");
    });

    it("proposal is Succeeded after enough For votes", async function () {
      const proposalId = await proposeAndActivate(governor, proposal);
      await governor.castVote(proposalId, VoteType.For);
      await mine(Number(VOTING_PERIOD) + 1);

      expect(await governor.state(proposalId)).to.equal(ProposalState.Succeeded);
    });

    it("proposal is Defeated when quorum not met", async function () {
      // Transfer most tokens away so deployer has < 4% of supply
      const keepAmount = ethers.parseEther("100"); // tiny fraction
      await token.transfer(voter1.address, INITIAL - keepAmount);

      // Re-delegate with reduced balance
      await token.delegate(deployer.address);
      await mine(1);

      const proposalId = await proposeAndActivate(governor, proposal);
      await governor.castVote(proposalId, VoteType.For);
      await mine(Number(VOTING_PERIOD) + 1);

      expect(await governor.state(proposalId)).to.equal(ProposalState.Defeated);
    });

    it("queues a succeeded proposal", async function () {
      const proposalId = await proposeAndActivate(governor, proposal);
      await governor.castVote(proposalId, VoteType.For);
      await mine(Number(VOTING_PERIOD) + 1);

      await expect(
        governor.queue(
          proposal.targets,
          proposal.values,
          proposal.calldatas,
          proposal.descHash
        )
      ).to.emit(governor, "ProposalQueued");

      expect(await governor.state(proposalId)).to.equal(ProposalState.Queued);
    });

    it("end-to-end: propose, vote, queue, execute", async function () {
      // Transfer token ownership to timelock so it can call mint
      await token.transferOwnership(await timelock.getAddress());

      const proposalId = await proposeAndActivate(governor, proposal);

      // Vote For
      await governor.castVote(proposalId, VoteType.For);

      // Advance past voting period
      await mine(Number(VOTING_PERIOD) + 1);

      // Queue
      await governor.queue(
        proposal.targets,
        proposal.values,
        proposal.calldatas,
        proposal.descHash
      );

      // Wait for timelock delay
      await time.increase(2);

      // Execute
      await governor.execute(
        proposal.targets,
        proposal.values,
        proposal.calldatas,
        proposal.descHash
      );

      expect(await token.balanceOf(recipient.address)).to.equal(mintAmount);
    });

    it("can cancel a pending proposal", async function () {
      const tx = await governor.propose(
        proposal.targets,
        proposal.values,
        proposal.calldatas,
        proposal.description
      );
      const receipt = await tx.wait();
      const proposalId = receipt.logs.find(
        (l) => l.fragment && l.fragment.name === "ProposalCreated"
      ).args.proposalId;

      await expect(
        governor.cancel(
          proposal.targets,
          proposal.values,
          proposal.calldatas,
          proposal.descHash
        )
      ).to.emit(governor, "ProposalCanceled");

      expect(await governor.state(proposalId)).to.equal(ProposalState.Canceled);
    });
  });

  // ─────────────────────────────────────────────
  //  3. Late Quorum Prevention
  // ─────────────────────────────────────────────
  describe("Late Quorum Prevention", function () {
    let proposal;
    const mintAmount = ethers.parseEther("500");

    beforeEach(async function () {
      proposal = buildMintProposal(
        token,
        recipient.address,
        mintAmount,
        "Late quorum test proposal"
      );

      // Give voter1 enough tokens to reach quorum on their own (5% of supply)
      const voter1Amount = ethers.parseEther("500000"); // 5% of 10M
      await token.transfer(voter1.address, voter1Amount);
      await token.connect(voter1).delegate(voter1.address);
      await mine(1);
    });

    it("does NOT extend deadline when quorum is reached early", async function () {
      const proposalId = await proposeAndActivate(governor, proposal);

      // Record the original deadline
      const originalDeadline = await governor.proposalDeadline(proposalId);

      // Vote immediately (early in voting period) — quorum is reached
      await governor.connect(voter1).castVote(proposalId, VoteType.For);

      // Deadline should NOT be extended
      const deadlineAfterVote = await governor.proposalDeadline(proposalId);
      expect(deadlineAfterVote).to.equal(originalDeadline);
    });

    it("extends deadline when quorum is reached near end of voting period", async function () {
      const proposalId = await proposeAndActivate(governor, proposal);

      // Record the original deadline
      const originalDeadline = await governor.proposalDeadline(proposalId);

      // Advance to near the end of voting period — within the late quorum window
      // The late quorum window is the last 14400 blocks of the voting period.
      // We want to be inside that window but still before the original deadline.
      const blocksToAdvance = Number(VOTING_PERIOD) - 100; // 100 blocks before end
      await mine(blocksToAdvance);

      // Cast a vote that reaches quorum near the deadline
      await governor.connect(voter1).castVote(proposalId, VoteType.For);

      // Deadline should be extended
      const extendedDeadline = await governor.proposalDeadline(proposalId);
      expect(extendedDeadline).to.be.gt(originalDeadline);
    });

    it("extended deadline accounts for the 14400-block extension", async function () {
      const proposalId = await proposeAndActivate(governor, proposal);

      // Advance to 50 blocks before the original deadline
      const blocksToAdvance = Number(VOTING_PERIOD) - 50;
      await mine(blocksToAdvance);

      // Get block number right before voting
      const blockBeforeVote = BigInt(await ethers.provider.getBlockNumber());

      // Cast vote that reaches quorum
      await governor.connect(voter1).castVote(proposalId, VoteType.For);

      // The vote was cast at blockBeforeVote + 1.
      // The new deadline should be at least voteBlock + lateQuorumExtension.
      const voteBlock = blockBeforeVote + 1n;
      const extendedDeadline = await governor.proposalDeadline(proposalId);
      expect(extendedDeadline).to.equal(voteBlock + LATE_QUORUM_EXTENSION);
    });

    it("emits ProposalExtended event on late quorum", async function () {
      const proposalId = await proposeAndActivate(governor, proposal);

      // Advance to near end of voting period
      await mine(Number(VOTING_PERIOD) - 100);

      // Vote that reaches quorum should emit ProposalExtended
      await expect(
        governor.connect(voter1).castVote(proposalId, VoteType.For)
      ).to.emit(governor, "ProposalExtended");
    });

    it("proposal remains Active during the extension period", async function () {
      const proposalId = await proposeAndActivate(governor, proposal);

      // Advance to near end of voting period
      await mine(Number(VOTING_PERIOD) - 50);

      // Cast vote that triggers extension
      await governor.connect(voter1).castVote(proposalId, VoteType.For);

      // Advance past the original deadline but within the extended deadline
      await mine(100);

      // Proposal should still be Active
      expect(await governor.state(proposalId)).to.equal(ProposalState.Active);
    });
  });

  // ─────────────────────────────────────────────
  //  4. Access Control
  // ─────────────────────────────────────────────
  describe("Access Control", function () {
    it("anyone with delegated tokens can propose (threshold = 0)", async function () {
      // Give voter1 a small amount and delegate
      const smallAmount = ethers.parseEther("1");
      await token.transfer(voter1.address, smallAmount);
      await token.connect(voter1).delegate(voter1.address);
      await mine(1);

      const proposal = buildMintProposal(
        token,
        recipient.address,
        ethers.parseEther("100"),
        "Voter1 proposal"
      );

      await expect(
        governor
          .connect(voter1)
          .propose(
            proposal.targets,
            proposal.values,
            proposal.calldatas,
            proposal.description
          )
      ).to.emit(governor, "ProposalCreated");
    });

    it("accounts without tokens cannot vote (zero weight)", async function () {
      const proposal = buildMintProposal(
        token,
        recipient.address,
        ethers.parseEther("100"),
        "No-token vote test"
      );

      const proposalId = await proposeAndActivate(governor, proposal);

      // voter3 has no tokens and no delegation
      await governor.connect(voter3).castVote(proposalId, VoteType.For);

      // The vote succeeds (no revert), but the weight should be 0
      const { forVotes } = await governor.proposalVotes(proposalId);
      expect(forVotes).to.equal(0);
    });

    it("a voter cannot vote twice on the same proposal", async function () {
      const proposal = buildMintProposal(
        token,
        recipient.address,
        ethers.parseEther("100"),
        "Double vote test"
      );

      const proposalId = await proposeAndActivate(governor, proposal);

      await governor.castVote(proposalId, VoteType.For);

      await expect(
        governor.castVote(proposalId, VoteType.Against)
      ).to.be.revertedWithCustomError(governor, "GovernorAlreadyCastVote");
    });

    it("cannot vote on a Pending proposal (before voting delay)", async function () {
      const proposal = buildMintProposal(
        token,
        recipient.address,
        ethers.parseEther("100"),
        "Early vote test"
      );

      const tx = await governor.propose(
        proposal.targets,
        proposal.values,
        proposal.calldatas,
        proposal.description
      );
      const receipt = await tx.wait();
      const proposalId = receipt.logs.find(
        (l) => l.fragment && l.fragment.name === "ProposalCreated"
      ).args.proposalId;

      // Do NOT advance blocks — proposal is still Pending
      await expect(
        governor.castVote(proposalId, VoteType.For)
      ).to.be.revertedWithCustomError(governor, "GovernorUnexpectedProposalState");
    });
  });

  // ─────────────────────────────────────────────
  //  5. Quorum
  // ─────────────────────────────────────────────
  describe("Quorum", function () {
    it("proposal with For votes below quorum is Defeated", async function () {
      // Give voter2 a tiny amount (well below 4% of supply)
      const tinyAmount = ethers.parseEther("10");
      await token.transfer(voter2.address, tinyAmount);
      await token.connect(voter2).delegate(voter2.address);
      await mine(1);

      const proposal = buildMintProposal(
        token,
        recipient.address,
        ethers.parseEther("100"),
        "Below quorum proposal"
      );

      // Use voter2 (who only has 10 tokens) to propose and vote
      const tx = await governor
        .connect(voter2)
        .propose(
          proposal.targets,
          proposal.values,
          proposal.calldatas,
          proposal.description
        );
      const receipt = await tx.wait();
      const proposalId = receipt.logs.find(
        (l) => l.fragment && l.fragment.name === "ProposalCreated"
      ).args.proposalId;

      await mine(Number(VOTING_DELAY) + 1);

      // Only voter2 votes (10 tokens < 4% of 10M = 400,000)
      await governor.connect(voter2).castVote(proposalId, VoteType.For);

      await mine(Number(VOTING_PERIOD) + 1);

      expect(await governor.state(proposalId)).to.equal(ProposalState.Defeated);
    });

    it("proposal with For votes meeting quorum succeeds", async function () {
      // Deployer has most of the 10M supply — well above 4%
      const proposal = buildMintProposal(
        token,
        recipient.address,
        ethers.parseEther("100"),
        "Above quorum proposal"
      );

      const proposalId = await proposeAndActivate(governor, proposal);
      await governor.castVote(proposalId, VoteType.For);
      await mine(Number(VOTING_PERIOD) + 1);

      expect(await governor.state(proposalId)).to.equal(ProposalState.Succeeded);
    });

    it("Abstain votes count toward quorum but not toward For/Against", async function () {
      // Deployer abstains — this should count toward quorum
      const proposal = buildMintProposal(
        token,
        recipient.address,
        ethers.parseEther("100"),
        "Abstain quorum test"
      );

      const proposalId = await proposeAndActivate(governor, proposal);
      await governor.castVote(proposalId, VoteType.Abstain);
      await mine(Number(VOTING_PERIOD) + 1);

      // Quorum is met (deployer has majority of supply),
      // but no For votes > Against votes, so it is Defeated
      expect(await governor.state(proposalId)).to.equal(ProposalState.Defeated);
    });
  });
});
