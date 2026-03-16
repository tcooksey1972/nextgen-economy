/**
 * @file NGEGovernance.test.js
 * @description Tests for the Platform Governance use case.
 *
 * Covers: token deployment, supply cap, minting, pausing, delegation,
 * governor proposal creation, voting, queuing, and execution.
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, mine } = require("@nomicfoundation/hardhat-network-helpers");

describe("Platform Governance", function () {
  let token, governor, timelock;
  let deployer, voter1, voter2, recipient;

  // ─────────────────────────────────────────────
  //  NGEGovernanceToken
  // ─────────────────────────────────────────────

  describe("NGEGovernanceToken", function () {
    const CAP = ethers.parseEther("100000000");      // 100M
    const INITIAL = ethers.parseEther("10000000");    // 10M

    beforeEach(async function () {
      [deployer, voter1, voter2, recipient] = await ethers.getSigners();
      const Factory = await ethers.getContractFactory("NGEGovernanceToken");
      token = await Factory.deploy(CAP, INITIAL);
      await token.waitForDeployment();
    });

    it("sets name and symbol", async function () {
      expect(await token.name()).to.equal("NextGen Economy");
      expect(await token.symbol()).to.equal("NGE");
    });

    it("mints initial supply to deployer", async function () {
      expect(await token.totalSupply()).to.equal(INITIAL);
      expect(await token.balanceOf(deployer.address)).to.equal(INITIAL);
    });

    it("sets supply cap", async function () {
      expect(await token.supplyCap()).to.equal(CAP);
    });

    it("reports mintable supply", async function () {
      expect(await token.mintableSupply()).to.equal(CAP - INITIAL);
    });

    it("owner can mint up to cap", async function () {
      const amount = ethers.parseEther("1000");
      await token.mint(voter1.address, amount);
      expect(await token.balanceOf(voter1.address)).to.equal(amount);
    });

    it("reverts mint exceeding cap", async function () {
      const remaining = await token.mintableSupply();
      await expect(
        token.mint(voter1.address, remaining + 1n)
      ).to.be.revertedWithCustomError(token, "SupplyCapExceeded");
    });

    it("non-owner cannot mint", async function () {
      await expect(
        token.connect(voter1).mint(voter1.address, 1n)
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });

    it("owner can pause and unpause", async function () {
      await token.pause();
      await expect(
        token.transfer(voter1.address, 1n)
      ).to.be.revertedWithCustomError(token, "EnforcedPause");

      await token.unpause();
      await expect(token.transfer(voter1.address, 1n)).to.not.be.reverted;
    });

    it("supports ERC20Votes delegation", async function () {
      await token.delegate(deployer.address);
      const votes = await token.getVotes(deployer.address);
      expect(votes).to.equal(INITIAL);
    });

    it("supports ERC20Permit (EIP-2612)", async function () {
      // Just verify the DOMAIN_SEPARATOR exists (full signature test is complex)
      const domain = await token.eip712Domain();
      expect(domain.name).to.equal("NextGen Economy");
    });

    it("can update supply cap", async function () {
      const newCap = ethers.parseEther("200000000");
      await token.setSupplyCap(newCap);
      expect(await token.supplyCap()).to.equal(newCap);
    });

    it("cannot set cap below current supply", async function () {
      await expect(
        token.setSupplyCap(ethers.parseEther("1"))
      ).to.be.revertedWithCustomError(token, "CapBelowSupply");
    });
  });

  // ─────────────────────────────────────────────
  //  Full Governance Stack
  // ─────────────────────────────────────────────

  describe("Governor + Timelock", function () {
    const INITIAL = ethers.parseEther("10000000");

    beforeEach(async function () {
      [deployer, voter1, voter2, recipient] = await ethers.getSigners();

      // 1. Token
      token = await (await ethers.getContractFactory("NGEGovernanceToken"))
        .deploy(ethers.parseEther("100000000"), INITIAL);
      await token.waitForDeployment();

      // 2. Timelock (1 second delay for testing)
      const TimelockFactory = await ethers.getContractFactory("TimelockController");
      timelock = await TimelockFactory.deploy(
        1, [], [ethers.ZeroAddress], deployer.address
      );
      await timelock.waitForDeployment();

      // 3. Governor
      governor = await (await ethers.getContractFactory("NGEGovernor"))
        .deploy(await token.getAddress(), await timelock.getAddress());
      await governor.waitForDeployment();

      // 4. Grant governor roles on timelock
      const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
      const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();
      const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
      await timelock.grantRole(PROPOSER_ROLE, await governor.getAddress());
      await timelock.grantRole(CANCELLER_ROLE, await governor.getAddress());
      await timelock.grantRole(EXECUTOR_ROLE, await governor.getAddress());

      // 5. Delegate votes
      await token.delegate(deployer.address);

      // Mine a block so delegation checkpoint is recorded
      await mine(1);
    });

    it("deploys governor with correct name", async function () {
      expect(await governor.name()).to.equal("NGE Governor");
    });

    it("has correct voting delay and period", async function () {
      expect(await governor.votingDelay()).to.equal(7200);
      expect(await governor.votingPeriod()).to.equal(50400);
    });

    it("creates a proposal", async function () {
      const targets = [await token.getAddress()];
      const values = [0];
      const calldatas = [token.interface.encodeFunctionData("mint", [recipient.address, ethers.parseEther("1000")])];

      const tx = await governor.propose(targets, values, calldatas, "Mint 1000 NGE");
      const receipt = await tx.wait();
      expect(receipt.status).to.equal(1);
    });

    it("end-to-end: propose, vote, queue, execute", async function () {
      // Transfer token ownership to timelock (so timelock can mint)
      await token.transferOwnership(await timelock.getAddress());

      const mintAmount = ethers.parseEther("1000");
      const targets = [await token.getAddress()];
      const values = [0];
      const calldatas = [token.interface.encodeFunctionData("mint", [recipient.address, mintAmount])];
      const description = "Mint 1000 NGE to recipient";
      const descHash = ethers.keccak256(ethers.toUtf8Bytes(description));

      // Propose
      const proposeTx = await governor.propose(targets, values, calldatas, description);
      const proposeReceipt = await proposeTx.wait();
      const proposalId = proposeReceipt.logs.find(
        l => l.fragment && l.fragment.name === "ProposalCreated"
      ).args.proposalId;

      // Advance past voting delay
      await mine(7201);

      // Vote
      await governor.castVote(proposalId, 1); // For

      // Advance past voting period
      await mine(50401);

      // Queue
      await governor.queue(targets, values, calldatas, descHash);

      // Wait for timelock
      await time.increase(2);

      // Execute
      await governor.execute(targets, values, calldatas, descHash);

      // Verify
      expect(await token.balanceOf(recipient.address)).to.equal(mintAmount);
    });
  });
});
