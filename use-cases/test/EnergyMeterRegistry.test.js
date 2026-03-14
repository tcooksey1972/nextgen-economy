/**
 * @file EnergyMeterRegistry.test.js
 * @description Tests for the Smart Grid Energy Metering use case.
 *
 * Covers: meter registration, reading anchoring, settlement records,
 * verification, deactivation, and access control.
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("EnergyMeterRegistry", function () {
  let registry;
  let admin, homeowner, other;
  let fwHash;

  beforeEach(async function () {
    [admin, homeowner, other] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("EnergyMeterRegistry");
    registry = await Factory.deploy();
    await registry.waitForDeployment();
    fwHash = ethers.keccak256(ethers.toUtf8Bytes("smartmeter-fw-2.0"));
  });

  // ─────────────────────────────────────────────
  //  Meter Registration
  // ─────────────────────────────────────────────

  describe("Meter Registration", function () {
    it("admin registers a meter", async function () {
      await expect(registry.registerMeter(homeowner.address, fwHash))
        .to.emit(registry, "MeterRegistered")
        .withArgs(0, homeowner.address, fwHash);
    });

    it("mints ERC-721 token to homeowner", async function () {
      await registry.registerMeter(homeowner.address, fwHash);
      expect(await registry.ownerOf(0)).to.equal(homeowner.address);
    });

    it("sets meter as active", async function () {
      await registry.registerMeter(homeowner.address, fwHash);
      expect(await registry.meterStatus(0)).to.equal(1); // Active
    });

    it("increments meter IDs", async function () {
      await registry.registerMeter(homeowner.address, fwHash);
      await registry.registerMeter(other.address, fwHash);
      expect(await registry.meterCount()).to.equal(2);
    });

    it("only admin can register", async function () {
      await expect(
        registry.connect(other).registerMeter(other.address, fwHash)
      ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    });
  });

  // ─────────────────────────────────────────────
  //  Reading Anchoring
  // ─────────────────────────────────────────────

  describe("Reading Anchoring", function () {
    let dataHash;

    beforeEach(async function () {
      await registry.registerMeter(homeowner.address, fwHash);
      dataHash = ethers.keccak256(ethers.toUtf8Bytes("2024-01-15T12:00:00Z|prod:5200|cons:3100"));
    });

    it("homeowner anchors a reading", async function () {
      await expect(registry.connect(homeowner).anchorReading(0, 5200, 3100, dataHash))
        .to.emit(registry, "ReadingAnchored");
    });

    it("stores reading data", async function () {
      await registry.connect(homeowner).anchorReading(0, 5200, 3100, dataHash);
      const [meterId, timestamp, prodWh, consWh] = await registry.getReading(dataHash);
      expect(meterId).to.equal(0);
      expect(prodWh).to.equal(5200);
      expect(consWh).to.equal(3100);
      expect(timestamp).to.be.greaterThan(0);
    });

    it("increments reading count", async function () {
      await registry.connect(homeowner).anchorReading(0, 5200, 3100, dataHash);
      expect(await registry.meterReadingCount(0)).to.equal(1);
    });

    it("reverts on duplicate hash", async function () {
      await registry.connect(homeowner).anchorReading(0, 5200, 3100, dataHash);
      await expect(
        registry.connect(homeowner).anchorReading(0, 5200, 3100, dataHash)
      ).to.be.revertedWithCustomError(registry, "AlreadyAnchored");
    });

    it("reverts for inactive meter", async function () {
      await registry.connect(homeowner).deactivateMeter(0);
      await expect(
        registry.connect(homeowner).anchorReading(0, 5200, 3100, dataHash)
      ).to.be.revertedWithCustomError(registry, "MeterNotActive");
    });

    it("reverts for non-owner of meter", async function () {
      await expect(
        registry.connect(other).anchorReading(0, 5200, 3100, dataHash)
      ).to.be.revertedWithCustomError(registry, "NotMeterOwner");
    });
  });

  // ─────────────────────────────────────────────
  //  Settlement
  // ─────────────────────────────────────────────

  describe("Settlement", function () {
    it("admin records settlement", async function () {
      await registry.registerMeter(homeowner.address, fwHash);
      const periodStart = 1705276800;
      const periodEnd = 1707955200;

      await expect(registry.recordSettlement(0, periodStart, periodEnd, 156000, 93000, 720))
        .to.emit(registry, "SettlementPeriodRecorded");
    });

    it("calculates net energy correctly (net producer)", async function () {
      await registry.registerMeter(homeowner.address, fwHash);
      await registry.recordSettlement(0, 1000, 2000, 156000, 93000, 720);
      const [net, prod, cons] = await registry.getSettlement(0, 1000);
      expect(net).to.equal(63000); // 156000 - 93000
      expect(prod).to.equal(156000);
      expect(cons).to.equal(93000);
    });

    it("calculates net energy correctly (net consumer)", async function () {
      await registry.registerMeter(homeowner.address, fwHash);
      await registry.recordSettlement(0, 1000, 2000, 50000, 120000, 720);
      const [net] = await registry.getSettlement(0, 1000);
      expect(net).to.equal(-70000); // 50000 - 120000
    });
  });

  // ─────────────────────────────────────────────
  //  Verification
  // ─────────────────────────────────────────────

  describe("Verification", function () {
    it("isAnchored returns true for anchored reading", async function () {
      await registry.registerMeter(homeowner.address, fwHash);
      const hash = ethers.keccak256(ethers.toUtf8Bytes("verify"));
      await registry.connect(homeowner).anchorReading(0, 1000, 500, hash);
      expect(await registry.isAnchored(hash)).to.be.true;
    });

    it("isAnchored returns false for unknown hash", async function () {
      const hash = ethers.keccak256(ethers.toUtf8Bytes("unknown"));
      expect(await registry.isAnchored(hash)).to.be.false;
    });
  });

  // ─────────────────────────────────────────────
  //  Meter Management
  // ─────────────────────────────────────────────

  describe("Meter Management", function () {
    it("homeowner can deactivate own meter", async function () {
      await registry.registerMeter(homeowner.address, fwHash);
      await expect(registry.connect(homeowner).deactivateMeter(0))
        .to.emit(registry, "MeterDeactivated");
    });

    it("admin can suspend meter", async function () {
      await registry.registerMeter(homeowner.address, fwHash);
      await registry.suspendMeter(0);
      expect(await registry.meterStatus(0)).to.equal(2); // Suspended
    });

    it("non-owner cannot deactivate meter", async function () {
      await registry.registerMeter(homeowner.address, fwHash);
      await expect(
        registry.connect(other).deactivateMeter(0)
      ).to.be.reverted;
    });
  });
});
