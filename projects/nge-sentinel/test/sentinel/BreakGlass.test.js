/**
 * @file BreakGlass.test.js
 * @description Hardhat test suite for the BreakGlass abstract contract,
 * exercised through the BreakGlassVault example contract.
 *
 * Covers: deployment, guardian management, proposal lifecycle (propose,
 * approve, execute, cancel), timelock enforcement, and access control.
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("BreakGlass", function () {
  const DELAY = 3600; // 1 hour execution delay

  let vault, vaultAddr;
  let owner, guardian1, guardian2, guardian3, attacker;

  beforeEach(async function () {
    [owner, guardian1, guardian2, guardian3, attacker] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("BreakGlassVault");
    vault = await Factory.deploy(
      [guardian1.address, guardian2.address, guardian3.address],
      2,     // threshold: 2 of 3
      DELAY
    );
    await vault.waitForDeployment();
    vaultAddr = await vault.getAddress();

    // Fund the vault
    await owner.sendTransaction({ to: vaultAddr, value: ethers.parseEther("10") });
  });

  // ─────────────────────────────────────────────
  //  Deployment
  // ─────────────────────────────────────────────

  describe("Deployment", function () {
    it("sets the correct threshold", async function () {
      expect(await vault.threshold()).to.equal(2);
    });

    it("sets the correct execution delay", async function () {
      expect(await vault.executionDelay()).to.equal(DELAY);
    });

    it("registers all guardians", async function () {
      expect(await vault.isGuardian(guardian1.address)).to.be.true;
      expect(await vault.isGuardian(guardian2.address)).to.be.true;
      expect(await vault.isGuardian(guardian3.address)).to.be.true;
      expect(await vault.guardianCount()).to.equal(3);
    });

    it("non-guardian is not registered", async function () {
      expect(await vault.isGuardian(attacker.address)).to.be.false;
    });

    it("reverts with zero delay", async function () {
      const Factory = await ethers.getContractFactory("BreakGlassVault");
      await expect(
        Factory.deploy([guardian1.address], 1, 0)
      ).to.be.revertedWithCustomError(vault, "ZeroDelay");
    });

    it("reverts with zero threshold", async function () {
      const Factory = await ethers.getContractFactory("BreakGlassVault");
      await expect(
        Factory.deploy([guardian1.address], 0, DELAY)
      ).to.be.revertedWithCustomError(vault, "InvalidThreshold");
    });

    it("reverts with threshold exceeding guardian count", async function () {
      const Factory = await ethers.getContractFactory("BreakGlassVault");
      await expect(
        Factory.deploy([guardian1.address], 5, DELAY)
      ).to.be.revertedWithCustomError(vault, "InvalidThreshold");
    });

    it("reverts with zero address guardian", async function () {
      const Factory = await ethers.getContractFactory("BreakGlassVault");
      await expect(
        Factory.deploy([ethers.ZeroAddress], 1, DELAY)
      ).to.be.revertedWithCustomError(vault, "BreakGlassZeroAddress");
    });
  });

  // ─────────────────────────────────────────────
  //  Proposal lifecycle
  // ─────────────────────────────────────────────

  describe("Propose", function () {
    it("guardian can propose an emergency action", async function () {
      await expect(
        vault.connect(guardian1).proposeEmergency(0, ethers.ZeroAddress) // PAUSE
      ).to.emit(vault, "EmergencyProposed");
      expect(await vault.proposalCount()).to.equal(1);
    });

    it("non-guardian cannot propose", async function () {
      await expect(
        vault.connect(attacker).proposeEmergency(0, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(vault, "NotGuardian");
    });

    it("TRANSFER_OWNERSHIP requires non-zero target", async function () {
      await expect(
        vault.connect(guardian1).proposeEmergency(2, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(vault, "BreakGlassZeroAddress");
    });

    it("proposer's approval is counted automatically", async function () {
      await vault.connect(guardian1).proposeEmergency(0, ethers.ZeroAddress);
      expect(await vault.hasApproved(1, guardian1.address)).to.be.true;
      const proposal = await vault.getProposal(1);
      expect(proposal.approvalCount).to.equal(1);
    });
  });

  describe("Approve", function () {
    beforeEach(async function () {
      // Guardian1 proposes PAUSE (1 of 2 approvals)
      await vault.connect(guardian1).proposeEmergency(0, ethers.ZeroAddress);
    });

    it("second guardian can approve", async function () {
      await expect(
        vault.connect(guardian2).approveEmergency(1)
      ).to.emit(vault, "EmergencyApproved")
        .withArgs(1, guardian2.address, 2);
    });

    it("cannot approve twice", async function () {
      await expect(
        vault.connect(guardian1).approveEmergency(1)
      ).to.be.revertedWithCustomError(vault, "AlreadyApproved");
    });

    it("non-guardian cannot approve", async function () {
      await expect(
        vault.connect(attacker).approveEmergency(1)
      ).to.be.revertedWithCustomError(vault, "NotGuardian");
    });

    it("sets thresholdMetAt when threshold reached", async function () {
      await vault.connect(guardian2).approveEmergency(1);
      const proposal = await vault.getProposal(1);
      expect(proposal.thresholdMetAt).to.be.greaterThan(0);
    });
  });

  describe("Execute", function () {
    beforeEach(async function () {
      // Propose and approve PAUSE
      await vault.connect(guardian1).proposeEmergency(0, ethers.ZeroAddress);
      await vault.connect(guardian2).approveEmergency(1);
    });

    it("reverts before delay elapses", async function () {
      await expect(
        vault.executeEmergency(1)
      ).to.be.revertedWithCustomError(vault, "DelayNotElapsed");
    });

    it("executes PAUSE after delay", async function () {
      await time.increase(DELAY + 1);
      await expect(vault.executeEmergency(1))
        .to.emit(vault, "EmergencyExecuted");
      expect(await vault.paused()).to.be.true;
    });

    it("anyone can execute after delay (not just guardians)", async function () {
      await time.increase(DELAY + 1);
      await expect(vault.connect(attacker).executeEmergency(1)).to.not.be.reverted;
    });

    it("cannot execute twice", async function () {
      await time.increase(DELAY + 1);
      await vault.executeEmergency(1);
      await expect(
        vault.executeEmergency(1)
      ).to.be.revertedWithCustomError(vault, "ProposalNotActive");
    });

    it("executes UNPAUSE", async function () {
      // First pause via proposal
      await time.increase(DELAY + 1);
      await vault.executeEmergency(1);
      expect(await vault.paused()).to.be.true;

      // Now propose UNPAUSE
      await vault.connect(guardian1).proposeEmergency(1, ethers.ZeroAddress);
      await vault.connect(guardian2).approveEmergency(2);
      await time.increase(DELAY + 1);
      await vault.executeEmergency(2);
      expect(await vault.paused()).to.be.false;
    });

    it("executes TRANSFER_OWNERSHIP", async function () {
      // Propose TRANSFER_OWNERSHIP to attacker
      await vault.connect(guardian1).proposeEmergency(2, attacker.address);
      await vault.connect(guardian2).approveEmergency(2);
      await time.increase(DELAY + 1);
      await vault.executeEmergency(2);
      expect(await vault.owner()).to.equal(attacker.address);
    });
  });

  describe("Cancel", function () {
    beforeEach(async function () {
      await vault.connect(guardian1).proposeEmergency(0, ethers.ZeroAddress);
    });

    it("proposer can cancel", async function () {
      await expect(
        vault.connect(guardian1).cancelEmergency(1)
      ).to.emit(vault, "EmergencyCancelled")
        .withArgs(1, guardian1.address);
    });

    it("owner can cancel", async function () {
      await expect(vault.cancelEmergency(1))
        .to.emit(vault, "EmergencyCancelled");
    });

    it("other guardian cannot cancel", async function () {
      await expect(
        vault.connect(guardian2).cancelEmergency(1)
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("cannot execute cancelled proposal", async function () {
      await vault.connect(guardian2).approveEmergency(1);
      await vault.connect(guardian1).cancelEmergency(1);
      await time.increase(DELAY + 1);
      await expect(
        vault.executeEmergency(1)
      ).to.be.revertedWithCustomError(vault, "ProposalNotActive");
    });

    it("cannot approve cancelled proposal", async function () {
      await vault.connect(guardian1).cancelEmergency(1);
      await expect(
        vault.connect(guardian2).approveEmergency(1)
      ).to.be.revertedWithCustomError(vault, "ProposalNotActive");
    });
  });

  // ─────────────────────────────────────────────
  //  Guardian management
  // ─────────────────────────────────────────────

  describe("Guardian management", function () {
    it("owner can add a guardian", async function () {
      await expect(vault.addGuardian(attacker.address))
        .to.emit(vault, "GuardianAdded")
        .withArgs(attacker.address);
      expect(await vault.isGuardian(attacker.address)).to.be.true;
      expect(await vault.guardianCount()).to.equal(4);
    });

    it("reverts adding zero address guardian", async function () {
      await expect(
        vault.addGuardian(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(vault, "BreakGlassZeroAddress");
    });

    it("owner can remove a guardian", async function () {
      await expect(vault.removeGuardian(guardian3.address))
        .to.emit(vault, "GuardianRemoved")
        .withArgs(guardian3.address);
      expect(await vault.isGuardian(guardian3.address)).to.be.false;
      expect(await vault.guardianCount()).to.equal(2);
    });

    it("reverts removal if it would break threshold", async function () {
      // 3 guardians, threshold 2 — removing 2 would leave 1 < threshold
      await vault.removeGuardian(guardian3.address);
      await expect(
        vault.removeGuardian(guardian2.address)
      ).to.be.revertedWithCustomError(vault, "InvalidThreshold");
    });

    it("owner can update threshold", async function () {
      await vault.setThreshold(3);
      expect(await vault.threshold()).to.equal(3);
    });

    it("reverts threshold exceeding guardian count", async function () {
      await expect(
        vault.setThreshold(5)
      ).to.be.revertedWithCustomError(vault, "InvalidThreshold");
    });

    it("non-owner cannot manage guardians", async function () {
      await expect(
        vault.connect(attacker).addGuardian(attacker.address)
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
      await expect(
        vault.connect(attacker).removeGuardian(guardian1.address)
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
      await expect(
        vault.connect(attacker).setThreshold(1)
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });
  });

  // ─────────────────────────────────────────────
  //  Threshold-of-1 (single guardian can execute)
  // ─────────────────────────────────────────────

  describe("Single guardian threshold", function () {
    let singleVault;

    beforeEach(async function () {
      const Factory = await ethers.getContractFactory("BreakGlassVault");
      singleVault = await Factory.deploy(
        [guardian1.address],
        1,
        DELAY
      );
      await singleVault.waitForDeployment();
    });

    it("proposal meets threshold immediately on creation", async function () {
      await singleVault.connect(guardian1).proposeEmergency(0, ethers.ZeroAddress);
      const proposal = await singleVault.getProposal(1);
      expect(proposal.thresholdMetAt).to.be.greaterThan(0);
    });

    it("can execute after delay without additional approval", async function () {
      await singleVault.connect(guardian1).proposeEmergency(0, ethers.ZeroAddress);
      await time.increase(DELAY + 1);
      await expect(singleVault.executeEmergency(1)).to.not.be.reverted;
    });
  });

  // ─────────────────────────────────────────────
  //  End-to-end: emergency pause and recovery
  // ─────────────────────────────────────────────

  describe("End-to-end: emergency pause and withdrawal", function () {
    it("guardians pause vault, owner unpause and withdraw", async function () {
      // 1. Guardians propose and approve PAUSE
      await vault.connect(guardian1).proposeEmergency(0, ethers.ZeroAddress);
      await vault.connect(guardian2).approveEmergency(1);

      // 2. Wait for delay
      await time.increase(DELAY + 1);

      // 3. Execute PAUSE
      await vault.executeEmergency(1);
      expect(await vault.paused()).to.be.true;

      // 4. Withdrawals blocked while paused
      await expect(
        vault.withdraw(owner.address, ethers.parseEther("1"))
      ).to.be.revertedWithCustomError(vault, "EnforcedPause");

      // 5. Owner unpause
      await vault.unpause();
      expect(await vault.paused()).to.be.false;

      // 6. Withdraw succeeds
      await vault.withdraw(owner.address, ethers.parseEther("5"));
    });
  });
});
