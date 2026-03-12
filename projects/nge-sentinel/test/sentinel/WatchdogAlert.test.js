/**
 * @file WatchdogAlert.test.js
 * @description Hardhat test suite for the WatchdogAlert abstract contract,
 * exercised through the WatchdogVault example contract.
 *
 * Covers: deployment validation, large transfer detection, rapid activity
 * detection, threshold configuration, and edge cases.
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("WatchdogAlert", function () {
  const LARGE_THRESHOLD = ethers.parseEther("5");  // 5 ETH triggers alert
  const RAPID_COUNT = 3;                             // 3 transfers triggers alert
  const RAPID_WINDOW = 3600;                         // 1 hour window

  let vault, vaultAddr;
  let owner, recipient, attacker;

  beforeEach(async function () {
    [owner, recipient, attacker] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("WatchdogVault");
    vault = await Factory.deploy(LARGE_THRESHOLD, RAPID_COUNT, RAPID_WINDOW);
    await vault.waitForDeployment();
    vaultAddr = await vault.getAddress();

    // Fund the vault
    await owner.sendTransaction({ to: vaultAddr, value: ethers.parseEther("100") });
  });

  // ─────────────────────────────────────────────
  //  Deployment
  // ─────────────────────────────────────────────

  describe("Deployment", function () {
    it("sets the large transfer threshold", async function () {
      expect(await vault.largeTransferThreshold()).to.equal(LARGE_THRESHOLD);
    });

    it("sets the rapid activity threshold", async function () {
      expect(await vault.rapidActivityThreshold()).to.equal(RAPID_COUNT);
    });

    it("sets the rapid activity window", async function () {
      expect(await vault.rapidActivityWindow()).to.equal(RAPID_WINDOW);
    });

    it("reverts with zero large transfer threshold", async function () {
      const Factory = await ethers.getContractFactory("WatchdogVault");
      await expect(
        Factory.deploy(0, RAPID_COUNT, RAPID_WINDOW)
      ).to.be.revertedWithCustomError(vault, "WatchdogInvalidThreshold");
    });

    it("reverts with zero rapid activity threshold", async function () {
      const Factory = await ethers.getContractFactory("WatchdogVault");
      await expect(
        Factory.deploy(LARGE_THRESHOLD, 0, RAPID_WINDOW)
      ).to.be.revertedWithCustomError(vault, "WatchdogInvalidThreshold");
    });

    it("reverts with zero rapid activity window", async function () {
      const Factory = await ethers.getContractFactory("WatchdogVault");
      await expect(
        Factory.deploy(LARGE_THRESHOLD, RAPID_COUNT, 0)
      ).to.be.revertedWithCustomError(vault, "WatchdogInvalidThreshold");
    });
  });

  // ─────────────────────────────────────────────
  //  Large transfer detection
  // ─────────────────────────────────────────────

  describe("Large transfer detection", function () {
    it("emits CRITICAL alert for large transfer", async function () {
      const amount = ethers.parseEther("5");
      await expect(vault.withdraw(recipient.address, amount))
        .to.emit(vault, "WatchdogAlerted")
        .withArgs(2, "Large transfer detected", vaultAddr, recipient.address, amount);
      // Severity.CRITICAL = 2
    });

    it("emits alert for transfer exceeding threshold", async function () {
      const amount = ethers.parseEther("10");
      await expect(vault.withdraw(recipient.address, amount))
        .to.emit(vault, "WatchdogAlerted");
    });

    it("does not emit alert for transfer below threshold", async function () {
      const amount = ethers.parseEther("4");
      // Should NOT emit a CRITICAL WatchdogAlerted for large transfer
      // (may emit WARNING for rapid activity if count is hit)
      const tx = await vault.withdraw(recipient.address, amount);
      const receipt = await tx.wait();
      const alertEvents = receipt.logs.filter(log => {
        try {
          const parsed = vault.interface.parseLog(log);
          return parsed.name === "WatchdogAlerted" && parsed.args.reason === "Large transfer detected";
        } catch { return false; }
      });
      expect(alertEvents.length).to.equal(0);
    });
  });

  // ─────────────────────────────────────────────
  //  Rapid activity detection
  // ─────────────────────────────────────────────

  describe("Rapid activity detection", function () {
    it("emits WARNING alert when rapid activity threshold is reached", async function () {
      const small = ethers.parseEther("1");
      await vault.withdraw(recipient.address, small);
      await vault.withdraw(recipient.address, small);

      // 3rd transfer should trigger rapid activity alert
      await expect(vault.withdraw(recipient.address, small))
        .to.emit(vault, "WatchdogAlerted")
        .withArgs(1, "Rapid activity detected", vaultAddr, recipient.address, small);
      // Severity.WARNING = 1
    });

    it("tracks activity count correctly", async function () {
      const small = ethers.parseEther("1");
      await vault.withdraw(recipient.address, small);
      expect(await vault.activityCount(vaultAddr)).to.equal(1);

      await vault.withdraw(recipient.address, small);
      expect(await vault.activityCount(vaultAddr)).to.equal(2);
    });

    it("resets activity count after window expires", async function () {
      const small = ethers.parseEther("1");
      await vault.withdraw(recipient.address, small);
      await vault.withdraw(recipient.address, small);
      expect(await vault.activityCount(vaultAddr)).to.equal(2);

      // Advance past window
      await time.increase(RAPID_WINDOW + 1);
      expect(await vault.activityCount(vaultAddr)).to.equal(0);
    });

    it("does not alert below rapid activity threshold", async function () {
      const small = ethers.parseEther("1");
      const tx = await vault.withdraw(recipient.address, small);
      const receipt = await tx.wait();
      const alertEvents = receipt.logs.filter(log => {
        try {
          const parsed = vault.interface.parseLog(log);
          return parsed.name === "WatchdogAlerted" && parsed.args.reason === "Rapid activity detected";
        } catch { return false; }
      });
      expect(alertEvents.length).to.equal(0);
    });

    it("continues alerting after threshold is met", async function () {
      const small = ethers.parseEther("1");
      await vault.withdraw(recipient.address, small);
      await vault.withdraw(recipient.address, small);
      await vault.withdraw(recipient.address, small); // triggers

      // 4th should also trigger
      await expect(vault.withdraw(recipient.address, small))
        .to.emit(vault, "WatchdogAlerted");
    });
  });

  // ─────────────────────────────────────────────
  //  Admin configuration
  // ─────────────────────────────────────────────

  describe("Admin", function () {
    it("owner can update thresholds", async function () {
      const newLarge = ethers.parseEther("20");
      await expect(vault.setThresholds(newLarge, 5, 7200))
        .to.emit(vault, "ThresholdsUpdated")
        .withArgs(newLarge, 5, 7200);

      expect(await vault.largeTransferThreshold()).to.equal(newLarge);
      expect(await vault.rapidActivityThreshold()).to.equal(5);
      expect(await vault.rapidActivityWindow()).to.equal(7200);
    });

    it("reverts setThresholds with zero values", async function () {
      await expect(
        vault.setThresholds(0, RAPID_COUNT, RAPID_WINDOW)
      ).to.be.revertedWithCustomError(vault, "WatchdogInvalidThreshold");
      await expect(
        vault.setThresholds(LARGE_THRESHOLD, 0, RAPID_WINDOW)
      ).to.be.revertedWithCustomError(vault, "WatchdogInvalidThreshold");
      await expect(
        vault.setThresholds(LARGE_THRESHOLD, RAPID_COUNT, 0)
      ).to.be.revertedWithCustomError(vault, "WatchdogInvalidThreshold");
    });

    it("reverts setThresholds from non-owner", async function () {
      await expect(
        vault.connect(attacker).setThresholds(LARGE_THRESHOLD, RAPID_COUNT, RAPID_WINDOW)
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });
  });

  // ─────────────────────────────────────────────
  //  Never reverts (monitoring-only)
  // ─────────────────────────────────────────────

  describe("Monitoring-only (never reverts)", function () {
    it("large transfer still succeeds", async function () {
      const amount = ethers.parseEther("50");
      const balanceBefore = await ethers.provider.getBalance(recipient.address);
      await vault.withdraw(recipient.address, amount);
      const balanceAfter = await ethers.provider.getBalance(recipient.address);
      expect(balanceAfter - balanceBefore).to.equal(amount);
    });

    it("rapid activity still succeeds", async function () {
      const small = ethers.parseEther("1");
      for (let i = 0; i < 5; i++) {
        await vault.withdraw(recipient.address, small);
      }
      // All 5 went through despite alerts
      const balanceChange = ethers.parseEther("5");
      const vaultBalance = await ethers.provider.getBalance(vaultAddr);
      expect(vaultBalance).to.equal(ethers.parseEther("95"));
    });
  });
});
