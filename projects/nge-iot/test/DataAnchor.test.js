/**
 * @file DataAnchor.test.js
 * @description Hardhat test suite for the DataAnchor abstract contract,
 * exercised through the AnchoredDeviceRegistry example contract.
 *
 * Covers: single anchoring, batch anchoring, verification, nonce/count
 * tracking, access control, and integration with DeviceRegistry.
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DataAnchor", function () {
  const FW_HASH = ethers.keccak256(ethers.toUtf8Bytes("firmware-v1.0"));
  const DEVICE_URI = "https://api.nextgen.economy/devices/0.json";

  // Sample data hashes (simulating sensor readings)
  const DATA_HASH_1 = ethers.keccak256(ethers.toUtf8Bytes("temperature:22.5C:1710000000"));
  const DATA_HASH_2 = ethers.keccak256(ethers.toUtf8Bytes("humidity:65%:1710000060"));
  const DATA_HASH_3 = ethers.keccak256(ethers.toUtf8Bytes("pressure:1013hPa:1710000120"));
  const ZERO_HASH = ethers.ZeroHash;

  let registry, registryAddr;
  let owner, alice, bob, attacker;

  beforeEach(async function () {
    [owner, alice, bob, attacker] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("AnchoredDeviceRegistry");
    registry = await Factory.deploy();
    await registry.waitForDeployment();
    registryAddr = await registry.getAddress();

    // Register a device owned by alice (deviceId = 0)
    await registry.registerDevice(alice.address, FW_HASH, DEVICE_URI);
  });

  // ─────────────────────────────────────────────
  //  Single anchor
  // ─────────────────────────────────────────────

  describe("Single anchor", function () {
    it("anchors a data hash successfully", async function () {
      await registry.connect(alice).anchorData(0, DATA_HASH_1);
      expect(await registry.isAnchored(DATA_HASH_1)).to.be.true;
    });

    it("emits DataAnchored event with correct params", async function () {
      const tx = await registry.connect(alice).anchorData(0, DATA_HASH_1);
      const block = await ethers.provider.getBlock(tx.blockNumber);

      await expect(tx)
        .to.emit(registry, "DataAnchored")
        .withArgs(0, DATA_HASH_1, block.timestamp, 0); // nonce = 0
    });

    it("stores the anchor record correctly", async function () {
      const tx = await registry.connect(alice).anchorData(0, DATA_HASH_1);
      const block = await ethers.provider.getBlock(tx.blockNumber);

      const [deviceId, timestamp, blockNumber] = await registry.getAnchor(DATA_HASH_1);
      expect(deviceId).to.equal(0);
      expect(timestamp).to.equal(block.timestamp);
      expect(blockNumber).to.equal(tx.blockNumber);
    });

    it("increments device nonce", async function () {
      expect(await registry.deviceNonce(0)).to.equal(0);
      await registry.connect(alice).anchorData(0, DATA_HASH_1);
      expect(await registry.deviceNonce(0)).to.equal(1);
      await registry.connect(alice).anchorData(0, DATA_HASH_2);
      expect(await registry.deviceNonce(0)).to.equal(2);
    });

    it("increments device anchor count", async function () {
      expect(await registry.deviceAnchorCount(0)).to.equal(0);
      await registry.connect(alice).anchorData(0, DATA_HASH_1);
      expect(await registry.deviceAnchorCount(0)).to.equal(1);
    });

    it("reverts with zero data hash", async function () {
      await expect(
        registry.connect(alice).anchorData(0, ZERO_HASH)
      ).to.be.revertedWithCustomError(registry, "InvalidDataHash");
    });

    it("reverts on duplicate anchor", async function () {
      await registry.connect(alice).anchorData(0, DATA_HASH_1);
      await expect(
        registry.connect(alice).anchorData(0, DATA_HASH_1)
      ).to.be.revertedWithCustomError(registry, "AlreadyAnchored");
    });
  });

  // ─────────────────────────────────────────────
  //  Batch anchor
  // ─────────────────────────────────────────────

  describe("Batch anchor", function () {
    it("anchors a batch of data hashes", async function () {
      const hashes = [DATA_HASH_1, DATA_HASH_2, DATA_HASH_3];
      await registry.connect(alice).anchorBatch(0, hashes);

      // The batch root is keccak256(abi.encodePacked(hashes))
      const batchRoot = ethers.keccak256(ethers.solidityPacked(
        ["bytes32", "bytes32", "bytes32"],
        hashes
      ));
      expect(await registry.isAnchored(batchRoot)).to.be.true;
    });

    it("emits BatchAnchored event", async function () {
      const hashes = [DATA_HASH_1, DATA_HASH_2, DATA_HASH_3];
      const batchRoot = ethers.keccak256(ethers.solidityPacked(
        ["bytes32", "bytes32", "bytes32"],
        hashes
      ));

      await expect(registry.connect(alice).anchorBatch(0, hashes))
        .to.emit(registry, "BatchAnchored")
        .withArgs(0, batchRoot, 3, await getNextTimestamp());
    });

    it("increments nonce and count for batch", async function () {
      const hashes = [DATA_HASH_1, DATA_HASH_2];
      await registry.connect(alice).anchorBatch(0, hashes);

      expect(await registry.deviceNonce(0)).to.equal(1);
      expect(await registry.deviceAnchorCount(0)).to.equal(1);
    });

    it("reverts with empty batch", async function () {
      await expect(
        registry.connect(alice).anchorBatch(0, [])
      ).to.be.revertedWithCustomError(registry, "EmptyBatch");
    });

    it("reverts on duplicate batch root", async function () {
      const hashes = [DATA_HASH_1, DATA_HASH_2];
      await registry.connect(alice).anchorBatch(0, hashes);
      await expect(
        registry.connect(alice).anchorBatch(0, hashes)
      ).to.be.revertedWithCustomError(registry, "AlreadyAnchored");
    });
  });

  // ─────────────────────────────────────────────
  //  Verification (view functions)
  // ─────────────────────────────────────────────

  describe("Verification", function () {
    it("isAnchored returns false for unknown hash", async function () {
      expect(await registry.isAnchored(DATA_HASH_1)).to.be.false;
    });

    it("getAnchor reverts for unknown hash", async function () {
      await expect(
        registry.getAnchor(DATA_HASH_1)
      ).to.be.revertedWithCustomError(registry, "AnchorNotFound");
    });

    it("deviceAnchorCount returns 0 for unknown device", async function () {
      expect(await registry.deviceAnchorCount(999)).to.equal(0);
    });

    it("deviceNonce returns 0 for unknown device", async function () {
      expect(await registry.deviceNonce(999)).to.equal(0);
    });
  });

  // ─────────────────────────────────────────────
  //  Access control — device ownership
  // ─────────────────────────────────────────────

  describe("Access control", function () {
    it("reverts when non-owner anchors data for a device", async function () {
      await expect(
        registry.connect(attacker).anchorData(0, DATA_HASH_1)
      ).to.be.revertedWithCustomError(registry, "NotDeviceOwner");
    });

    it("reverts when non-owner batch-anchors", async function () {
      await expect(
        registry.connect(attacker).anchorBatch(0, [DATA_HASH_1])
      ).to.be.revertedWithCustomError(registry, "NotDeviceOwner");
    });

    it("new owner can anchor after device transfer", async function () {
      // Transfer device from alice to bob
      await registry.connect(alice).transferFrom(alice.address, bob.address, 0);

      // Alice can no longer anchor
      await expect(
        registry.connect(alice).anchorData(0, DATA_HASH_1)
      ).to.be.revertedWithCustomError(registry, "NotDeviceOwner");

      // Bob can now anchor
      await registry.connect(bob).anchorData(0, DATA_HASH_1);
      expect(await registry.isAnchored(DATA_HASH_1)).to.be.true;
    });
  });

  // ─────────────────────────────────────────────
  //  Integration — DeviceRegistry + DataAnchor
  // ─────────────────────────────────────────────

  describe("DeviceRegistry integration", function () {
    it("reverts anchor for inactive device", async function () {
      await registry.connect(alice).deactivateDevice(0);
      await expect(
        registry.connect(alice).anchorData(0, DATA_HASH_1)
      ).to.be.revertedWithCustomError(registry, "DeviceNotActive");
    });

    it("reverts anchor for suspended device", async function () {
      await registry.suspendDevice(0);
      await expect(
        registry.connect(alice).anchorData(0, DATA_HASH_1)
      ).to.be.revertedWithCustomError(registry, "DeviceNotActive");
    });

    it("allows anchor after device reactivation", async function () {
      await registry.connect(alice).deactivateDevice(0);
      await registry.reactivateDevice(0);
      await registry.connect(alice).anchorData(0, DATA_HASH_1);
      expect(await registry.isAnchored(DATA_HASH_1)).to.be.true;
    });

    it("multiple devices can anchor independently", async function () {
      // Register second device for bob
      await registry.registerDevice(bob.address, FW_HASH, "uri-1");

      await registry.connect(alice).anchorData(0, DATA_HASH_1);
      await registry.connect(bob).anchorData(1, DATA_HASH_2);

      const [deviceId1] = await registry.getAnchor(DATA_HASH_1);
      const [deviceId2] = await registry.getAnchor(DATA_HASH_2);
      expect(deviceId1).to.equal(0);
      expect(deviceId2).to.equal(1);

      expect(await registry.deviceAnchorCount(0)).to.equal(1);
      expect(await registry.deviceAnchorCount(1)).to.equal(1);
    });
  });

  // ─────────────────────────────────────────────
  //  Helper
  // ─────────────────────────────────────────────

  async function getNextTimestamp() {
    const block = await ethers.provider.getBlock("latest");
    return block.timestamp + 1;
  }
});
