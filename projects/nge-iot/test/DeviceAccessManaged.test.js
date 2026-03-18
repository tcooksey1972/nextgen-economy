/**
 * @file DeviceAccessManaged.test.js
 * @description Hardhat test suite for the DeviceAccessManaged contract,
 * which uses OpenZeppelin AccessManaged for role-based access control
 * and includes DataAnchor mixin for on-chain data anchoring.
 *
 * Covers: deployment, registration, lifecycle management, firmware updates,
 * AccessManager role enforcement, data anchoring, and view functions.
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DeviceAccessManaged", function () {
  const FW_HASH = ethers.keccak256(ethers.toUtf8Bytes("firmware-v1.0"));
  const FW_HASH_V2 = ethers.keccak256(ethers.toUtf8Bytes("firmware-v2.0"));
  const DEVICE_URI = "https://api.nextgen.economy/devices/0.json";
  const ZERO_HASH = ethers.ZeroHash;

  // Sample data hashes for anchoring tests
  const DATA_HASH_1 = ethers.keccak256(ethers.toUtf8Bytes("temperature:22.5C:1710000000"));
  const DATA_HASH_2 = ethers.keccak256(ethers.toUtf8Bytes("humidity:65%:1710000060"));
  const DATA_HASH_3 = ethers.keccak256(ethers.toUtf8Bytes("pressure:1013hPa:1710000120"));

  const ADMIN_ROLE = 0n;

  let registry, registryAddr;
  let manager, managerAddr;
  let owner, alice, bob, attacker;

  beforeEach(async function () {
    [owner, alice, bob, attacker] = await ethers.getSigners();

    // Deploy AccessManager with owner as initialAdmin
    const AccessManager = await ethers.getContractFactory(
      "@openzeppelin/contracts/access/manager/AccessManager.sol:AccessManager"
    );
    manager = await AccessManager.deploy(owner.address);
    await manager.waitForDeployment();
    managerAddr = await manager.getAddress();

    // Deploy DeviceAccessManaged with the AccessManager
    const Factory = await ethers.getContractFactory("DeviceAccessManaged");
    registry = await Factory.deploy(managerAddr);
    await registry.waitForDeployment();
    registryAddr = await registry.getAddress();

    // Configure AccessManager: set target function roles for restricted functions
    const registerSelector = registry.interface.getFunction("registerDevice").selector;
    const reactivateSelector = registry.interface.getFunction("reactivateDevice").selector;
    const suspendSelector = registry.interface.getFunction("suspendDevice").selector;
    const updateFwSelector = registry.interface.getFunction("updateFirmware").selector;

    await manager.setTargetFunctionRole(
      registryAddr,
      [registerSelector, reactivateSelector, suspendSelector, updateFwSelector],
      ADMIN_ROLE
    );
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

    it("reports the correct authority (AccessManager)", async function () {
      expect(await registry.authority()).to.equal(managerAddr);
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

    it("reverts when caller lacks role (AccessManagedUnauthorized)", async function () {
      await expect(
        registry.connect(attacker).registerDevice(alice.address, FW_HASH, DEVICE_URI)
      ).to.be.revertedWithCustomError(registry, "AccessManagedUnauthorized");
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

    it("non-admin device owner can deactivate (no restricted modifier)", async function () {
      // alice is device owner but NOT an admin in AccessManager
      // deactivateDevice should still work because it has no `restricted` modifier
      await registry.connect(alice).deactivateDevice(0);
      expect(await registry.isDeviceActive(0)).to.be.false;
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

    it("reverts when unauthorized caller reactivates", async function () {
      await expect(
        registry.connect(attacker).reactivateDevice(0)
      ).to.be.revertedWithCustomError(registry, "AccessManagedUnauthorized");
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

    it("reverts when unauthorized caller suspends", async function () {
      await expect(
        registry.connect(attacker).suspendDevice(0)
      ).to.be.revertedWithCustomError(registry, "AccessManagedUnauthorized");
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

    it("reverts when unauthorized caller updates firmware", async function () {
      await expect(
        registry.connect(attacker).updateFirmware(0, FW_HASH_V2)
      ).to.be.revertedWithCustomError(registry, "AccessManagedUnauthorized");
    });
  });

  // ─────────────────────────────────────────────
  //  Access control — role-based via AccessManager
  // ─────────────────────────────────────────────

  describe("AccessManager role management", function () {
    it("grants a custom role to a new admin who can then register devices", async function () {
      const DEVICE_ADMIN_ROLE = 1n;

      // Grant role to bob
      await manager.grantRole(DEVICE_ADMIN_ROLE, bob.address, 0);

      // Set target function role for registerDevice to the custom role
      const registerSelector = registry.interface.getFunction("registerDevice").selector;
      await manager.setTargetFunctionRole(registryAddr, [registerSelector], DEVICE_ADMIN_ROLE);

      // Now bob (with DEVICE_ADMIN_ROLE) can register
      await expect(
        registry.connect(bob).registerDevice(alice.address, FW_HASH, DEVICE_URI)
      ).to.emit(registry, "DeviceRegistered");
    });

    it("original admin loses access when function role changes and they lack the new role", async function () {
      const NEW_ROLE = 42n;

      // Change registerDevice to require NEW_ROLE
      const registerSelector = registry.interface.getFunction("registerDevice").selector;
      await manager.setTargetFunctionRole(registryAddr, [registerSelector], NEW_ROLE);

      // owner no longer has the right role (they have ADMIN_ROLE = 0, not NEW_ROLE = 42)
      await expect(
        registry.registerDevice(alice.address, FW_HASH, DEVICE_URI)
      ).to.be.revertedWithCustomError(registry, "AccessManagedUnauthorized");
    });

    it("all restricted functions revert for unauthorized caller", async function () {
      await registry.registerDevice(alice.address, FW_HASH, DEVICE_URI);

      await expect(
        registry.connect(attacker).registerDevice(bob.address, FW_HASH, "uri")
      ).to.be.revertedWithCustomError(registry, "AccessManagedUnauthorized");

      await expect(
        registry.connect(attacker).reactivateDevice(0)
      ).to.be.revertedWithCustomError(registry, "AccessManagedUnauthorized");

      await expect(
        registry.connect(attacker).suspendDevice(0)
      ).to.be.revertedWithCustomError(registry, "AccessManagedUnauthorized");

      await expect(
        registry.connect(attacker).updateFirmware(0, FW_HASH_V2)
      ).to.be.revertedWithCustomError(registry, "AccessManagedUnauthorized");
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
  //  Data anchoring — single anchor
  // ─────────────────────────────────────────────

  describe("Data anchoring — single", function () {
    beforeEach(async function () {
      await registry.registerDevice(alice.address, FW_HASH, DEVICE_URI);
    });

    it("device owner can anchor data for an active device", async function () {
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
  //  Data anchoring — batch
  // ─────────────────────────────────────────────

  describe("Data anchoring — batch", function () {
    beforeEach(async function () {
      await registry.registerDevice(alice.address, FW_HASH, DEVICE_URI);
    });

    it("anchors a batch of data hashes", async function () {
      const hashes = [DATA_HASH_1, DATA_HASH_2, DATA_HASH_3];
      await registry.connect(alice).anchorBatch(0, hashes);

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

      const tx = await registry.connect(alice).anchorBatch(0, hashes);
      const block = await ethers.provider.getBlock(tx.blockNumber);

      await expect(tx)
        .to.emit(registry, "BatchAnchored")
        .withArgs(0, batchRoot, 3, block.timestamp);
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
  //  Data anchoring — access control
  // ─────────────────────────────────────────────

  describe("Data anchoring — access control", function () {
    beforeEach(async function () {
      await registry.registerDevice(alice.address, FW_HASH, DEVICE_URI);
    });

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

    it("reverts batch anchor for inactive device", async function () {
      await registry.connect(alice).deactivateDevice(0);
      await expect(
        registry.connect(alice).anchorBatch(0, [DATA_HASH_1])
      ).to.be.revertedWithCustomError(registry, "DeviceNotActive");
    });

    it("allows anchor after device reactivation", async function () {
      await registry.connect(alice).deactivateDevice(0);
      await registry.reactivateDevice(0);
      await registry.connect(alice).anchorData(0, DATA_HASH_1);
      expect(await registry.isAnchored(DATA_HASH_1)).to.be.true;
    });

    it("new owner can anchor after device transfer", async function () {
      await registry.connect(alice).transferFrom(alice.address, bob.address, 0);

      // Alice can no longer anchor
      await expect(
        registry.connect(alice).anchorData(0, DATA_HASH_1)
      ).to.be.revertedWithCustomError(registry, "NotDeviceOwner");

      // Bob can now anchor
      await registry.connect(bob).anchorData(0, DATA_HASH_1);
      expect(await registry.isAnchored(DATA_HASH_1)).to.be.true;
    });

    it("multiple devices can anchor independently", async function () {
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
  //  Data anchoring — verification (view functions)
  // ─────────────────────────────────────────────

  describe("Data anchoring — verification", function () {
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
});
