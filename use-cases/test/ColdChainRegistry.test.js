/**
 * @file ColdChainRegistry.test.js
 * @description Tests for the Cold Chain Compliance use case.
 *
 * Covers: sensor registration, temperature anchoring, compliance checks,
 * batch anchoring, verification, firmware updates, and access control.
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ColdChainRegistry", function () {
  let registry, registryAddr;
  let admin, sensorOwner, other;
  let fwHash;

  beforeEach(async function () {
    [admin, sensorOwner, other] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("ColdChainRegistry");
    registry = await Factory.deploy();
    await registry.waitForDeployment();
    registryAddr = await registry.getAddress();
    fwHash = ethers.keccak256(ethers.toUtf8Bytes("firmware-v1.0"));
  });

  // ─────────────────────────────────────────────
  //  Sensor Registration
  // ─────────────────────────────────────────────

  describe("Sensor Registration", function () {
    it("admin registers a sensor", async function () {
      await expect(registry.registerSensor(sensorOwner.address, fwHash, "https://api.example.com/0"))
        .to.emit(registry, "SensorRegistered")
        .withArgs(0, sensorOwner.address, fwHash);
    });

    it("mints ERC-721 token to sensor owner", async function () {
      await registry.registerSensor(sensorOwner.address, fwHash, "https://api.example.com/0");
      expect(await registry.ownerOf(0)).to.equal(sensorOwner.address);
      expect(await registry.balanceOf(sensorOwner.address)).to.equal(1);
    });

    it("sets sensor as active", async function () {
      await registry.registerSensor(sensorOwner.address, fwHash, "https://api.example.com/0");
      expect(await registry.sensorStatus(0)).to.equal(1); // Active
    });

    it("stores firmware hash", async function () {
      await registry.registerSensor(sensorOwner.address, fwHash, "https://api.example.com/0");
      expect(await registry.firmwareHash(0)).to.equal(fwHash);
    });

    it("stores token URI", async function () {
      await registry.registerSensor(sensorOwner.address, fwHash, "https://api.example.com/0");
      expect(await registry.tokenURI(0)).to.equal("https://api.example.com/0");
    });

    it("increments sensor IDs", async function () {
      await registry.registerSensor(sensorOwner.address, fwHash, "uri1");
      await registry.registerSensor(other.address, fwHash, "uri2");
      expect(await registry.sensorCount()).to.equal(2);
    });

    it("reverts with zero firmware hash", async function () {
      await expect(
        registry.registerSensor(sensorOwner.address, ethers.ZeroHash, "uri")
      ).to.be.revertedWithCustomError(registry, "InvalidFirmwareHash");
    });

    it("only admin can register", async function () {
      await expect(
        registry.connect(other).registerSensor(other.address, fwHash, "uri")
      ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    });
  });

  // ─────────────────────────────────────────────
  //  Temperature Anchoring
  // ─────────────────────────────────────────────

  describe("Temperature Anchoring", function () {
    let dataHash;

    beforeEach(async function () {
      await registry.registerSensor(sensorOwner.address, fwHash, "uri");
      dataHash = ethers.keccak256(ethers.toUtf8Bytes("reading-001"));
    });

    it("sensor owner anchors a reading", async function () {
      await expect(registry.connect(sensorOwner).anchorTemperature(0, 450, dataHash))
        .to.emit(registry, "TemperatureAnchored");
    });

    it("stores anchor data", async function () {
      await registry.connect(sensorOwner).anchorTemperature(0, 450, dataHash);
      const [sensorId, timestamp, blockNumber, temp] = await registry.getAnchor(dataHash);
      expect(sensorId).to.equal(0);
      expect(temp).to.equal(450);
      expect(timestamp).to.be.greaterThan(0);
    });

    it("increments anchor count", async function () {
      await registry.connect(sensorOwner).anchorTemperature(0, 450, dataHash);
      expect(await registry.sensorAnchorCount(0)).to.equal(1);
    });

    it("reverts on duplicate hash", async function () {
      await registry.connect(sensorOwner).anchorTemperature(0, 450, dataHash);
      await expect(
        registry.connect(sensorOwner).anchorTemperature(0, 450, dataHash)
      ).to.be.revertedWithCustomError(registry, "AlreadyAnchored");
    });

    it("reverts for inactive sensor", async function () {
      await registry.connect(sensorOwner).deactivateSensor(0);
      await expect(
        registry.connect(sensorOwner).anchorTemperature(0, 450, dataHash)
      ).to.be.revertedWithCustomError(registry, "SensorNotActive");
    });

    it("reverts for non-owner of sensor", async function () {
      await expect(
        registry.connect(other).anchorTemperature(0, 450, dataHash)
      ).to.be.revertedWithCustomError(registry, "NotSensorOwner");
    });
  });

  // ─────────────────────────────────────────────
  //  Compliance Checks
  // ─────────────────────────────────────────────

  describe("Compliance Checks", function () {
    beforeEach(async function () {
      await registry.registerSensor(sensorOwner.address, fwHash, "uri");
    });

    it("compliant reading (4.50°C) — no violation", async function () {
      const hash = ethers.keccak256(ethers.toUtf8Bytes("compliant"));
      await expect(registry.connect(sensorOwner).anchorTemperature(0, 450, hash))
        .to.not.emit(registry, "ComplianceViolation");
    });

    it("below minimum (1.50°C) — violation", async function () {
      const hash = ethers.keccak256(ethers.toUtf8Bytes("too-cold"));
      await expect(registry.connect(sensorOwner).anchorTemperature(0, 150, hash))
        .to.emit(registry, "ComplianceViolation")
        .withArgs(0, 150, "Below minimum temperature");
    });

    it("above maximum (9.00°C) — violation", async function () {
      const hash = ethers.keccak256(ethers.toUtf8Bytes("too-hot"));
      await expect(registry.connect(sensorOwner).anchorTemperature(0, 900, hash))
        .to.emit(registry, "ComplianceViolation")
        .withArgs(0, 900, "Above maximum temperature");
    });

    it("boundary: exactly min (2.00°C) — compliant", async function () {
      const hash = ethers.keccak256(ethers.toUtf8Bytes("boundary-min"));
      await expect(registry.connect(sensorOwner).anchorTemperature(0, 200, hash))
        .to.not.emit(registry, "ComplianceViolation");
    });

    it("boundary: exactly max (8.00°C) — compliant", async function () {
      const hash = ethers.keccak256(ethers.toUtf8Bytes("boundary-max"));
      await expect(registry.connect(sensorOwner).anchorTemperature(0, 800, hash))
        .to.not.emit(registry, "ComplianceViolation");
    });

    it("admin can change compliance range", async function () {
      await registry.setComplianceRange(100, 1000);
      expect(await registry.minTemp()).to.equal(100);
      expect(await registry.maxTemp()).to.equal(1000);
    });
  });

  // ─────────────────────────────────────────────
  //  Batch Anchoring
  // ─────────────────────────────────────────────

  describe("Batch Anchoring", function () {
    beforeEach(async function () {
      await registry.registerSensor(sensorOwner.address, fwHash, "uri");
    });

    it("anchors a batch of hashes", async function () {
      const hashes = [
        ethers.keccak256(ethers.toUtf8Bytes("batch-1")),
        ethers.keccak256(ethers.toUtf8Bytes("batch-2")),
        ethers.keccak256(ethers.toUtf8Bytes("batch-3")),
      ];
      await expect(registry.connect(sensorOwner).anchorBatch(0, hashes))
        .to.emit(registry, "BatchAnchored");
    });

    it("increments anchor count by batch size", async function () {
      const hashes = [
        ethers.keccak256(ethers.toUtf8Bytes("b1")),
        ethers.keccak256(ethers.toUtf8Bytes("b2")),
      ];
      await registry.connect(sensorOwner).anchorBatch(0, hashes);
      expect(await registry.sensorAnchorCount(0)).to.equal(2);
    });

    it("reverts on empty batch", async function () {
      await expect(
        registry.connect(sensorOwner).anchorBatch(0, [])
      ).to.be.revertedWithCustomError(registry, "EmptyBatch");
    });
  });

  // ─────────────────────────────────────────────
  //  Verification
  // ─────────────────────────────────────────────

  describe("Verification", function () {
    it("isAnchored returns true for anchored reading", async function () {
      await registry.registerSensor(sensorOwner.address, fwHash, "uri");
      const hash = ethers.keccak256(ethers.toUtf8Bytes("verify-me"));
      await registry.connect(sensorOwner).anchorTemperature(0, 450, hash);
      expect(await registry.isAnchored(hash)).to.be.true;
    });

    it("isAnchored returns false for unknown hash", async function () {
      const hash = ethers.keccak256(ethers.toUtf8Bytes("unknown"));
      expect(await registry.isAnchored(hash)).to.be.false;
    });
  });

  // ─────────────────────────────────────────────
  //  Firmware
  // ─────────────────────────────────────────────

  describe("Firmware", function () {
    it("admin can update firmware hash", async function () {
      await registry.registerSensor(sensorOwner.address, fwHash, "uri");
      const newHash = ethers.keccak256(ethers.toUtf8Bytes("firmware-v2.0"));
      await expect(registry.updateFirmware(0, newHash))
        .to.emit(registry, "FirmwareUpdated")
        .withArgs(0, fwHash, newHash);
      expect(await registry.firmwareHash(0)).to.equal(newHash);
    });

    it("reverts with zero firmware hash", async function () {
      await registry.registerSensor(sensorOwner.address, fwHash, "uri");
      await expect(
        registry.updateFirmware(0, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(registry, "InvalidFirmwareHash");
    });
  });

  // Helper
  async function getBlockTimestamp() {
    const block = await ethers.provider.getBlock("latest");
    return block.timestamp;
  }
});
