/**
 * @file EnvironmentalMonitor.test.js
 * @description Tests for the Environmental Monitoring & Carbon Credits use case.
 *
 * Covers: sensor registration, multi-metric anchoring, baseline management,
 * carbon credit issuance, verification, and access control.
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("EnvironmentalMonitor", function () {
  let monitor;
  let admin, operator, other;

  beforeEach(async function () {
    [admin, operator, other] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("EnvironmentalMonitor");
    monitor = await Factory.deploy();
    await monitor.waitForDeployment();
  });

  // ─────────────────────────────────────────────
  //  Sensor Registration
  // ─────────────────────────────────────────────

  describe("Sensor Registration", function () {
    it("admin registers a sensor with zone", async function () {
      await expect(monitor.registerSensor(operator.address, "Zone A"))
        .to.emit(monitor, "SensorRegistered")
        .withArgs(0, operator.address, "Zone A");
    });

    it("mints ERC-721 token", async function () {
      await monitor.registerSensor(operator.address, "Zone A");
      expect(await monitor.ownerOf(0)).to.equal(operator.address);
    });

    it("stores zone info", async function () {
      await monitor.registerSensor(operator.address, "Zone A");
      expect(await monitor.sensorZone(0)).to.equal("Zone A");
    });

    it("only admin can register", async function () {
      await expect(
        monitor.connect(other).registerSensor(other.address, "Zone")
      ).to.be.revertedWithCustomError(monitor, "OwnableUnauthorizedAccount");
    });
  });

  // ─────────────────────────────────────────────
  //  Data Anchoring
  // ─────────────────────────────────────────────

  describe("Data Anchoring", function () {
    let dataHash;

    beforeEach(async function () {
      await monitor.registerSensor(operator.address, "Zone A");
      dataHash = ethers.keccak256(ethers.toUtf8Bytes("reading-001"));
    });

    it("sensor operator anchors a reading", async function () {
      await expect(monitor.connect(operator).anchorReading(0, 2800, 380, 60, dataHash))
        .to.emit(monitor, "ReadingAnchored");
    });

    it("stores reading data", async function () {
      await monitor.connect(operator).anchorReading(0, 2800, 380, 60, dataHash);
      const [sensorId, timestamp, pm25, co2, nox] = await monitor.getReading(dataHash);
      expect(sensorId).to.equal(0);
      expect(pm25).to.equal(2800);
      expect(co2).to.equal(380);
      expect(nox).to.equal(60);
    });

    it("increments reading count", async function () {
      await monitor.connect(operator).anchorReading(0, 2800, 380, 60, dataHash);
      expect(await monitor.sensorReadingCount(0)).to.equal(1);
    });

    it("reverts on duplicate hash", async function () {
      await monitor.connect(operator).anchorReading(0, 2800, 380, 60, dataHash);
      await expect(
        monitor.connect(operator).anchorReading(0, 2800, 380, 60, dataHash)
      ).to.be.revertedWithCustomError(monitor, "AlreadyAnchored");
    });

    it("reverts for inactive sensor", async function () {
      await monitor.connect(operator).deactivateSensor(0);
      await expect(
        monitor.connect(operator).anchorReading(0, 2800, 380, 60, dataHash)
      ).to.be.revertedWithCustomError(monitor, "SensorNotActive");
    });

    it("reverts for non-owner", async function () {
      await expect(
        monitor.connect(other).anchorReading(0, 2800, 380, 60, dataHash)
      ).to.be.revertedWithCustomError(monitor, "NotSensorOwner");
    });
  });

  // ─────────────────────────────────────────────
  //  Baseline & Carbon Credits
  // ─────────────────────────────────────────────

  describe("Carbon Credits", function () {
    beforeEach(async function () {
      await monitor.registerSensor(operator.address, "Zone A");
      await monitor.setBaseline("Zone A", 3500, 450, 80);
    });

    it("admin sets baseline", async function () {
      const baseline = await monitor.baselines("Zone A");
      expect(baseline.co2).to.equal(450);
      expect(baseline.pm25).to.equal(3500);
      expect(baseline.nox).to.equal(80);
      expect(baseline.isSet).to.be.true;
    });

    it("issues credits when CO2 reduced", async function () {
      await expect(monitor.issueCarbonCredit(0, 380, 10))
        .to.emit(monitor, "CarbonCreditIssued");

      expect(await monitor.totalCreditsIssued()).to.equal(10);
    });

    it("reverts when no reduction (CO2 >= baseline)", async function () {
      await expect(
        monitor.issueCarbonCredit(0, 450, 10)
      ).to.be.revertedWithCustomError(monitor, "NoReduction");
    });

    it("reverts when CO2 above baseline", async function () {
      await expect(
        monitor.issueCarbonCredit(0, 500, 10)
      ).to.be.revertedWithCustomError(monitor, "NoReduction");
    });

    it("reverts when no baseline set", async function () {
      await monitor.registerSensor(operator.address, "Zone B");
      await expect(
        monitor.issueCarbonCredit(1, 380, 10)
      ).to.be.revertedWithCustomError(monitor, "NoBaselineSet");
    });

    it("accumulates credits across multiple issuances", async function () {
      await monitor.issueCarbonCredit(0, 380, 10);
      await monitor.issueCarbonCredit(0, 400, 5);
      expect(await monitor.totalCreditsIssued()).to.equal(15);
    });
  });

  // ─────────────────────────────────────────────
  //  Verification
  // ─────────────────────────────────────────────

  describe("Verification", function () {
    it("isAnchored returns true for anchored reading", async function () {
      await monitor.registerSensor(operator.address, "Zone A");
      const hash = ethers.keccak256(ethers.toUtf8Bytes("check"));
      await monitor.connect(operator).anchorReading(0, 2800, 380, 60, hash);
      expect(await monitor.isAnchored(hash)).to.be.true;
    });

    it("isAnchored returns false for unknown hash", async function () {
      expect(await monitor.isAnchored(ethers.keccak256(ethers.toUtf8Bytes("x")))).to.be.false;
    });
  });
});
