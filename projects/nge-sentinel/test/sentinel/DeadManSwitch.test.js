/**
 * @file DeadManSwitch.test.js
 * @description Hardhat test suite for the DeadManSwitch abstract contract,
 * exercised through the SentinelVault example contract.
 *
 * Covers: deployment validation, heartbeat check-in, time tracking,
 * switch activation, recovery address management, owner configuration,
 * vault deposit/withdraw, and a full end-to-end lifecycle scenario.
 *
 * Requires: `npx hardhat test` (needs internet for solc download).
 * For offline testing, use scripts/test.js instead.
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("DeadManSwitch", function () {
  // Default test parameters: 30-day heartbeat with 7-day grace period.
  // These mirror realistic production values while remaining testable
  // with Hardhat's time manipulation helpers.
  const HEARTBEAT = 30 * 24 * 60 * 60; // 30 days in seconds
  const GRACE = 7 * 24 * 60 * 60; // 7 days in seconds

  let vault;
  let owner, recovery, attacker, newRecovery;

  beforeEach(async function () {
    [owner, recovery, attacker, newRecovery] = await ethers.getSigners();
    const SentinelVault = await ethers.getContractFactory("SentinelVault");
    vault = await SentinelVault.deploy(HEARTBEAT, GRACE, recovery.address);
    await vault.waitForDeployment();
  });

  // ─────────────────────────────────────────────
  //  Deployment
  // ─────────────────────────────────────────────

  describe("Deployment", function () {
    it("sets the correct owner", async function () {
      expect(await vault.owner()).to.equal(owner.address);
    });

    it("sets heartbeat interval", async function () {
      expect(await vault.heartbeatInterval()).to.equal(HEARTBEAT);
    });

    it("sets grace period", async function () {
      expect(await vault.gracePeriod()).to.equal(GRACE);
    });

    it("sets recovery address", async function () {
      expect(await vault.recoveryAddress()).to.equal(recovery.address);
    });

    it("initializes lastCheckIn to deployment time", async function () {
      const lastCheckIn = await vault.lastCheckIn();
      expect(lastCheckIn).to.be.greaterThan(0);
    });

    it("switch is not activated", async function () {
      expect(await vault.isSwitchActivated()).to.be.false;
    });

    it("reverts with zero heartbeat interval", async function () {
      const SentinelVault = await ethers.getContractFactory("SentinelVault");
      await expect(
        SentinelVault.deploy(0, GRACE, recovery.address)
      ).to.be.revertedWithCustomError(vault, "ZeroDuration");
    });

    it("reverts with zero grace period", async function () {
      const SentinelVault = await ethers.getContractFactory("SentinelVault");
      await expect(
        SentinelVault.deploy(HEARTBEAT, 0, recovery.address)
      ).to.be.revertedWithCustomError(vault, "ZeroDuration");
    });

    it("reverts with zero recovery address", async function () {
      const SentinelVault = await ethers.getContractFactory("SentinelVault");
      await expect(
        SentinelVault.deploy(HEARTBEAT, GRACE, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(vault, "ZeroAddress");
    });
  });

  // ─────────────────────────────────────────────
  //  Check-in
  // ─────────────────────────────────────────────

  describe("checkIn", function () {
    it("resets the heartbeat timer", async function () {
      await time.increase(HEARTBEAT / 2);
      await vault.checkIn();
      const remaining = await vault.timeRemaining();
      // Should be close to full heartbeat + grace again
      expect(remaining).to.be.closeTo(HEARTBEAT + GRACE, 5);
    });

    it("emits HeartbeatReceived event", async function () {
      await expect(vault.checkIn()).to.emit(vault, "HeartbeatReceived");
    });

    it("reverts when called by non-owner", async function () {
      await expect(
        vault.connect(attacker).checkIn()
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("reverts after switch is activated", async function () {
      await time.increase(HEARTBEAT + GRACE + 1);
      await vault.connect(attacker).activateSwitch();
      await expect(
        vault.connect(recovery).checkIn()
      ).to.be.revertedWithCustomError(vault, "SwitchAlreadyActivated");
    });
  });

  // ─────────────────────────────────────────────
  //  Time tracking
  // ─────────────────────────────────────────────

  describe("timeRemaining", function () {
    it("returns full duration right after deployment", async function () {
      const remaining = await vault.timeRemaining();
      expect(remaining).to.be.closeTo(HEARTBEAT + GRACE, 5);
    });

    it("decreases over time", async function () {
      await time.increase(HEARTBEAT);
      const remaining = await vault.timeRemaining();
      expect(remaining).to.be.closeTo(GRACE, 5);
    });

    it("returns 0 after deadline passes", async function () {
      await time.increase(HEARTBEAT + GRACE + 1);
      expect(await vault.timeRemaining()).to.equal(0);
    });
  });

  // ─────────────────────────────────────────────
  //  Switch activation
  // ─────────────────────────────────────────────

  describe("activateSwitch", function () {
    it("reverts before deadline", async function () {
      await expect(
        vault.connect(attacker).activateSwitch()
      ).to.be.revertedWithCustomError(vault, "DeadlineNotReached");
    });

    it("reverts during grace period", async function () {
      await time.increase(HEARTBEAT + GRACE / 2);
      await expect(
        vault.connect(attacker).activateSwitch()
      ).to.be.revertedWithCustomError(vault, "DeadlineNotReached");
    });

    it("succeeds after deadline + grace", async function () {
      await time.increase(HEARTBEAT + GRACE + 1);
      await expect(vault.connect(attacker).activateSwitch())
        .to.emit(vault, "SwitchActivated")
        .withArgs(attacker.address, await time.latest() + 1);
    });

    it("pauses the contract", async function () {
      await time.increase(HEARTBEAT + GRACE + 1);
      await vault.connect(attacker).activateSwitch();
      expect(await vault.paused()).to.be.true;
    });

    it("transfers ownership to recovery address", async function () {
      await time.increase(HEARTBEAT + GRACE + 1);
      await vault.connect(attacker).activateSwitch();
      // Ownable2Step: recovery is pending owner, must accept
      expect(await vault.owner()).to.equal(recovery.address);
    });

    it("marks switch as activated", async function () {
      await time.increase(HEARTBEAT + GRACE + 1);
      await vault.connect(attacker).activateSwitch();
      expect(await vault.isSwitchActivated()).to.be.true;
    });

    it("cannot be activated twice", async function () {
      await time.increase(HEARTBEAT + GRACE + 1);
      await vault.connect(attacker).activateSwitch();
      await expect(
        vault.connect(attacker).activateSwitch()
      ).to.be.revertedWithCustomError(vault, "SwitchAlreadyActivated");
    });

    it("anyone can trigger it", async function () {
      await time.increase(HEARTBEAT + GRACE + 1);
      // attacker can call it — this is by design
      await expect(vault.connect(attacker).activateSwitch()).to.not.be.reverted;
    });
  });

  // ─────────────────────────────────────────────
  //  Recovery address management
  // ─────────────────────────────────────────────

  describe("Recovery address", function () {
    it("proposes a new recovery address", async function () {
      await expect(vault.proposeRecoveryAddress(newRecovery.address))
        .to.emit(vault, "RecoveryAddressProposed")
        .withArgs(recovery.address, newRecovery.address);
      expect(await vault.pendingRecoveryAddress()).to.equal(newRecovery.address);
    });

    it("reverts proposal from non-owner", async function () {
      await expect(
        vault.connect(attacker).proposeRecoveryAddress(newRecovery.address)
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("reverts proposal with zero address", async function () {
      await expect(
        vault.proposeRecoveryAddress(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(vault, "ZeroAddress");
    });

    it("accepts recovery address change", async function () {
      await vault.proposeRecoveryAddress(newRecovery.address);
      await expect(vault.connect(newRecovery).acceptRecoveryAddress())
        .to.emit(vault, "RecoveryAddressChanged")
        .withArgs(recovery.address, newRecovery.address);
      expect(await vault.recoveryAddress()).to.equal(newRecovery.address);
      expect(await vault.pendingRecoveryAddress()).to.equal(ethers.ZeroAddress);
    });

    it("reverts acceptance from wrong address", async function () {
      await vault.proposeRecoveryAddress(newRecovery.address);
      await expect(
        vault.connect(attacker).acceptRecoveryAddress()
      ).to.be.revertedWithCustomError(vault, "InvalidRecoveryAcceptance");
    });
  });

  // ─────────────────────────────────────────────
  //  Configuration changes
  // ─────────────────────────────────────────────

  describe("Configuration", function () {
    it("updates heartbeat interval and resets timer", async function () {
      const newInterval = 60 * 24 * 60 * 60; // 60 days
      await time.increase(HEARTBEAT / 2); // advance halfway

      await expect(vault.setHeartbeatInterval(newInterval))
        .to.emit(vault, "HeartbeatIntervalChanged")
        .withArgs(HEARTBEAT, newInterval);

      expect(await vault.heartbeatInterval()).to.equal(newInterval);
      // Timer should be reset
      const remaining = await vault.timeRemaining();
      expect(remaining).to.be.closeTo(newInterval + GRACE, 5);
    });

    it("updates grace period", async function () {
      const newGrace = 14 * 24 * 60 * 60; // 14 days
      await expect(vault.setGracePeriod(newGrace))
        .to.emit(vault, "GracePeriodChanged")
        .withArgs(GRACE, newGrace);
      expect(await vault.gracePeriod()).to.equal(newGrace);
    });

    it("reverts zero heartbeat interval", async function () {
      await expect(
        vault.setHeartbeatInterval(0)
      ).to.be.revertedWithCustomError(vault, "ZeroDuration");
    });

    it("reverts zero grace period", async function () {
      await expect(
        vault.setGracePeriod(0)
      ).to.be.revertedWithCustomError(vault, "ZeroDuration");
    });

    it("reverts config changes from non-owner", async function () {
      await expect(
        vault.connect(attacker).setHeartbeatInterval(1000)
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
      await expect(
        vault.connect(attacker).setGracePeriod(1000)
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });
  });

  // ─────────────────────────────────────────────
  //  Vault functionality (SentinelVault specific)
  // ─────────────────────────────────────────────

  describe("Vault", function () {
    it("accepts ETH deposits", async function () {
      await owner.sendTransaction({
        to: await vault.getAddress(),
        value: ethers.parseEther("1.0"),
      });
      const balance = await ethers.provider.getBalance(await vault.getAddress());
      expect(balance).to.equal(ethers.parseEther("1.0"));
    });

    it("allows owner to withdraw", async function () {
      const vaultAddr = await vault.getAddress();
      await owner.sendTransaction({ to: vaultAddr, value: ethers.parseEther("2.0") });

      const balanceBefore = await ethers.provider.getBalance(recovery.address);
      await vault.withdraw(recovery.address, ethers.parseEther("1.0"));
      const balanceAfter = await ethers.provider.getBalance(recovery.address);

      expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther("1.0"));
    });

    it("blocks withdrawals when paused", async function () {
      const vaultAddr = await vault.getAddress();
      await owner.sendTransaction({ to: vaultAddr, value: ethers.parseEther("1.0") });

      // Activate switch to pause
      await time.increase(HEARTBEAT + GRACE + 1);
      await vault.connect(attacker).activateSwitch();

      // Recovery is now owner but contract is paused
      await expect(
        vault.connect(recovery).withdraw(recovery.address, ethers.parseEther("1.0"))
      ).to.be.revertedWithCustomError(vault, "EnforcedPause");
    });

    it("recovery can unpause and withdraw after switch", async function () {
      const vaultAddr = await vault.getAddress();
      await owner.sendTransaction({ to: vaultAddr, value: ethers.parseEther("1.0") });

      // Activate switch
      await time.increase(HEARTBEAT + GRACE + 1);
      await vault.connect(attacker).activateSwitch();

      // Recovery unpause and withdraws
      await vault.connect(recovery).unpause();
      await vault.connect(recovery).withdraw(recovery.address, ethers.parseEther("1.0"));

      const balance = await ethers.provider.getBalance(vaultAddr);
      expect(balance).to.equal(0);
    });
  });

  // ─────────────────────────────────────────────
  //  End-to-end scenario
  // ─────────────────────────────────────────────

  describe("End-to-end: owner goes inactive", function () {
    it("full lifecycle: deposit -> miss heartbeat -> activate -> recover", async function () {
      const vaultAddr = await vault.getAddress();

      // 1. Owner deposits 5 ETH
      await owner.sendTransaction({ to: vaultAddr, value: ethers.parseEther("5.0") });

      // 2. Owner checks in a few times over 90 days
      await time.increase(25 * 24 * 60 * 60); // 25 days
      await vault.checkIn();
      await time.increase(28 * 24 * 60 * 60); // 28 more days
      await vault.checkIn();

      // 3. Owner disappears — 37 days pass (30 heartbeat + 7 grace)
      await time.increase(HEARTBEAT + GRACE + 1);

      // 4. Anyone activates the switch
      await vault.connect(attacker).activateSwitch();
      expect(await vault.paused()).to.be.true;
      expect(await vault.owner()).to.equal(recovery.address);

      // 5. Recovery address takes control
      await vault.connect(recovery).unpause();
      await vault.connect(recovery).withdraw(
        recovery.address,
        ethers.parseEther("5.0")
      );

      expect(await ethers.provider.getBalance(vaultAddr)).to.equal(0);
    });
  });
});
