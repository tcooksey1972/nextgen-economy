/**
 * @file RecoverableVault.test.js
 * @description Tests for the Emergency Key Rotation use case.
 *
 * Covers: deployment, guardian management, recovery proposals,
 * voting, timelock execution, cancellation, and full recovery flow.
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("RecoverableVault", function () {
  const TWO_DAYS = 2 * 24 * 60 * 60;

  let vault, vaultAddr;
  let owner, g1, g2, g3, g4, g5, newOwner, attacker;

  beforeEach(async function () {
    [owner, g1, g2, g3, g4, g5, newOwner, attacker] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("RecoverableVault");
    vault = await Factory.deploy(
      [g1.address, g2.address, g3.address, g4.address, g5.address],
      3,         // threshold: 3-of-5
      TWO_DAYS   // execution delay
    );
    await vault.waitForDeployment();
    vaultAddr = await vault.getAddress();

    await owner.sendTransaction({ to: vaultAddr, value: ethers.parseEther("50") });
  });

  // ─────────────────────────────────────────────
  //  Deployment
  // ─────────────────────────────────────────────

  describe("Deployment", function () {
    it("sets the correct owner", async function () {
      expect(await vault.owner()).to.equal(owner.address);
    });

    it("registers all guardians", async function () {
      expect(await vault.guardianCount()).to.equal(5);
      expect(await vault.isGuardian(g1.address)).to.be.true;
      expect(await vault.isGuardian(g5.address)).to.be.true;
    });

    it("sets threshold and delay", async function () {
      expect(await vault.threshold()).to.equal(3);
      expect(await vault.executionDelay()).to.equal(TWO_DAYS);
    });

    it("reverts with invalid threshold", async function () {
      const Factory = await ethers.getContractFactory("RecoverableVault");
      await expect(
        Factory.deploy([g1.address], 0, TWO_DAYS)
      ).to.be.revertedWithCustomError(vault, "InvalidThreshold");

      await expect(
        Factory.deploy([g1.address], 5, TWO_DAYS)
      ).to.be.revertedWithCustomError(vault, "InvalidThreshold");
    });
  });

  // ─────────────────────────────────────────────
  //  Vault Operations
  // ─────────────────────────────────────────────

  describe("Vault Operations", function () {
    it("owner can withdraw", async function () {
      await expect(vault.withdraw(owner.address, ethers.parseEther("1")))
        .to.emit(vault, "Withdrawn");
    });

    it("non-owner cannot withdraw", async function () {
      await expect(
        vault.connect(attacker).withdraw(attacker.address, ethers.parseEther("1"))
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("reverts on insufficient balance", async function () {
      await expect(
        vault.withdraw(owner.address, ethers.parseEther("999"))
      ).to.be.revertedWithCustomError(vault, "InsufficientBalance");
    });
  });

  // ─────────────────────────────────────────────
  //  Recovery Proposals
  // ─────────────────────────────────────────────

  describe("Recovery Proposals", function () {
    it("guardian can propose recovery", async function () {
      await expect(vault.connect(g1).proposeRecovery(newOwner.address))
        .to.emit(vault, "RecoveryProposed")
        .withArgs(1, g1.address, newOwner.address);
    });

    it("non-guardian cannot propose", async function () {
      await expect(
        vault.connect(attacker).proposeRecovery(newOwner.address)
      ).to.be.revertedWithCustomError(vault, "NotGuardian");
    });

    it("proposer auto-approves", async function () {
      await vault.connect(g1).proposeRecovery(newOwner.address);
      expect(await vault.hasApproved(1, g1.address)).to.be.true;
    });

    it("guardian can propose pause", async function () {
      await expect(vault.connect(g1).proposePause())
        .to.emit(vault, "PauseProposed");
    });
  });

  // ─────────────────────────────────────────────
  //  Approval & Execution
  // ─────────────────────────────────────────────

  describe("Approval & Execution", function () {
    beforeEach(async function () {
      await vault.connect(g1).proposeRecovery(newOwner.address);
    });

    it("guardians can approve", async function () {
      await expect(vault.connect(g2).approve(1))
        .to.emit(vault, "RecoveryApproved")
        .withArgs(1, g2.address, 2);
    });

    it("cannot double-approve", async function () {
      await expect(
        vault.connect(g1).approve(1)
      ).to.be.revertedWithCustomError(vault, "AlreadyApproved");
    });

    it("cannot execute below threshold", async function () {
      await vault.connect(g2).approve(1);
      await expect(
        vault.execute(1)
      ).to.be.revertedWithCustomError(vault, "ThresholdNotMet");
    });

    it("cannot execute before delay", async function () {
      await vault.connect(g2).approve(1);
      await vault.connect(g3).approve(1);
      await expect(
        vault.execute(1)
      ).to.be.revertedWithCustomError(vault, "DelayNotElapsed");
    });

    it("executes recovery after threshold + delay", async function () {
      await vault.connect(g2).approve(1);
      await vault.connect(g3).approve(1);
      await time.increase(TWO_DAYS + 1);

      await expect(vault.execute(1))
        .to.emit(vault, "RecoveryExecuted")
        .withArgs(1, newOwner.address);

      expect(await vault.owner()).to.equal(newOwner.address);
    });

    it("cannot execute twice", async function () {
      await vault.connect(g2).approve(1);
      await vault.connect(g3).approve(1);
      await time.increase(TWO_DAYS + 1);
      await vault.execute(1);
      await expect(
        vault.execute(1)
      ).to.be.revertedWithCustomError(vault, "ProposalNotActive");
    });
  });

  // ─────────────────────────────────────────────
  //  Cancellation
  // ─────────────────────────────────────────────

  describe("Cancellation", function () {
    it("proposer can cancel", async function () {
      await vault.connect(g1).proposeRecovery(newOwner.address);
      await expect(vault.connect(g1).cancel(1))
        .to.emit(vault, "RecoveryCancelled");
    });

    it("owner can cancel", async function () {
      await vault.connect(g1).proposeRecovery(newOwner.address);
      await vault.cancel(1);
      const [,,,, , , cancelled] = await vault.proposals(1);
      expect(cancelled).to.be.true;
    });

    it("random cannot cancel", async function () {
      await vault.connect(g1).proposeRecovery(newOwner.address);
      await expect(vault.connect(attacker).cancel(1)).to.be.reverted;
    });
  });

  // ─────────────────────────────────────────────
  //  Guardian Management
  // ─────────────────────────────────────────────

  describe("Guardian Management", function () {
    it("owner can add guardian", async function () {
      await vault.addGuardian(attacker.address);
      expect(await vault.isGuardian(attacker.address)).to.be.true;
      expect(await vault.guardianCount()).to.equal(6);
    });

    it("owner can remove guardian", async function () {
      await vault.removeGuardian(g5.address);
      expect(await vault.isGuardian(g5.address)).to.be.false;
      expect(await vault.guardianCount()).to.equal(4);
    });

    it("cannot remove below threshold", async function () {
      await vault.removeGuardian(g5.address);
      await vault.removeGuardian(g4.address);
      // 3 guardians left, threshold is 3, cannot go below
      await expect(
        vault.removeGuardian(g3.address)
      ).to.be.revertedWithCustomError(vault, "InvalidThreshold");
    });
  });

  // ─────────────────────────────────────────────
  //  End-to-end: Lost Key Recovery
  // ─────────────────────────────────────────────

  describe("End-to-end: Lost key recovery", function () {
    it("full recovery flow works", async function () {
      // Owner's key is lost. Guardians recover.
      // 1. Guardian proposes new owner
      await vault.connect(g1).proposeRecovery(newOwner.address);

      // 2. Two more guardians approve (3-of-5)
      await vault.connect(g2).approve(1);
      await vault.connect(g3).approve(1);

      // 3. Wait 48 hours
      await time.increase(TWO_DAYS + 1);

      // 4. Execute recovery
      await vault.execute(1);
      expect(await vault.owner()).to.equal(newOwner.address);

      // 5. New owner can withdraw
      await expect(vault.connect(newOwner).withdraw(newOwner.address, ethers.parseEther("1")))
        .to.emit(vault, "Withdrawn");
    });
  });
});
