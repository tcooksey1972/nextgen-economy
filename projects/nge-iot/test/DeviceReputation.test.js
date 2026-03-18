/**
 * @file DeviceReputation.test.js
 * @description Hardhat test suite for the DeviceReputation abstract contract,
 * exercised through the TestDeviceReputation harness.
 *
 * Covers: setting/reading reputation, MAX_REPUTATION enforcement, historical
 * lookups via checkpoints, independent device reputations, and event emission.
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("DeviceReputation", function () {
  let rep;
  let owner;

  beforeEach(async function () {
    [owner] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("TestDeviceReputation");
    rep = await Factory.deploy();
    await rep.waitForDeployment();
  });

  // ─────────────────────────────────────────────
  //  Basics
  // ─────────────────────────────────────────────

  describe("Setting and reading reputation", function () {
    it("returns 0 for a device with no reputation set", async function () {
      expect(await rep.reputation(0)).to.equal(0);
    });

    it("sets and reads reputation for a device", async function () {
      await rep.updateReputation(0, 5000);
      expect(await rep.reputation(0)).to.equal(5000);
    });

    it("updates reputation to a new value", async function () {
      await rep.updateReputation(0, 3000);
      await rep.updateReputation(0, 7500);
      expect(await rep.reputation(0)).to.equal(7500);
    });

    it("allows setting reputation to 0", async function () {
      await rep.updateReputation(0, 5000);
      await rep.updateReputation(0, 0);
      expect(await rep.reputation(0)).to.equal(0);
    });

    it("allows setting reputation to MAX_REPUTATION (10000)", async function () {
      await rep.updateReputation(0, 10000);
      expect(await rep.reputation(0)).to.equal(10000);
    });
  });

  // ─────────────────────────────────────────────
  //  MAX_REPUTATION constant
  // ─────────────────────────────────────────────

  describe("MAX_REPUTATION", function () {
    it("MAX_REPUTATION is 10000", async function () {
      expect(await rep.MAX_REPUTATION()).to.equal(10000);
    });

    it("reverts with ReputationScoreOutOfRange for score > 10000", async function () {
      await expect(rep.updateReputation(0, 10001))
        .to.be.revertedWithCustomError(rep, "ReputationScoreOutOfRange")
        .withArgs(10001, 10000);
    });

    it("reverts with ReputationScoreOutOfRange for very large score", async function () {
      // uint208 max is huge, but anything > 10000 should revert
      await expect(rep.updateReputation(0, 99999))
        .to.be.revertedWithCustomError(rep, "ReputationScoreOutOfRange")
        .withArgs(99999, 10000);
    });
  });

  // ─────────────────────────────────────────────
  //  Historical lookups (checkpoints)
  // ─────────────────────────────────────────────

  describe("Historical lookup with reputationAt", function () {
    it("returns correct reputation at a past timestamp", async function () {
      await rep.updateReputation(0, 3000);
      const t1 = await time.latest();

      await time.increase(100);

      await rep.updateReputation(0, 8000);
      const t2 = await time.latest();

      // At t1 the reputation was 3000
      expect(await rep.reputationAt(0, t1)).to.equal(3000);
      // At t2 the reputation is 8000
      expect(await rep.reputationAt(0, t2)).to.equal(8000);
      // Current reputation is 8000
      expect(await rep.reputation(0)).to.equal(8000);
    });

    it("returns 0 for timestamps before any checkpoint", async function () {
      const earlyTime = await time.latest();

      await time.increase(100);
      await rep.updateReputation(0, 5000);

      expect(await rep.reputationAt(0, earlyTime)).to.equal(0);
    });

    it("multiple updates create checkpoints with correct history", async function () {
      const scores = [1000, 2000, 5000, 9000];
      const timestamps = [];

      for (const score of scores) {
        await time.increase(100);
        await rep.updateReputation(0, score);
        timestamps.push(await time.latest());
      }

      // Verify each checkpoint
      for (let i = 0; i < scores.length; i++) {
        expect(await rep.reputationAt(0, timestamps[i])).to.equal(scores[i]);
      }
    });
  });

  // ─────────────────────────────────────────────
  //  Independent device reputations
  // ─────────────────────────────────────────────

  describe("Independent device reputations", function () {
    it("different devices have independent reputations", async function () {
      await rep.updateReputation(0, 1000);
      await rep.updateReputation(1, 5000);
      await rep.updateReputation(2, 9999);

      expect(await rep.reputation(0)).to.equal(1000);
      expect(await rep.reputation(1)).to.equal(5000);
      expect(await rep.reputation(2)).to.equal(9999);
    });

    it("updating one device does not affect another", async function () {
      await rep.updateReputation(0, 3000);
      await rep.updateReputation(1, 7000);

      await rep.updateReputation(0, 6000);

      expect(await rep.reputation(0)).to.equal(6000);
      expect(await rep.reputation(1)).to.equal(7000);
    });
  });

  // ─────────────────────────────────────────────
  //  Event emission
  // ─────────────────────────────────────────────

  describe("Event emission", function () {
    it("emits ReputationUpdated with correct old and new scores", async function () {
      // First update: old=0, new=5000
      await expect(rep.updateReputation(0, 5000))
        .to.emit(rep, "ReputationUpdated")
        .withArgs(0, 0, 5000);

      // Second update: old=5000, new=8000
      await expect(rep.updateReputation(0, 8000))
        .to.emit(rep, "ReputationUpdated")
        .withArgs(0, 5000, 8000);
    });

    it("emits ReputationUpdated with indexed deviceId", async function () {
      await expect(rep.updateReputation(42, 1234))
        .to.emit(rep, "ReputationUpdated")
        .withArgs(42, 0, 1234);
    });
  });
});
