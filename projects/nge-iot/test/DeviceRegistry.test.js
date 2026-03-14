/**
 * @file DeviceRegistry.test.js
 * @description Hardhat test suite for the DeviceRegistry abstract contract,
 * exercised through the SimpleDeviceRegistry example contract.
 *
 * Covers: registration, lifecycle management, firmware updates, ERC-721
 * ownership and transfers, enumeration, and access control.
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DeviceRegistry", function () {
  const FW_HASH = ethers.keccak256(ethers.toUtf8Bytes("firmware-v1.0"));
  const FW_HASH_V2 = ethers.keccak256(ethers.toUtf8Bytes("firmware-v2.0"));
  const DEVICE_URI = "https://api.nextgen.economy/devices/0.json";
  const ZERO_HASH = ethers.ZeroHash;

  let registry, registryAddr;
  let owner, alice, bob, attacker;

  beforeEach(async function () {
    [owner, alice, bob, attacker] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("SimpleDeviceRegistry");
    registry = await Factory.deploy();
    await registry.waitForDeployment();
    registryAddr = await registry.getAddress();
  });

  // ─────────────────────────────────────────────
  //  Deployment
  // ─────────────────────────────────────────────

  describe("Deployment", function () {
    it("sets the correct name and symbol", async function () {
      expect(await registry.name()).to.equal("NGE IoT Device");
      expect(await registry.symbol()).to.equal("NGED");
    });

    it("starts with zero devices", async function () {
      expect(await registry.deviceCount()).to.equal(0);
      expect(await registry.totalSupply()).to.equal(0);
    });

    it("sets deployer as owner", async function () {
      expect(await registry.owner()).to.equal(owner.address);
    });
  });

  // ─────────────────────────────────────────────
  //  Registration
  // ─────────────────────────────────────────────

  describe("Registration", function () {
    it("registers a device and mints an NFT", async function () {
      await registry.registerDevice(alice.address, FW_HASH, DEVICE_URI);

      expect(await registry.deviceCount()).to.equal(1);
      expect(await registry.ownerOf(0)).to.equal(alice.address);
      expect(await registry.balanceOf(alice.address)).to.equal(1);
    });

    it("emits DeviceRegistered event", async function () {
      await expect(registry.registerDevice(alice.address, FW_HASH, DEVICE_URI))
        .to.emit(registry, "DeviceRegistered")
        .withArgs(0, alice.address, FW_HASH);
    });

    it("sets device status to Active", async function () {
      await registry.registerDevice(alice.address, FW_HASH, DEVICE_URI);
      // DeviceStatus.Active = 1
      expect(await registry.deviceStatus(0)).to.equal(1);
      expect(await registry.isDeviceActive(0)).to.be.true;
    });

    it("stores the firmware hash", async function () {
      await registry.registerDevice(alice.address, FW_HASH, DEVICE_URI);
      expect(await registry.firmwareHash(0)).to.equal(FW_HASH);
    });

    it("stores the token URI", async function () {
      await registry.registerDevice(alice.address, FW_HASH, DEVICE_URI);
      expect(await registry.tokenURI(0)).to.equal(DEVICE_URI);
    });

    it("assigns sequential device IDs", async function () {
      await registry.registerDevice(alice.address, FW_HASH, DEVICE_URI);
      await registry.registerDevice(bob.address, FW_HASH, "uri-1");
      await registry.registerDevice(alice.address, FW_HASH, "uri-2");

      expect(await registry.deviceCount()).to.equal(3);
      expect(await registry.ownerOf(0)).to.equal(alice.address);
      expect(await registry.ownerOf(1)).to.equal(bob.address);
      expect(await registry.ownerOf(2)).to.equal(alice.address);
    });

    it("reverts with zero firmware hash", async function () {
      await expect(
        registry.registerDevice(alice.address, ZERO_HASH, DEVICE_URI)
      ).to.be.revertedWithCustomError(registry, "InvalidFirmwareHash");
    });

    it("reverts when called by non-owner", async function () {
      await expect(
        registry.connect(attacker).registerDevice(alice.address, FW_HASH, DEVICE_URI)
      ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    });
  });

  // ─────────────────────────────────────────────
  //  Lifecycle — Deactivation
  // ─────────────────────────────────────────────

  describe("Deactivation", function () {
    beforeEach(async function () {
      await registry.registerDevice(alice.address, FW_HASH, DEVICE_URI);
    });

    it("device owner can deactivate their device", async function () {
      await expect(registry.connect(alice).deactivateDevice(0))
        .to.emit(registry, "DeviceDeactivated")
        .withArgs(0);

      // DeviceStatus.Inactive = 0
      expect(await registry.deviceStatus(0)).to.equal(0);
      expect(await registry.isDeviceActive(0)).to.be.false;
    });

    it("reverts when non-owner tries to deactivate", async function () {
      await expect(
        registry.connect(attacker).deactivateDevice(0)
      ).to.be.revertedWithCustomError(registry, "NotDeviceOwner");
    });

    it("reverts when deactivating an already inactive device", async function () {
      await registry.connect(alice).deactivateDevice(0);
      await expect(
        registry.connect(alice).deactivateDevice(0)
      ).to.be.revertedWithCustomError(registry, "DeviceNotActive");
    });
  });

  // ─────────────────────────────────────────────
  //  Lifecycle — Reactivation
  // ─────────────────────────────────────────────

  describe("Reactivation", function () {
    beforeEach(async function () {
      await registry.registerDevice(alice.address, FW_HASH, DEVICE_URI);
      await registry.connect(alice).deactivateDevice(0);
    });

    it("admin can reactivate an inactive device", async function () {
      await expect(registry.reactivateDevice(0))
        .to.emit(registry, "DeviceReactivated")
        .withArgs(0);

      expect(await registry.deviceStatus(0)).to.equal(1); // Active
      expect(await registry.isDeviceActive(0)).to.be.true;
    });

    it("reverts when reactivating an already active device", async function () {
      await registry.reactivateDevice(0);
      await expect(
        registry.reactivateDevice(0)
      ).to.be.revertedWithCustomError(registry, "DeviceAlreadyActive");
    });

    it("reverts when non-admin reactivates", async function () {
      await expect(
        registry.connect(attacker).reactivateDevice(0)
      ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    });

    it("can reactivate a suspended device", async function () {
      // First reactivate the inactive device, then suspend it
      await registry.reactivateDevice(0);
      await registry.suspendDevice(0);
      expect(await registry.deviceStatus(0)).to.equal(2); // Suspended

      await expect(registry.reactivateDevice(0))
        .to.emit(registry, "DeviceReactivated");
      expect(await registry.deviceStatus(0)).to.equal(1); // Active
    });
  });

  // ─────────────────────────────────────────────
  //  Lifecycle — Suspension
  // ─────────────────────────────────────────────

  describe("Suspension", function () {
    beforeEach(async function () {
      await registry.registerDevice(alice.address, FW_HASH, DEVICE_URI);
    });

    it("admin can suspend an active device", async function () {
      await expect(registry.suspendDevice(0))
        .to.emit(registry, "DeviceSuspended")
        .withArgs(0);

      // DeviceStatus.Suspended = 2
      expect(await registry.deviceStatus(0)).to.equal(2);
      expect(await registry.isDeviceActive(0)).to.be.false;
    });

    it("reverts when suspending an inactive device", async function () {
      await registry.connect(alice).deactivateDevice(0);
      await expect(
        registry.suspendDevice(0)
      ).to.be.revertedWithCustomError(registry, "DeviceNotActive");
    });

    it("reverts when non-admin suspends", async function () {
      await expect(
        registry.connect(attacker).suspendDevice(0)
      ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    });
  });

  // ─────────────────────────────────────────────
  //  Firmware updates
  // ─────────────────────────────────────────────

  describe("Firmware updates", function () {
    beforeEach(async function () {
      await registry.registerDevice(alice.address, FW_HASH, DEVICE_URI);
    });

    it("admin can update firmware hash", async function () {
      await expect(registry.updateFirmware(0, FW_HASH_V2))
        .to.emit(registry, "FirmwareUpdated")
        .withArgs(0, FW_HASH, FW_HASH_V2);

      expect(await registry.firmwareHash(0)).to.equal(FW_HASH_V2);
    });

    it("reverts with zero firmware hash", async function () {
      await expect(
        registry.updateFirmware(0, ZERO_HASH)
      ).to.be.revertedWithCustomError(registry, "InvalidFirmwareHash");
    });

    it("reverts for non-existent device", async function () {
      await expect(
        registry.updateFirmware(99, FW_HASH_V2)
      ).to.be.revertedWithCustomError(registry, "ERC721NonexistentToken");
    });

    it("reverts when non-admin updates firmware", async function () {
      await expect(
        registry.connect(attacker).updateFirmware(0, FW_HASH_V2)
      ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    });
  });

  // ─────────────────────────────────────────────
  //  ERC-721 ownership and transfers
  // ─────────────────────────────────────────────

  describe("ERC-721 transfers", function () {
    beforeEach(async function () {
      await registry.registerDevice(alice.address, FW_HASH, DEVICE_URI);
    });

    it("device owner can transfer device NFT", async function () {
      await registry.connect(alice).transferFrom(alice.address, bob.address, 0);
      expect(await registry.ownerOf(0)).to.equal(bob.address);
    });

    it("transferred device retains status and firmware", async function () {
      await registry.connect(alice).transferFrom(alice.address, bob.address, 0);
      expect(await registry.deviceStatus(0)).to.equal(1); // Active
      expect(await registry.firmwareHash(0)).to.equal(FW_HASH);
    });
  });

  // ─────────────────────────────────────────────
  //  Enumeration
  // ─────────────────────────────────────────────

  describe("Enumeration", function () {
    beforeEach(async function () {
      await registry.registerDevice(alice.address, FW_HASH, "uri-0");
      await registry.registerDevice(alice.address, FW_HASH, "uri-1");
      await registry.registerDevice(bob.address, FW_HASH, "uri-2");
    });

    it("reports total supply correctly", async function () {
      expect(await registry.totalSupply()).to.equal(3);
    });

    it("enumerates tokens by owner", async function () {
      expect(await registry.tokenOfOwnerByIndex(alice.address, 0)).to.equal(0);
      expect(await registry.tokenOfOwnerByIndex(alice.address, 1)).to.equal(1);
      expect(await registry.tokenOfOwnerByIndex(bob.address, 0)).to.equal(2);
    });

    it("enumerates all tokens by index", async function () {
      expect(await registry.tokenByIndex(0)).to.equal(0);
      expect(await registry.tokenByIndex(1)).to.equal(1);
      expect(await registry.tokenByIndex(2)).to.equal(2);
    });
  });

  // ─────────────────────────────────────────────
  //  View function edge cases
  // ─────────────────────────────────────────────

  describe("View edge cases", function () {
    it("isDeviceActive returns false for non-existent device", async function () {
      expect(await registry.isDeviceActive(999)).to.be.false;
    });

    it("deviceStatus reverts for non-existent device", async function () {
      await expect(
        registry.deviceStatus(999)
      ).to.be.revertedWithCustomError(registry, "ERC721NonexistentToken");
    });

    it("firmwareHash reverts for non-existent device", async function () {
      await expect(
        registry.firmwareHash(999)
      ).to.be.revertedWithCustomError(registry, "ERC721NonexistentToken");
    });
  });
});
