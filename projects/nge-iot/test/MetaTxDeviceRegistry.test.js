/**
 * @file MetaTxDeviceRegistry.test.js
 * @description Hardhat test suite for the MetaTxDeviceRegistry abstract contract,
 * exercised through the TestMetaTxDeviceRegistry harness contract.
 *
 * Covers: deployment, trusted forwarder configuration, registration, lifecycle
 * management, firmware updates, access control via _authorizeRegistryAdmin
 * (Ownable), ERC-721 transfers, enumeration, and view functions.
 *
 * Note: Full ERC-2771 forwarding relay mechanics are not tested here (that is
 * OpenZeppelin's responsibility). We verify the forwarder address is stored
 * correctly and that direct calls work using _msgSender().
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MetaTxDeviceRegistry", function () {
  const FW_HASH = ethers.keccak256(ethers.toUtf8Bytes("firmware-v1.0"));
  const FW_HASH_V2 = ethers.keccak256(ethers.toUtf8Bytes("firmware-v2.0"));
  const DEVICE_URI = "https://api.nextgen.economy/devices/0.json";
  const ZERO_HASH = ethers.ZeroHash;

  let registry, registryAddr;
  let owner, alice, bob, attacker, forwarder;

  beforeEach(async function () {
    [owner, alice, bob, attacker, forwarder] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("TestMetaTxDeviceRegistry");
    registry = await Factory.deploy(forwarder.address);
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
  //  Trusted forwarder
  // ─────────────────────────────────────────────

  describe("Trusted forwarder", function () {
    it("isTrustedForwarder returns true for the configured forwarder", async function () {
      expect(await registry.isTrustedForwarder(forwarder.address)).to.be.true;
    });

    it("isTrustedForwarder returns false for other addresses", async function () {
      expect(await registry.isTrustedForwarder(alice.address)).to.be.false;
      expect(await registry.isTrustedForwarder(owner.address)).to.be.false;
      expect(await registry.isTrustedForwarder(ethers.ZeroAddress)).to.be.false;
    });

    it("trustedForwarder returns the correct address", async function () {
      expect(await registry.trustedForwarder()).to.equal(forwarder.address);
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

    it("contract owner who is not device owner cannot deactivate", async function () {
      // owner deployed the contract but alice owns device 0
      await expect(
        registry.connect(owner).deactivateDevice(0)
      ).to.be.revertedWithCustomError(registry, "NotDeviceOwner");
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

    it("can update firmware multiple times", async function () {
      const FW_HASH_V3 = ethers.keccak256(ethers.toUtf8Bytes("firmware-v3.0"));

      await registry.updateFirmware(0, FW_HASH_V2);
      await expect(registry.updateFirmware(0, FW_HASH_V3))
        .to.emit(registry, "FirmwareUpdated")
        .withArgs(0, FW_HASH_V2, FW_HASH_V3);

      expect(await registry.firmwareHash(0)).to.equal(FW_HASH_V3);
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

    it("new owner can deactivate after transfer", async function () {
      await registry.connect(alice).transferFrom(alice.address, bob.address, 0);
      await expect(registry.connect(bob).deactivateDevice(0))
        .to.emit(registry, "DeviceDeactivated")
        .withArgs(0);
    });

    it("old owner cannot deactivate after transfer", async function () {
      await registry.connect(alice).transferFrom(alice.address, bob.address, 0);
      await expect(
        registry.connect(alice).deactivateDevice(0)
      ).to.be.revertedWithCustomError(registry, "NotDeviceOwner");
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

    it("deviceCount remains accurate after multiple registrations", async function () {
      await registry.registerDevice(alice.address, FW_HASH, "uri-0");
      await registry.registerDevice(bob.address, FW_HASH, "uri-1");
      expect(await registry.deviceCount()).to.equal(2);
    });

    it("supportsInterface returns true for ERC721 and ERC721Enumerable", async function () {
      // ERC721 interfaceId
      expect(await registry.supportsInterface("0x80ac58cd")).to.be.true;
      // ERC721Enumerable interfaceId
      expect(await registry.supportsInterface("0x780e9d63")).to.be.true;
    });
  });

  // ─────────────────────────────────────────────
  //  Access control — all admin functions
  // ─────────────────────────────────────────────

  describe("Access control — comprehensive", function () {
    beforeEach(async function () {
      await registry.registerDevice(alice.address, FW_HASH, DEVICE_URI);
    });

    it("all admin functions revert for non-owner", async function () {
      await expect(
        registry.connect(attacker).registerDevice(bob.address, FW_HASH, "uri")
      ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");

      await expect(
        registry.connect(attacker).reactivateDevice(0)
      ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");

      await expect(
        registry.connect(attacker).suspendDevice(0)
      ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");

      await expect(
        registry.connect(attacker).updateFirmware(0, FW_HASH_V2)
      ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    });

    it("device owner (non-admin) cannot call admin functions", async function () {
      // alice owns device 0 but is not the contract owner
      await expect(
        registry.connect(alice).registerDevice(bob.address, FW_HASH, "uri")
      ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");

      await registry.connect(alice).deactivateDevice(0);

      await expect(
        registry.connect(alice).reactivateDevice(0)
      ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    });
  });

  // ─────────────────────────────────────────────
  //  Full device lifecycle
  // ─────────────────────────────────────────────

  describe("Full lifecycle", function () {
    it("register -> deactivate -> reactivate -> suspend -> reactivate", async function () {
      // Register
      await registry.registerDevice(alice.address, FW_HASH, DEVICE_URI);
      expect(await registry.deviceStatus(0)).to.equal(1); // Active

      // Deactivate (by device owner)
      await registry.connect(alice).deactivateDevice(0);
      expect(await registry.deviceStatus(0)).to.equal(0); // Inactive

      // Reactivate (by admin)
      await registry.reactivateDevice(0);
      expect(await registry.deviceStatus(0)).to.equal(1); // Active

      // Suspend (by admin)
      await registry.suspendDevice(0);
      expect(await registry.deviceStatus(0)).to.equal(2); // Suspended

      // Reactivate again (by admin)
      await registry.reactivateDevice(0);
      expect(await registry.deviceStatus(0)).to.equal(1); // Active

      // Update firmware along the way
      await registry.updateFirmware(0, FW_HASH_V2);
      expect(await registry.firmwareHash(0)).to.equal(FW_HASH_V2);
    });
  });
});
