/**
 * @file DeFiSentinelVault.test.js
 * @description Tests for the DeFi Vault Protection use case.
 *
 * Covers: deployment, rate limiting, dead man switch, watchdog alerts,
 * break glass guardian recovery, and end-to-end key compromise scenario.
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("DeFiSentinelVault", function () {
  const THREE_DAYS = 3 * 24 * 60 * 60;
  const ONE_DAY = 24 * 60 * 60;
  const TWO_DAYS = 2 * 24 * 60 * 60;
  const ONE_HOUR = 60 * 60;

  let vault, vaultAddr;
  let owner, g1, g2, g3, g4, g5, recipient, attacker;

  async function deployVault() {
    [owner, g1, g2, g3, g4, g5, recipient, attacker] = await ethers.getSigners();

    const config = {
      heartbeatInterval: THREE_DAYS,
      gracePeriod: ONE_DAY,
      recoveryAddress: g1.address,
      rateLimitMax: ethers.parseEther("50"),
      rateLimitWindow: ONE_DAY,
      guardians: [g1.address, g2.address, g3.address, g4.address, g5.address],
      guardianThreshold: 3,
      emergencyDelay: TWO_DAYS,
      largeTransferThreshold: ethers.parseEther("10"),
      rapidActivityThreshold: 5,
      rapidActivityWindow: ONE_HOUR,
    };

    const Factory = await ethers.getContractFactory("DeFiSentinelVault");
    vault = await Factory.deploy(config);
    await vault.waitForDeployment();
    vaultAddr = await vault.getAddress();

    // Fund with 200 ETH
    await owner.sendTransaction({ to: vaultAddr, value: ethers.parseEther("200") });
  }

  beforeEach(deployVault);

  // ─────────────────────────────────────────────
  //  Deployment
  // ─────────────────────────────────────────────

  describe("Deployment", function () {
    it("sets the owner as deployer", async function () {
      expect(await vault.owner()).to.equal(owner.address);
    });

    it("configures heartbeat interval", async function () {
      expect(await vault.heartbeatInterval()).to.equal(THREE_DAYS);
    });

    it("configures rate limit", async function () {
      expect(await vault.rateLimitMax()).to.equal(ethers.parseEther("50"));
    });

    it("registers all 5 guardians", async function () {
      expect(await vault.guardianCount()).to.equal(5);
      expect(await vault.isGuardian(g1.address)).to.be.true;
      expect(await vault.isGuardian(g5.address)).to.be.true;
    });

    it("sets guardian threshold to 3", async function () {
      expect(await vault.guardianThreshold()).to.equal(3);
    });

    it("accepts deposits via receive()", async function () {
      const balance = await ethers.provider.getBalance(vaultAddr);
      expect(balance).to.equal(ethers.parseEther("200"));
    });
  });

  // ─────────────────────────────────────────────
  //  Rate Limiter
  // ─────────────────────────────────────────────

  describe("Rate Limiter", function () {
    it("allows withdrawal within limit", async function () {
      await expect(vault.withdraw(recipient.address, ethers.parseEther("20")))
        .to.emit(vault, "Withdrawn");
    });

    it("allows exact max amount", async function () {
      await expect(vault.withdraw(recipient.address, ethers.parseEther("50")))
        .to.not.be.reverted;
    });

    it("reverts when exceeding limit", async function () {
      await expect(
        vault.withdraw(recipient.address, ethers.parseEther("51"))
      ).to.be.revertedWithCustomError(vault, "RateLimitExceeded");
    });

    it("reverts on cumulative excess", async function () {
      await vault.withdraw(recipient.address, ethers.parseEther("30"));
      await expect(
        vault.withdraw(recipient.address, ethers.parseEther("25"))
      ).to.be.revertedWithCustomError(vault, "RateLimitExceeded");
    });

    it("resets after window expires", async function () {
      await vault.withdraw(recipient.address, ethers.parseEther("50"));
      await time.increase(ONE_DAY + 1);
      await expect(vault.withdraw(recipient.address, ethers.parseEther("50")))
        .to.not.be.reverted;
    });

    it("tracks remaining capacity", async function () {
      await vault.withdraw(recipient.address, ethers.parseEther("20"));
      expect(await vault.currentWindowRemaining()).to.equal(ethers.parseEther("30"));
    });
  });

  // ─────────────────────────────────────────────
  //  Dead Man Switch
  // ─────────────────────────────────────────────

  describe("Dead Man Switch", function () {
    it("owner can check in", async function () {
      await expect(vault.checkIn())
        .to.emit(vault, "HeartbeatReceived");
    });

    it("non-owner cannot check in", async function () {
      await expect(
        vault.connect(attacker).checkIn()
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("cannot activate before deadline", async function () {
      await expect(
        vault.activateSwitch()
      ).to.be.revertedWithCustomError(vault, "DeadlineNotReached");
    });

    it("activates after deadline passes", async function () {
      await time.increase(THREE_DAYS + ONE_DAY + 1);
      await expect(vault.activateSwitch())
        .to.emit(vault, "SwitchActivated");
    });

    it("pauses the contract on activation", async function () {
      await time.increase(THREE_DAYS + ONE_DAY + 1);
      await vault.activateSwitch();
      expect(await vault.paused()).to.be.true;
    });

    it("transfers ownership to recovery address", async function () {
      await time.increase(THREE_DAYS + ONE_DAY + 1);
      await vault.activateSwitch();
      expect(await vault.owner()).to.equal(g1.address);
    });

    it("cannot activate twice", async function () {
      await time.increase(THREE_DAYS + ONE_DAY + 1);
      await vault.activateSwitch();
      await expect(
        vault.activateSwitch()
      ).to.be.revertedWithCustomError(vault, "SwitchAlreadyActivated");
    });

    it("check-in resets the timer", async function () {
      await time.increase(THREE_DAYS);
      await vault.checkIn();
      // Deadline should be from now + 3 days + 1 day
      await time.increase(THREE_DAYS);
      await expect(vault.activateSwitch()).to.be.revertedWithCustomError(vault, "DeadlineNotReached");
    });
  });

  // ─────────────────────────────────────────────
  //  Watchdog Alerts
  // ─────────────────────────────────────────────

  describe("Watchdog Alerts", function () {
    it("emits alert for large transfer", async function () {
      await expect(vault.withdraw(recipient.address, ethers.parseEther("15")))
        .to.emit(vault, "WatchdogAlert")
        .withArgs("CRITICAL", "Large transfer detected", vaultAddr, recipient.address, ethers.parseEther("15"));
    });

    it("no alert for small transfer", async function () {
      await expect(vault.withdraw(recipient.address, ethers.parseEther("5")))
        .to.not.emit(vault, "WatchdogAlert");
    });
  });

  // ─────────────────────────────────────────────
  //  Break Glass (Guardian Recovery)
  // ─────────────────────────────────────────────

  describe("Break Glass", function () {
    it("guardian can propose emergency", async function () {
      await expect(vault.connect(g1).proposeEmergency("pause", ethers.ZeroAddress))
        .to.emit(vault, "EmergencyProposed");
    });

    it("non-guardian cannot propose", async function () {
      await expect(
        vault.connect(attacker).proposeEmergency("pause", ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(vault, "NotGuardian");
    });

    it("requires threshold approvals", async function () {
      await vault.connect(g1).proposeEmergency("pause", ethers.ZeroAddress);
      // Only 1 approval, need 3
      await expect(
        vault.executeEmergency(1)
      ).to.be.revertedWithCustomError(vault, "ThresholdNotMet");
    });

    it("requires delay after threshold met", async function () {
      await vault.connect(g1).proposeEmergency("pause", ethers.ZeroAddress);
      await vault.connect(g2).approveEmergency(1);
      await vault.connect(g3).approveEmergency(1);
      // Threshold met but delay not elapsed
      await expect(
        vault.executeEmergency(1)
      ).to.be.revertedWithCustomError(vault, "DelayNotElapsed");
    });

    it("executes pause after threshold + delay", async function () {
      await vault.connect(g1).proposeEmergency("pause", ethers.ZeroAddress);
      await vault.connect(g2).approveEmergency(1);
      await vault.connect(g3).approveEmergency(1);
      await time.increase(TWO_DAYS + 1);
      await vault.executeEmergency(1);
      expect(await vault.paused()).to.be.true;
    });

    it("executes ownership transfer", async function () {
      await vault.connect(g1).proposeEmergency("transfer", recipient.address);
      await vault.connect(g2).approveEmergency(1);
      await vault.connect(g3).approveEmergency(1);
      await time.increase(TWO_DAYS + 1);
      await vault.executeEmergency(1);
      expect(await vault.owner()).to.equal(recipient.address);
    });

    it("cannot double-approve", async function () {
      await vault.connect(g1).proposeEmergency("pause", ethers.ZeroAddress);
      await expect(
        vault.connect(g1).approveEmergency(1)
      ).to.be.revertedWithCustomError(vault, "AlreadyApproved");
    });
  });

  // ─────────────────────────────────────────────
  //  Access Control
  // ─────────────────────────────────────────────

  describe("Access Control", function () {
    it("only owner can withdraw", async function () {
      await expect(
        vault.connect(attacker).withdraw(attacker.address, ethers.parseEther("1"))
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("reverts on insufficient balance", async function () {
      await expect(
        vault.withdraw(recipient.address, ethers.parseEther("999"))
      ).to.be.revertedWithCustomError(vault, "InsufficientBalance");
    });

    it("blocks withdrawals when paused", async function () {
      await time.increase(THREE_DAYS + ONE_DAY + 1);
      await vault.activateSwitch();
      // New owner is g1 after switch
      await expect(
        vault.connect(g1).withdraw(g1.address, ethers.parseEther("1"))
      ).to.be.revertedWithCustomError(vault, "EnforcedPause");
    });
  });

  // ─────────────────────────────────────────────
  //  End-to-end: Key Compromise Scenario
  // ─────────────────────────────────────────────

  describe("End-to-end: Key compromise", function () {
    it("limits damage from compromised key", async function () {
      // Attacker drains max in window 1
      await vault.withdraw(recipient.address, ethers.parseEther("50"));

      // Can't drain more in same window
      await expect(
        vault.withdraw(recipient.address, ethers.parseEther("1"))
      ).to.be.revertedWithCustomError(vault, "RateLimitExceeded");

      // Window 2: drains another max
      await time.increase(ONE_DAY + 1);
      await vault.withdraw(recipient.address, ethers.parseEther("50"));

      // Dead man switch activates after 3 days + 1 day grace
      await time.increase(THREE_DAYS);
      await vault.connect(g1).activateSwitch();
      expect(await vault.paused()).to.be.true;

      // Total loss: 100 ETH out of 200 ETH (rate limit saved 100 ETH)
      const balance = await ethers.provider.getBalance(vaultAddr);
      expect(balance).to.equal(ethers.parseEther("100"));
    });
  });
});
