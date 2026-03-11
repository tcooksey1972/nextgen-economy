/**
 * @file RateLimiter.test.js
 * @description Hardhat test suite for the RateLimiter abstract contract,
 * exercised through the RateLimitedVault example contract.
 *
 * Covers: deployment validation, rate limit enforcement, window rollover,
 * admin configuration, reset, and edge cases.
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("RateLimiter", function () {
  const MAX_AMOUNT = ethers.parseEther("10");   // 10 ETH per window
  const WINDOW = 24 * 60 * 60;                   // 24 hours

  let vault, vaultAddr;
  let owner, recipient, attacker;

  beforeEach(async function () {
    [owner, recipient, attacker] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("RateLimitedVault");
    vault = await Factory.deploy(MAX_AMOUNT, WINDOW);
    await vault.waitForDeployment();
    vaultAddr = await vault.getAddress();

    // Fund the vault with 100 ETH
    await owner.sendTransaction({ to: vaultAddr, value: ethers.parseEther("100") });
  });

  // ─────────────────────────────────────────────
  //  Deployment
  // ─────────────────────────────────────────────

  describe("Deployment", function () {
    it("sets the correct max amount", async function () {
      expect(await vault.rateLimitMax()).to.equal(MAX_AMOUNT);
    });

    it("sets the correct window duration", async function () {
      expect(await vault.rateLimitWindow()).to.equal(WINDOW);
    });

    it("initializes window start to deployment time", async function () {
      const ws = await vault.windowStart();
      expect(ws).to.be.greaterThan(0);
    });

    it("shows full remaining capacity", async function () {
      expect(await vault.currentWindowRemaining()).to.equal(MAX_AMOUNT);
    });

    it("shows zero usage", async function () {
      expect(await vault.currentWindowUsage()).to.equal(0);
    });

    it("reverts with zero max amount", async function () {
      const Factory = await ethers.getContractFactory("RateLimitedVault");
      await expect(
        Factory.deploy(0, WINDOW)
      ).to.be.revertedWithCustomError(vault, "ZeroMaxAmount");
    });

    it("reverts with zero window duration", async function () {
      const Factory = await ethers.getContractFactory("RateLimitedVault");
      await expect(
        Factory.deploy(MAX_AMOUNT, 0)
      ).to.be.revertedWithCustomError(vault, "ZeroWindowDuration");
    });
  });

  // ─────────────────────────────────────────────
  //  Rate limit enforcement
  // ─────────────────────────────────────────────

  describe("Enforcement", function () {
    it("allows withdrawal within limit", async function () {
      const amount = ethers.parseEther("5");
      await expect(vault.withdraw(recipient.address, amount))
        .to.emit(vault, "OutflowRecorded");
    });

    it("allows exact max amount", async function () {
      await expect(vault.withdraw(recipient.address, MAX_AMOUNT)).to.not.be.reverted;
    });

    it("reverts when exceeding limit in single tx", async function () {
      const excess = MAX_AMOUNT + 1n;
      await expect(
        vault.withdraw(recipient.address, excess)
      ).to.be.revertedWithCustomError(vault, "RateLimitExceeded");
    });

    it("reverts when cumulative withdrawals exceed limit", async function () {
      await vault.withdraw(recipient.address, ethers.parseEther("7"));
      await expect(
        vault.withdraw(recipient.address, ethers.parseEther("4"))
      ).to.be.revertedWithCustomError(vault, "RateLimitExceeded");
    });

    it("tracks usage correctly across multiple withdrawals", async function () {
      await vault.withdraw(recipient.address, ethers.parseEther("3"));
      expect(await vault.currentWindowUsage()).to.equal(ethers.parseEther("3"));

      await vault.withdraw(recipient.address, ethers.parseEther("2"));
      expect(await vault.currentWindowUsage()).to.equal(ethers.parseEther("5"));
      expect(await vault.currentWindowRemaining()).to.equal(ethers.parseEther("5"));
    });

    it("emits OutflowRecorded with correct values", async function () {
      const amount = ethers.parseEther("4");
      await expect(vault.withdraw(recipient.address, amount))
        .to.emit(vault, "OutflowRecorded")
        .withArgs(amount, amount, MAX_AMOUNT - amount);
    });
  });

  // ─────────────────────────────────────────────
  //  Window rollover
  // ─────────────────────────────────────────────

  describe("Window rollover", function () {
    it("resets usage after window expires", async function () {
      // Use full limit
      await vault.withdraw(recipient.address, MAX_AMOUNT);
      expect(await vault.currentWindowRemaining()).to.equal(0);

      // Advance past window
      await time.increase(WINDOW + 1);

      // Usage should report 0 (window expired)
      expect(await vault.currentWindowUsage()).to.equal(0);
      expect(await vault.currentWindowRemaining()).to.equal(MAX_AMOUNT);
    });

    it("allows full withdrawal again after window reset", async function () {
      await vault.withdraw(recipient.address, MAX_AMOUNT);
      await time.increase(WINDOW + 1);
      await expect(vault.withdraw(recipient.address, MAX_AMOUNT)).to.not.be.reverted;
    });

    it("updates windowStart on rollover", async function () {
      const oldStart = await vault.windowStart();
      await time.increase(WINDOW + 1);
      await vault.withdraw(recipient.address, ethers.parseEther("1"));
      const newStart = await vault.windowStart();
      expect(newStart).to.be.greaterThan(oldStart);
    });
  });

  // ─────────────────────────────────────────────
  //  Admin configuration
  // ─────────────────────────────────────────────

  describe("Admin", function () {
    it("allows owner to change rate limit", async function () {
      const newMax = ethers.parseEther("20");
      const newWindow = 48 * 60 * 60;
      await expect(vault.setRateLimit(newMax, newWindow))
        .to.emit(vault, "RateLimitChanged")
        .withArgs(MAX_AMOUNT, newMax, WINDOW, newWindow);

      expect(await vault.rateLimitMax()).to.equal(newMax);
      expect(await vault.rateLimitWindow()).to.equal(newWindow);
    });

    it("reverts setRateLimit with zero max", async function () {
      await expect(
        vault.setRateLimit(0, WINDOW)
      ).to.be.revertedWithCustomError(vault, "ZeroMaxAmount");
    });

    it("reverts setRateLimit with zero window", async function () {
      await expect(
        vault.setRateLimit(MAX_AMOUNT, 0)
      ).to.be.revertedWithCustomError(vault, "ZeroWindowDuration");
    });

    it("reverts setRateLimit from non-owner", async function () {
      await expect(
        vault.connect(attacker).setRateLimit(MAX_AMOUNT, WINDOW)
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });

    it("resets rate limit usage", async function () {
      await vault.withdraw(recipient.address, ethers.parseEther("8"));
      expect(await vault.currentWindowUsage()).to.equal(ethers.parseEther("8"));

      await expect(vault.resetRateLimit())
        .to.emit(vault, "RateLimitReset");

      expect(await vault.currentWindowUsage()).to.equal(0);
      expect(await vault.currentWindowRemaining()).to.equal(MAX_AMOUNT);
    });

    it("reverts resetRateLimit from non-owner", async function () {
      await expect(
        vault.connect(attacker).resetRateLimit()
      ).to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount");
    });
  });

  // ─────────────────────────────────────────────
  //  End-to-end
  // ─────────────────────────────────────────────

  describe("End-to-end: rate limiting withdrawals", function () {
    it("enforces limit across multiple windows", async function () {
      // Window 1: withdraw 10 ETH (max)
      await vault.withdraw(recipient.address, MAX_AMOUNT);
      await expect(
        vault.withdraw(recipient.address, 1n)
      ).to.be.revertedWithCustomError(vault, "RateLimitExceeded");

      // Window 2: advance and withdraw again
      await time.increase(WINDOW + 1);
      await vault.withdraw(recipient.address, ethers.parseEther("5"));
      await vault.withdraw(recipient.address, ethers.parseEther("5"));
      await expect(
        vault.withdraw(recipient.address, 1n)
      ).to.be.revertedWithCustomError(vault, "RateLimitExceeded");

      // Window 3: advance, raise limit, withdraw more
      await time.increase(WINDOW + 1);
      await vault.setRateLimit(ethers.parseEther("50"), WINDOW);
      await vault.withdraw(recipient.address, ethers.parseEther("50"));
    });
  });
});
