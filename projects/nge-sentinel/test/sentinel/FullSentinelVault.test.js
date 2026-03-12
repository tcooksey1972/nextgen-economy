/**
 * @file FullSentinelVault.test.js
 * @description Hardhat test suite for FullSentinelVault, which integrates
 * all four Sentinel modules: DeadManSwitch, RateLimiter, BreakGlass,
 * and WatchdogAlert.
 *
 * Covers: deployment, module interaction, combined security enforcement,
 * and end-to-end emergency scenarios.
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("FullSentinelVault", function () {
  // Module parameters
  const HEARTBEAT = 30 * 24 * 60 * 60;          // 30 days
  const GRACE = 7 * 24 * 60 * 60;               // 7 days
  const MAX_WITHDRAW = ethers.parseEther("10");  // 10 ETH per window
  const WITHDRAW_WINDOW = 24 * 60 * 60;          // 24 hours
  const GUARDIAN_THRESHOLD = 2;
  const EMERGENCY_DELAY = 3600;                   // 1 hour
  const LARGE_TRANSFER = ethers.parseEther("5"); // 5 ETH alert
  const RAPID_COUNT = 3;
  const RAPID_WINDOW = 3600;                      // 1 hour

  let vault, vaultAddr;
  let owner, recovery, guardian1, guardian2, guardian3, attacker;

  beforeEach(async function () {
    [owner, recovery, guardian1, guardian2, guardian3, attacker] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("FullSentinelVault");
    vault = await Factory.deploy({
      heartbeatInterval: HEARTBEAT,
      gracePeriod: GRACE,
      recoveryAddress: recovery.address,
      maxWithdraw: MAX_WITHDRAW,
      withdrawWindow: WITHDRAW_WINDOW,
      guardians: [guardian1.address, guardian2.address, guardian3.address],
      guardianThreshold: GUARDIAN_THRESHOLD,
      emergencyDelay: EMERGENCY_DELAY,
      largeTransfer: LARGE_TRANSFER,
      rapidCount: RAPID_COUNT,
      rapidWindow: RAPID_WINDOW,
    });
    await vault.waitForDeployment();
    vaultAddr = await vault.getAddress();

    // Fund the vault with 100 ETH
    await owner.sendTransaction({ to: vaultAddr, value: ethers.parseEther("100") });
  });

  // ─────────────────────────────────────────────
  //  Deployment
  // ─────────────────────────────────────────────

  describe("Deployment", function () {
    it("sets the correct owner", async function () {
      expect(await vault.owner()).to.equal(owner.address);
    });

    it("initializes DeadManSwitch", async function () {
      expect(await vault.heartbeatInterval()).to.equal(HEARTBEAT);
      expect(await vault.gracePeriod()).to.equal(GRACE);
      expect(await vault.recoveryAddress()).to.equal(recovery.address);
    });

    it("initializes RateLimiter", async function () {
      expect(await vault.rateLimitMax()).to.equal(MAX_WITHDRAW);
      expect(await vault.rateLimitWindow()).to.equal(WITHDRAW_WINDOW);
    });

    it("initializes BreakGlass", async function () {
      expect(await vault.threshold()).to.equal(GUARDIAN_THRESHOLD);
      expect(await vault.executionDelay()).to.equal(EMERGENCY_DELAY);
      expect(await vault.guardianCount()).to.equal(3);
    });

    it("initializes WatchdogAlert", async function () {
      expect(await vault.largeTransferThreshold()).to.equal(LARGE_TRANSFER);
      expect(await vault.rapidActivityThreshold()).to.equal(RAPID_COUNT);
      expect(await vault.rapidActivityWindow()).to.equal(RAPID_WINDOW);
    });
  });

  // ─────────────────────────────────────────────
  //  Combined enforcement
  // ─────────────────────────────────────────────

  describe("Combined enforcement", function () {
    it("withdrawal respects rate limit", async function () {
      await vault.withdraw(recovery.address, MAX_WITHDRAW);
      await expect(
        vault.withdraw(recovery.address, 1n)
      ).to.be.revertedWithCustomError(vault, "RateLimitExceeded");
    });

    it("withdrawal emits watchdog alert for large transfer", async function () {
      await expect(vault.withdraw(recovery.address, ethers.parseEther("5")))
        .to.emit(vault, "WatchdogAlerted");
    });

    it("withdrawal blocked when paused (dead man switch)", async function () {
      await time.increase(HEARTBEAT + GRACE + 1);
      await vault.connect(attacker).activateSwitch();

      await expect(
        vault.connect(recovery).withdraw(recovery.address, ethers.parseEther("1"))
      ).to.be.revertedWithCustomError(vault, "EnforcedPause");
    });

    it("non-owner cannot withdraw", async function () {
      await expect(
        vault.connect(attacker).withdraw(attacker.address, ethers.parseEther("1"))
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });
  });

  // ─────────────────────────────────────────────
  //  BreakGlass emergency pause
  // ─────────────────────────────────────────────

  describe("BreakGlass emergency pause", function () {
    it("guardians can pause the vault", async function () {
      await vault.connect(guardian1).proposeEmergency(0, ethers.ZeroAddress);
      await vault.connect(guardian2).approveEmergency(1);
      await time.increase(EMERGENCY_DELAY + 1);
      await vault.executeEmergency(1);
      expect(await vault.paused()).to.be.true;
    });

    it("owner can unpause after guardian pause", async function () {
      await vault.connect(guardian1).proposeEmergency(0, ethers.ZeroAddress);
      await vault.connect(guardian2).approveEmergency(1);
      await time.increase(EMERGENCY_DELAY + 1);
      await vault.executeEmergency(1);

      await vault.unpause();
      expect(await vault.paused()).to.be.false;
    });
  });

  // ─────────────────────────────────────────────
  //  Admin functions across modules
  // ─────────────────────────────────────────────

  describe("Admin functions", function () {
    it("owner can update rate limit", async function () {
      await vault.setRateLimit(ethers.parseEther("20"), WITHDRAW_WINDOW);
      expect(await vault.rateLimitMax()).to.equal(ethers.parseEther("20"));
    });

    it("owner can update watchdog thresholds", async function () {
      await vault.setThresholds(ethers.parseEther("10"), 5, 7200);
      expect(await vault.largeTransferThreshold()).to.equal(ethers.parseEther("10"));
    });

    it("owner can manage guardians", async function () {
      await vault.addGuardian(attacker.address);
      expect(await vault.isGuardian(attacker.address)).to.be.true;
    });

    it("owner can check in (heartbeat)", async function () {
      await expect(vault.checkIn()).to.emit(vault, "HeartbeatReceived");
    });
  });

  // ─────────────────────────────────────────────
  //  End-to-end: full emergency scenario
  // ─────────────────────────────────────────────

  describe("End-to-end: emergency scenario", function () {
    it("owner inactive → switch activates → recovery takes over → withdraws", async function () {
      // 1. Owner does some withdrawals (rate limited + watchdog)
      await vault.withdraw(recovery.address, ethers.parseEther("3"));

      // 2. Owner disappears
      await time.increase(HEARTBEAT + GRACE + 1);

      // 3. Anyone activates dead man switch
      await vault.connect(attacker).activateSwitch();
      expect(await vault.paused()).to.be.true;
      expect(await vault.owner()).to.equal(recovery.address);

      // 4. Recovery unpause
      await vault.connect(recovery).unpause();

      // 5. Recovery can withdraw (rate limited)
      await vault.connect(recovery).withdraw(recovery.address, MAX_WITHDRAW);

      // 6. Rate limit still enforced for recovery
      await expect(
        vault.connect(recovery).withdraw(recovery.address, 1n)
      ).to.be.revertedWithCustomError(vault, "RateLimitExceeded");

      // 7. Wait for next window
      await time.increase(WITHDRAW_WINDOW + 1);
      await vault.connect(recovery).withdraw(recovery.address, MAX_WITHDRAW);
    });

    it("guardians emergency pause + transfer ownership during owner activity", async function () {
      // 1. Guardians detect suspicious activity, propose PAUSE
      await vault.connect(guardian1).proposeEmergency(0, ethers.ZeroAddress);
      await vault.connect(guardian2).approveEmergency(1);
      await time.increase(EMERGENCY_DELAY + 1);
      await vault.executeEmergency(1);
      expect(await vault.paused()).to.be.true;

      // 2. Guardians propose ownership transfer to recovery
      await vault.connect(guardian1).proposeEmergency(2, recovery.address);
      await vault.connect(guardian3).approveEmergency(2);
      await time.increase(EMERGENCY_DELAY + 1);
      await vault.executeEmergency(2);
      expect(await vault.owner()).to.equal(recovery.address);

      // 3. New owner (recovery) unpause and resume operations
      await vault.connect(recovery).unpause();
      await vault.connect(recovery).withdraw(recovery.address, ethers.parseEther("1"));
    });
  });
});
