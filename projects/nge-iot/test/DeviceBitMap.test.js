/**
 * @file DeviceBitMap.test.js
 * @description Hardhat test suite for the DeviceBitMap abstract contract,
 * exercised through the TestDeviceBitMap harness.
 *
 * Covers: setting/reading flags, bitmap independence, toggling, large device
 * IDs, event emission, and the external hasDeviceFlag view function.
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DeviceBitMap", function () {
  const ALLOWLISTED = ethers.keccak256(ethers.toUtf8Bytes("allowlisted"));
  const PREMIUM = ethers.keccak256(ethers.toUtf8Bytes("premium"));
  const FIRMWARE_ACKED = ethers.keccak256(ethers.toUtf8Bytes("firmware-acked"));

  let bitmap;
  let owner;

  beforeEach(async function () {
    [owner] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("TestDeviceBitMap");
    bitmap = await Factory.deploy();
    await bitmap.waitForDeployment();
  });

  // ─────────────────────────────────────────────
  //  Set and read flags
  // ─────────────────────────────────────────────

  describe("Set and read flags", function () {
    it("defaults to false for unset flags", async function () {
      expect(await bitmap.getFlag(ALLOWLISTED, 0)).to.equal(false);
      expect(await bitmap.hasDeviceFlag(ALLOWLISTED, 0)).to.equal(false);
    });

    it("sets a flag to true and reads it back", async function () {
      await bitmap.setFlag(ALLOWLISTED, 0, true);
      expect(await bitmap.getFlag(ALLOWLISTED, 0)).to.equal(true);
    });

    it("sets a flag to false explicitly", async function () {
      await bitmap.setFlag(ALLOWLISTED, 0, true);
      await bitmap.setFlag(ALLOWLISTED, 0, false);
      expect(await bitmap.getFlag(ALLOWLISTED, 0)).to.equal(false);
    });
  });

  // ─────────────────────────────────────────────
  //  Multiple bitmaps are independent
  // ─────────────────────────────────────────────

  describe("Bitmap independence", function () {
    it("different bitmaps are independent", async function () {
      await bitmap.setFlag(ALLOWLISTED, 5, true);
      await bitmap.setFlag(PREMIUM, 5, false);

      expect(await bitmap.getFlag(ALLOWLISTED, 5)).to.equal(true);
      expect(await bitmap.getFlag(PREMIUM, 5)).to.equal(false);
    });

    it("setting a flag in one bitmap does not affect another", async function () {
      await bitmap.setFlag(ALLOWLISTED, 10, true);

      expect(await bitmap.getFlag(PREMIUM, 10)).to.equal(false);
      expect(await bitmap.getFlag(FIRMWARE_ACKED, 10)).to.equal(false);
    });
  });

  // ─────────────────────────────────────────────
  //  Toggle (set true then false)
  // ─────────────────────────────────────────────

  describe("Toggle flags", function () {
    it("toggles a flag from true to false", async function () {
      await bitmap.setFlag(PREMIUM, 7, true);
      expect(await bitmap.getFlag(PREMIUM, 7)).to.equal(true);

      await bitmap.setFlag(PREMIUM, 7, false);
      expect(await bitmap.getFlag(PREMIUM, 7)).to.equal(false);
    });

    it("toggles a flag from false to true to false to true", async function () {
      expect(await bitmap.getFlag(PREMIUM, 3)).to.equal(false);

      await bitmap.setFlag(PREMIUM, 3, true);
      expect(await bitmap.getFlag(PREMIUM, 3)).to.equal(true);

      await bitmap.setFlag(PREMIUM, 3, false);
      expect(await bitmap.getFlag(PREMIUM, 3)).to.equal(false);

      await bitmap.setFlag(PREMIUM, 3, true);
      expect(await bitmap.getFlag(PREMIUM, 3)).to.equal(true);
    });
  });

  // ─────────────────────────────────────────────
  //  Multiple device IDs in same bitmap
  // ─────────────────────────────────────────────

  describe("Multiple device IDs in same bitmap", function () {
    it("tracks multiple devices independently within one bitmap", async function () {
      await bitmap.setFlag(ALLOWLISTED, 0, true);
      await bitmap.setFlag(ALLOWLISTED, 1, true);
      await bitmap.setFlag(ALLOWLISTED, 2, false);
      await bitmap.setFlag(ALLOWLISTED, 3, true);

      expect(await bitmap.getFlag(ALLOWLISTED, 0)).to.equal(true);
      expect(await bitmap.getFlag(ALLOWLISTED, 1)).to.equal(true);
      expect(await bitmap.getFlag(ALLOWLISTED, 2)).to.equal(false);
      expect(await bitmap.getFlag(ALLOWLISTED, 3)).to.equal(true);
    });

    it("unsetting one device does not affect others", async function () {
      await bitmap.setFlag(ALLOWLISTED, 10, true);
      await bitmap.setFlag(ALLOWLISTED, 11, true);
      await bitmap.setFlag(ALLOWLISTED, 12, true);

      await bitmap.setFlag(ALLOWLISTED, 11, false);

      expect(await bitmap.getFlag(ALLOWLISTED, 10)).to.equal(true);
      expect(await bitmap.getFlag(ALLOWLISTED, 11)).to.equal(false);
      expect(await bitmap.getFlag(ALLOWLISTED, 12)).to.equal(true);
    });
  });

  // ─────────────────────────────────────────────
  //  Large device IDs (256+)
  // ─────────────────────────────────────────────

  describe("Large device IDs", function () {
    it("works with device ID 256 (second storage slot)", async function () {
      await bitmap.setFlag(ALLOWLISTED, 256, true);
      expect(await bitmap.getFlag(ALLOWLISTED, 256)).to.equal(true);
      // Ensure slot 0 device is unaffected
      expect(await bitmap.getFlag(ALLOWLISTED, 0)).to.equal(false);
    });

    it("works with device ID 1000", async function () {
      await bitmap.setFlag(PREMIUM, 1000, true);
      expect(await bitmap.getFlag(PREMIUM, 1000)).to.equal(true);
    });

    it("works with very large device ID", async function () {
      const largeId = 100000;
      await bitmap.setFlag(FIRMWARE_ACKED, largeId, true);
      expect(await bitmap.getFlag(FIRMWARE_ACKED, largeId)).to.equal(true);
    });

    it("adjacent device IDs across slot boundary are independent", async function () {
      // Device 255 is last bit in first slot, 256 is first bit in second slot
      await bitmap.setFlag(ALLOWLISTED, 255, true);
      await bitmap.setFlag(ALLOWLISTED, 256, true);

      expect(await bitmap.getFlag(ALLOWLISTED, 255)).to.equal(true);
      expect(await bitmap.getFlag(ALLOWLISTED, 256)).to.equal(true);
      expect(await bitmap.getFlag(ALLOWLISTED, 254)).to.equal(false);
      expect(await bitmap.getFlag(ALLOWLISTED, 257)).to.equal(false);
    });
  });

  // ─────────────────────────────────────────────
  //  Event emission
  // ─────────────────────────────────────────────

  describe("Event emission", function () {
    it("emits DeviceFlagSet when setting to true", async function () {
      await expect(bitmap.setFlag(ALLOWLISTED, 5, true))
        .to.emit(bitmap, "DeviceFlagSet")
        .withArgs(ALLOWLISTED, 5, true);
    });

    it("emits DeviceFlagSet when setting to false", async function () {
      await bitmap.setFlag(ALLOWLISTED, 5, true);

      await expect(bitmap.setFlag(ALLOWLISTED, 5, false))
        .to.emit(bitmap, "DeviceFlagSet")
        .withArgs(ALLOWLISTED, 5, false);
    });

    it("emits event with correct bitmap and deviceId", async function () {
      await expect(bitmap.setFlag(PREMIUM, 42, true))
        .to.emit(bitmap, "DeviceFlagSet")
        .withArgs(PREMIUM, 42, true);
    });
  });

  // ─────────────────────────────────────────────
  //  hasDeviceFlag external view
  // ─────────────────────────────────────────────

  describe("hasDeviceFlag external view", function () {
    it("returns the same value as internal getFlag", async function () {
      await bitmap.setFlag(PREMIUM, 99, true);

      expect(await bitmap.hasDeviceFlag(PREMIUM, 99)).to.equal(true);
      expect(await bitmap.getFlag(PREMIUM, 99)).to.equal(true);

      expect(await bitmap.hasDeviceFlag(PREMIUM, 100)).to.equal(false);
      expect(await bitmap.getFlag(PREMIUM, 100)).to.equal(false);
    });

    it("returns false for unset flags", async function () {
      expect(await bitmap.hasDeviceFlag(ALLOWLISTED, 0)).to.equal(false);
    });

    it("reflects flag changes immediately", async function () {
      expect(await bitmap.hasDeviceFlag(ALLOWLISTED, 1)).to.equal(false);

      await bitmap.setFlag(ALLOWLISTED, 1, true);
      expect(await bitmap.hasDeviceFlag(ALLOWLISTED, 1)).to.equal(true);

      await bitmap.setFlag(ALLOWLISTED, 1, false);
      expect(await bitmap.hasDeviceFlag(ALLOWLISTED, 1)).to.equal(false);
    });
  });
});
