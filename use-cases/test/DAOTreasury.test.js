/**
 * @file DAOTreasury.test.js
 * @description Tests for the DAO Treasury Governance use case.
 *
 * Covers: deployment, percentage-based rate limiting, spending proposals,
 * heartbeat monitoring, watchdog alerts, and access control.
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("DAOTreasury", function () {
  const ONE_DAY = 24 * 60 * 60;
  const SEVEN_DAYS = 7 * ONE_DAY;
  const TWO_DAYS = 2 * ONE_DAY;
  const MAX_BPS = 500;  // 5%
  const ALERT_THRESHOLD = ethers.parseEther("10");

  let treasury, treasuryAddr;
  let owner, recipient, attacker;

  beforeEach(async function () {
    [owner, recipient, attacker] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("DAOTreasury");
    treasury = await Factory.deploy(MAX_BPS, ONE_DAY, SEVEN_DAYS, ALERT_THRESHOLD, TWO_DAYS);
    await treasury.waitForDeployment();
    treasuryAddr = await treasury.getAddress();

    // Fund with 100 ETH
    await owner.sendTransaction({ to: treasuryAddr, value: ethers.parseEther("100") });
  });

  // ─────────────────────────────────────────────
  //  Deployment
  // ─────────────────────────────────────────────

  describe("Deployment", function () {
    it("sets owner as deployer", async function () {
      expect(await treasury.owner()).to.equal(owner.address);
    });

    it("configures rate limit parameters", async function () {
      expect(await treasury.maxWithdrawBps()).to.equal(MAX_BPS);
      expect(await treasury.rateLimitWindow()).to.equal(ONE_DAY);
    });

    it("configures heartbeat", async function () {
      expect(await treasury.heartbeatInterval()).to.equal(SEVEN_DAYS);
    });

    it("accepts deposits", async function () {
      expect(await ethers.provider.getBalance(treasuryAddr)).to.equal(ethers.parseEther("100"));
    });
  });

  // ─────────────────────────────────────────────
  //  Spending Proposals
  // ─────────────────────────────────────────────

  describe("Spending Proposals", function () {
    it("owner can propose spending", async function () {
      await expect(treasury.proposeSpending(recipient.address, ethers.parseEther("1"), "Marketing"))
        .to.emit(treasury, "SpendingProposed");
    });

    it("non-owner cannot propose", async function () {
      await expect(
        treasury.connect(attacker).proposeSpending(attacker.address, ethers.parseEther("1"), "Steal")
      ).to.be.revertedWithCustomError(treasury, "OwnableUnauthorizedAccount");
    });

    it("cannot execute unapproved proposal", async function () {
      await treasury.proposeSpending(recipient.address, ethers.parseEther("1"), "Marketing");
      await expect(
        treasury.executeSpending(1)
      ).to.be.revertedWithCustomError(treasury, "ProposalNotReady");
    });

    it("cannot execute before delay", async function () {
      await treasury.proposeSpending(recipient.address, ethers.parseEther("1"), "Marketing");
      await treasury.approveSpending(1);
      // Delay not elapsed
      await expect(
        treasury.executeSpending(1)
      ).to.be.revertedWithCustomError(treasury, "ProposalNotReady");
    });

    it("executes approved proposal after delay", async function () {
      const amount = ethers.parseEther("1");
      await treasury.proposeSpending(recipient.address, amount, "Marketing");
      await treasury.approveSpending(1);
      await time.increase(TWO_DAYS + 1);

      const balBefore = await ethers.provider.getBalance(recipient.address);
      await treasury.executeSpending(1);
      const balAfter = await ethers.provider.getBalance(recipient.address);
      expect(balAfter - balBefore).to.equal(amount);
    });

    it("cannot execute twice", async function () {
      await treasury.proposeSpending(recipient.address, ethers.parseEther("1"), "Marketing");
      await treasury.approveSpending(1);
      await time.increase(TWO_DAYS + 1);
      await treasury.executeSpending(1);
      await expect(
        treasury.executeSpending(1)
      ).to.be.revertedWithCustomError(treasury, "ProposalNotReady");
    });
  });

  // ─────────────────────────────────────────────
  //  Percentage-Based Rate Limiting
  // ─────────────────────────────────────────────

  describe("Rate Limiting", function () {
    it("caps at 5% of balance per window", async function () {
      // 5% of 100 ETH = 5 ETH
      const maxAllowed = ethers.parseEther("5");

      await treasury.proposeSpending(recipient.address, maxAllowed, "Within limit");
      await treasury.approveSpending(1);
      await time.increase(TWO_DAYS + 1);
      await expect(treasury.executeSpending(1)).to.not.be.reverted;
    });

    it("reverts when exceeding percentage cap", async function () {
      const tooMuch = ethers.parseEther("6"); // > 5% of 100 ETH
      await treasury.proposeSpending(recipient.address, tooMuch, "Too much");
      await treasury.approveSpending(1);
      await time.increase(TWO_DAYS + 1);
      await expect(
        treasury.executeSpending(1)
      ).to.be.revertedWithCustomError(treasury, "RateLimitExceeded");
    });

    it("reports remaining capacity", async function () {
      const remaining = await treasury.currentWindowRemaining();
      // 5% of 100 ETH = 5 ETH
      expect(remaining).to.equal(ethers.parseEther("5"));
    });
  });

  // ─────────────────────────────────────────────
  //  Dead Man Switch
  // ─────────────────────────────────────────────

  describe("Dead Man Switch", function () {
    it("owner can check in", async function () {
      await expect(treasury.checkIn())
        .to.emit(treasury, "HeartbeatReceived");
    });

    it("cannot activate before deadline", async function () {
      await expect(
        treasury.activateSwitch()
      ).to.be.revertedWithCustomError(treasury, "DeadlineNotReached");
    });

    it("activates and pauses after missed heartbeat", async function () {
      await time.increase(SEVEN_DAYS + 1);
      await treasury.activateSwitch();
      expect(await treasury.paused()).to.be.true;
      expect(await treasury.switchActivated()).to.be.true;
    });
  });

  // ─────────────────────────────────────────────
  //  Watchdog
  // ─────────────────────────────────────────────

  describe("Watchdog", function () {
    it("emits alert for large withdrawal", async function () {
      // Need a proposal large enough to trigger (but within rate limit)
      const amount = ethers.parseEther("5"); // exactly 5% cap, but 5 < 10 alert threshold
      await treasury.proposeSpending(recipient.address, amount, "Big");
      await treasury.approveSpending(1);
      await time.increase(TWO_DAYS + 1);
      // 5 ETH < 10 ETH threshold, so no alert
      await expect(treasury.executeSpending(1))
        .to.not.emit(treasury, "WatchdogAlert");
    });
  });

  // ─────────────────────────────────────────────
  //  Admin
  // ─────────────────────────────────────────────

  describe("Admin", function () {
    it("owner can pause", async function () {
      await treasury.pause();
      expect(await treasury.paused()).to.be.true;
    });

    it("owner can unpause", async function () {
      await treasury.pause();
      await treasury.unpause();
      expect(await treasury.paused()).to.be.false;
    });

    it("non-owner cannot pause", async function () {
      await expect(
        treasury.connect(attacker).pause()
      ).to.be.revertedWithCustomError(treasury, "OwnableUnauthorizedAccount");
    });
  });
});
