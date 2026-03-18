/**
 * @file MerkleDeviceRegistry.test.js
 * @description Tests for MerkleDeviceRegistry: MerkleProof onboarding,
 * BitMaps device flags, and Checkpoints reputation tracking.
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { MerkleTree } = require("merkletreejs");

// Helper to build a Merkle tree from device entries
function buildMerkleTree(entries) {
  const leaves = entries.map(([owner, fwHash, uri]) =>
    ethers.solidityPackedKeccak256(
      ["address", "bytes32", "string"],
      [owner, fwHash, uri]
    )
  );
  const tree = new MerkleTree(leaves, ethers.keccak256, { sortPairs: true });
  return { tree, leaves };
}

describe("MerkleDeviceRegistry", function () {
  const FW_HASH = ethers.keccak256(ethers.toUtf8Bytes("firmware-v1.0"));
  const FW_HASH_2 = ethers.keccak256(ethers.toUtf8Bytes("firmware-v2.0"));
  const URI_1 = "https://api.nextgen.economy/devices/1.json";
  const URI_2 = "https://api.nextgen.economy/devices/2.json";
  const URI_3 = "https://api.nextgen.economy/devices/3.json";

  let registry;
  let owner, alice, bob, attacker;

  beforeEach(async function () {
    [owner, alice, bob, attacker] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("MerkleDeviceRegistry");
    registry = await Factory.deploy();
    await registry.waitForDeployment();
  });

  // ─────────────────────────────────────────────
  //  MerkleProof Onboarding
  // ─────────────────────────────────────────────

  describe("Merkle Onboarding", function () {
    it("rejects claim when merkle root is not set", async function () {
      await expect(
        registry.connect(alice).claimDevice(FW_HASH, URI_1, [])
      ).to.be.revertedWithCustomError(registry, "MerkleRootNotSet");
    });

    it("allows valid Merkle proof claim", async function () {
      const entries = [
        [alice.address, FW_HASH, URI_1],
        [bob.address, FW_HASH_2, URI_2],
      ];
      const { tree, leaves } = buildMerkleTree(entries);

      await registry.setMerkleRoot(tree.getHexRoot());

      const proof = tree.getHexProof(leaves[0]);
      await expect(registry.connect(alice).claimDevice(FW_HASH, URI_1, proof))
        .to.emit(registry, "DeviceClaimedViaMerkle");

      expect(await registry.deviceCount()).to.equal(1);
      expect(await registry.ownerOf(0)).to.equal(alice.address);
    });

    it("rejects invalid Merkle proof", async function () {
      const entries = [[alice.address, FW_HASH, URI_1]];
      const { tree } = buildMerkleTree(entries);

      await registry.setMerkleRoot(tree.getHexRoot());

      // Bob tries to claim with Alice's proof
      await expect(
        registry.connect(bob).claimDevice(FW_HASH, URI_1, [])
      ).to.be.revertedWithCustomError(registry, "InvalidMerkleProof");
    });

    it("prevents double-claiming the same leaf", async function () {
      const entries = [[alice.address, FW_HASH, URI_1]];
      const { tree, leaves } = buildMerkleTree(entries);

      await registry.setMerkleRoot(tree.getHexRoot());
      const proof = tree.getHexProof(leaves[0]);

      await registry.connect(alice).claimDevice(FW_HASH, URI_1, proof);

      await expect(
        registry.connect(alice).claimDevice(FW_HASH, URI_1, proof)
      ).to.be.revertedWithCustomError(registry, "LeafAlreadyClaimed");
    });

    it("only owner can set merkle root", async function () {
      await expect(
        registry.connect(attacker).setMerkleRoot(ethers.ZeroHash)
      ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    });
  });

  // ─────────────────────────────────────────────
  //  BitMaps — Device Flags
  // ─────────────────────────────────────────────

  describe("Device Flags (BitMaps)", function () {
    const ALLOWLISTED = ethers.keccak256(ethers.toUtf8Bytes("allowlisted"));
    const PREMIUM = ethers.keccak256(ethers.toUtf8Bytes("premium"));

    it("sets and reads device flags", async function () {
      await registry.setDeviceFlag(PREMIUM, 0, true);
      expect(await registry.hasDeviceFlag(PREMIUM, 0)).to.equal(true);
      expect(await registry.hasDeviceFlag(PREMIUM, 1)).to.equal(false);
    });

    it("unsets device flags", async function () {
      await registry.setDeviceFlag(PREMIUM, 5, true);
      expect(await registry.hasDeviceFlag(PREMIUM, 5)).to.equal(true);

      await registry.setDeviceFlag(PREMIUM, 5, false);
      expect(await registry.hasDeviceFlag(PREMIUM, 5)).to.equal(false);
    });

    it("Merkle claim auto-sets allowlisted flag", async function () {
      const entries = [[alice.address, FW_HASH, URI_1]];
      const { tree, leaves } = buildMerkleTree(entries);
      await registry.setMerkleRoot(tree.getHexRoot());
      const proof = tree.getHexProof(leaves[0]);

      await registry.connect(alice).claimDevice(FW_HASH, URI_1, proof);

      expect(await registry.hasDeviceFlag(ALLOWLISTED, 0)).to.equal(true);
    });

    it("only owner can set flags", async function () {
      await expect(
        registry.connect(attacker).setDeviceFlag(PREMIUM, 0, true)
      ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    });
  });

  // ─────────────────────────────────────────────
  //  Checkpoints — Device Reputation
  // ─────────────────────────────────────────────

  describe("Device Reputation (Checkpoints)", function () {
    it("auto-sets initial reputation on Merkle claim", async function () {
      const entries = [[alice.address, FW_HASH, URI_1]];
      const { tree, leaves } = buildMerkleTree(entries);
      await registry.setMerkleRoot(tree.getHexRoot());
      const proof = tree.getHexProof(leaves[0]);

      await registry.connect(alice).claimDevice(FW_HASH, URI_1, proof);

      expect(await registry.reputation(0)).to.equal(5000);
    });

    it("admin can update reputation", async function () {
      await registry.updateDeviceReputation(0, 8000);
      expect(await registry.reputation(0)).to.equal(8000);
    });

    it("rejects reputation above MAX_REPUTATION", async function () {
      await expect(
        registry.updateDeviceReputation(0, 10001)
      ).to.be.revertedWithCustomError(registry, "ReputationScoreOutOfRange");
    });

    it("only owner can update reputation", async function () {
      await expect(
        registry.connect(attacker).updateDeviceReputation(0, 9000)
      ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    });
  });
});
