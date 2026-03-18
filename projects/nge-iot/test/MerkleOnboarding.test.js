/**
 * @file MerkleOnboarding.test.js
 * @description Hardhat test suite for the MerkleOnboarding abstract contract,
 * exercised through the TestMerkleOnboarding harness.
 *
 * Covers: Merkle root management, valid/invalid proof claims, double-claim
 * prevention, access control, event emission, and isLeafClaimed queries.
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

describe("MerkleOnboarding", function () {
  const FW_HASH = ethers.keccak256(ethers.toUtf8Bytes("firmware-v1.0"));
  const FW_HASH_2 = ethers.keccak256(ethers.toUtf8Bytes("firmware-v2.0"));
  const URI_1 = "https://api.nextgen.economy/devices/1.json";
  const URI_2 = "https://api.nextgen.economy/devices/2.json";
  const URI_3 = "https://api.nextgen.economy/devices/3.json";

  let onboarding;
  let owner, alice, bob, charlie, attacker;

  beforeEach(async function () {
    [owner, alice, bob, charlie, attacker] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("TestMerkleOnboarding");
    onboarding = await Factory.deploy();
    await onboarding.waitForDeployment();
  });

  // ─────────────────────────────────────────────
  //  Merkle root management
  // ─────────────────────────────────────────────

  describe("Merkle root management", function () {
    it("merkle root is zero by default", async function () {
      expect(await onboarding.merkleRoot()).to.equal(ethers.ZeroHash);
    });

    it("owner can set merkle root", async function () {
      const root = ethers.keccak256(ethers.toUtf8Bytes("test-root"));
      await onboarding.setMerkleRoot(root);
      expect(await onboarding.merkleRoot()).to.equal(root);
    });

    it("owner can update merkle root to a new value", async function () {
      const root1 = ethers.keccak256(ethers.toUtf8Bytes("root-1"));
      const root2 = ethers.keccak256(ethers.toUtf8Bytes("root-2"));

      await onboarding.setMerkleRoot(root1);
      expect(await onboarding.merkleRoot()).to.equal(root1);

      await onboarding.setMerkleRoot(root2);
      expect(await onboarding.merkleRoot()).to.equal(root2);
    });

    it("non-owner cannot set merkle root", async function () {
      const root = ethers.keccak256(ethers.toUtf8Bytes("test-root"));
      await expect(
        onboarding.connect(attacker).setMerkleRoot(root)
      ).to.be.revertedWithCustomError(onboarding, "OwnableUnauthorizedAccount");
    });
  });

  // ─────────────────────────────────────────────
  //  MerkleRootUpdated event
  // ─────────────────────────────────────────────

  describe("MerkleRootUpdated event", function () {
    it("emits MerkleRootUpdated with old and new roots", async function () {
      const root = ethers.keccak256(ethers.toUtf8Bytes("first-root"));

      await expect(onboarding.setMerkleRoot(root))
        .to.emit(onboarding, "MerkleRootUpdated")
        .withArgs(ethers.ZeroHash, root);
    });

    it("emits MerkleRootUpdated when updating an existing root", async function () {
      const root1 = ethers.keccak256(ethers.toUtf8Bytes("root-1"));
      const root2 = ethers.keccak256(ethers.toUtf8Bytes("root-2"));

      await onboarding.setMerkleRoot(root1);

      await expect(onboarding.setMerkleRoot(root2))
        .to.emit(onboarding, "MerkleRootUpdated")
        .withArgs(root1, root2);
    });
  });

  // ─────────────────────────────────────────────
  //  Claim device with valid proof
  // ─────────────────────────────────────────────

  describe("Claiming devices", function () {
    it("claims a device with a valid Merkle proof", async function () {
      const entries = [
        [alice.address, FW_HASH, URI_1],
        [bob.address, FW_HASH_2, URI_2],
      ];
      const { tree, leaves } = buildMerkleTree(entries);

      await onboarding.setMerkleRoot(tree.getHexRoot());

      const proof = tree.getHexProof(leaves[0]);
      const tx = await onboarding.connect(alice).claimDevice(FW_HASH, URI_1, proof);
      const receipt = await tx.wait();

      // Verify return value via events
      await expect(tx)
        .to.emit(onboarding, "DeviceClaimedViaMerkle")
        .withArgs(0, alice.address, leaves[0]);

      await expect(tx)
        .to.emit(onboarding, "TestDeviceClaimed")
        .withArgs(0, alice.address);
    });

    it("assigns sequential device IDs", async function () {
      const entries = [
        [alice.address, FW_HASH, URI_1],
        [bob.address, FW_HASH_2, URI_2],
      ];
      const { tree, leaves } = buildMerkleTree(entries);

      await onboarding.setMerkleRoot(tree.getHexRoot());

      const proofAlice = tree.getHexProof(leaves[0]);
      await onboarding.connect(alice).claimDevice(FW_HASH, URI_1, proofAlice);

      const proofBob = tree.getHexProof(leaves[1]);
      await expect(
        onboarding.connect(bob).claimDevice(FW_HASH_2, URI_2, proofBob)
      )
        .to.emit(onboarding, "DeviceClaimedViaMerkle")
        .withArgs(1, bob.address, leaves[1]);
    });
  });

  // ─────────────────────────────────────────────
  //  Reverts: MerkleRootNotSet
  // ─────────────────────────────────────────────

  describe("MerkleRootNotSet", function () {
    it("reverts when Merkle root is not set", async function () {
      await expect(
        onboarding.connect(alice).claimDevice(FW_HASH, URI_1, [])
      ).to.be.revertedWithCustomError(onboarding, "MerkleRootNotSet");
    });

    it("reverts even with a valid-looking proof when root is zero", async function () {
      const fakeProof = [ethers.keccak256(ethers.toUtf8Bytes("fake"))];
      await expect(
        onboarding.connect(alice).claimDevice(FW_HASH, URI_1, fakeProof)
      ).to.be.revertedWithCustomError(onboarding, "MerkleRootNotSet");
    });
  });

  // ─────────────────────────────────────────────
  //  Reverts: InvalidMerkleProof
  // ─────────────────────────────────────────────

  describe("InvalidMerkleProof", function () {
    it("reverts with invalid proof (wrong sender)", async function () {
      const entries = [[alice.address, FW_HASH, URI_1]];
      const { tree } = buildMerkleTree(entries);

      await onboarding.setMerkleRoot(tree.getHexRoot());

      // Bob tries to claim Alice's entry
      await expect(
        onboarding.connect(bob).claimDevice(FW_HASH, URI_1, [])
      ).to.be.revertedWithCustomError(onboarding, "InvalidMerkleProof");
    });

    it("reverts with empty proof for multi-leaf tree", async function () {
      const entries = [
        [alice.address, FW_HASH, URI_1],
        [bob.address, FW_HASH_2, URI_2],
      ];
      const { tree } = buildMerkleTree(entries);

      await onboarding.setMerkleRoot(tree.getHexRoot());

      await expect(
        onboarding.connect(alice).claimDevice(FW_HASH, URI_1, [])
      ).to.be.revertedWithCustomError(onboarding, "InvalidMerkleProof");
    });

    it("reverts with wrong firmware hash", async function () {
      const entries = [[alice.address, FW_HASH, URI_1]];
      const { tree, leaves } = buildMerkleTree(entries);

      await onboarding.setMerkleRoot(tree.getHexRoot());

      const proof = tree.getHexProof(leaves[0]);
      // Use wrong firmware hash
      await expect(
        onboarding.connect(alice).claimDevice(FW_HASH_2, URI_1, proof)
      ).to.be.revertedWithCustomError(onboarding, "InvalidMerkleProof");
    });

    it("reverts with wrong URI", async function () {
      const entries = [[alice.address, FW_HASH, URI_1]];
      const { tree, leaves } = buildMerkleTree(entries);

      await onboarding.setMerkleRoot(tree.getHexRoot());

      const proof = tree.getHexProof(leaves[0]);
      await expect(
        onboarding.connect(alice).claimDevice(FW_HASH, URI_2, proof)
      ).to.be.revertedWithCustomError(onboarding, "InvalidMerkleProof");
    });
  });

  // ─────────────────────────────────────────────
  //  Reverts: LeafAlreadyClaimed (double claim)
  // ─────────────────────────────────────────────

  describe("LeafAlreadyClaimed", function () {
    it("reverts on double claim of the same leaf", async function () {
      const entries = [[alice.address, FW_HASH, URI_1]];
      const { tree, leaves } = buildMerkleTree(entries);

      await onboarding.setMerkleRoot(tree.getHexRoot());
      const proof = tree.getHexProof(leaves[0]);

      // First claim succeeds
      await onboarding.connect(alice).claimDevice(FW_HASH, URI_1, proof);

      // Second claim fails
      await expect(
        onboarding.connect(alice).claimDevice(FW_HASH, URI_1, proof)
      ).to.be.revertedWithCustomError(onboarding, "LeafAlreadyClaimed");
    });
  });

  // ─────────────────────────────────────────────
  //  Multiple claims from same tree
  // ─────────────────────────────────────────────

  describe("Multiple claims from same tree", function () {
    it("allows different users to claim their respective leaves", async function () {
      const entries = [
        [alice.address, FW_HASH, URI_1],
        [bob.address, FW_HASH_2, URI_2],
        [charlie.address, FW_HASH, URI_3],
      ];
      const { tree, leaves } = buildMerkleTree(entries);

      await onboarding.setMerkleRoot(tree.getHexRoot());

      // All three claim successfully
      const proofAlice = tree.getHexProof(leaves[0]);
      await expect(
        onboarding.connect(alice).claimDevice(FW_HASH, URI_1, proofAlice)
      ).to.emit(onboarding, "DeviceClaimedViaMerkle");

      const proofBob = tree.getHexProof(leaves[1]);
      await expect(
        onboarding.connect(bob).claimDevice(FW_HASH_2, URI_2, proofBob)
      ).to.emit(onboarding, "DeviceClaimedViaMerkle");

      const proofCharlie = tree.getHexProof(leaves[2]);
      await expect(
        onboarding.connect(charlie).claimDevice(FW_HASH, URI_3, proofCharlie)
      ).to.emit(onboarding, "DeviceClaimedViaMerkle");
    });

    it("one claim does not prevent others from claiming", async function () {
      const entries = [
        [alice.address, FW_HASH, URI_1],
        [bob.address, FW_HASH_2, URI_2],
      ];
      const { tree, leaves } = buildMerkleTree(entries);

      await onboarding.setMerkleRoot(tree.getHexRoot());

      // Alice claims first
      const proofAlice = tree.getHexProof(leaves[0]);
      await onboarding.connect(alice).claimDevice(FW_HASH, URI_1, proofAlice);

      // Bob can still claim
      const proofBob = tree.getHexProof(leaves[1]);
      await expect(
        onboarding.connect(bob).claimDevice(FW_HASH_2, URI_2, proofBob)
      ).to.not.be.reverted;
    });
  });

  // ─────────────────────────────────────────────
  //  isLeafClaimed
  // ─────────────────────────────────────────────

  describe("isLeafClaimed", function () {
    it("returns false for unclaimed leaves", async function () {
      const leaf = ethers.keccak256(ethers.toUtf8Bytes("some-leaf"));
      expect(await onboarding.isLeafClaimed(leaf)).to.equal(false);
    });

    it("returns true after a leaf is claimed", async function () {
      const entries = [[alice.address, FW_HASH, URI_1]];
      const { tree, leaves } = buildMerkleTree(entries);

      await onboarding.setMerkleRoot(tree.getHexRoot());
      const proof = tree.getHexProof(leaves[0]);

      expect(await onboarding.isLeafClaimed(leaves[0])).to.equal(false);

      await onboarding.connect(alice).claimDevice(FW_HASH, URI_1, proof);

      expect(await onboarding.isLeafClaimed(leaves[0])).to.equal(true);
    });

    it("unclaimed leaves remain false after other claims", async function () {
      const entries = [
        [alice.address, FW_HASH, URI_1],
        [bob.address, FW_HASH_2, URI_2],
      ];
      const { tree, leaves } = buildMerkleTree(entries);

      await onboarding.setMerkleRoot(tree.getHexRoot());

      const proofAlice = tree.getHexProof(leaves[0]);
      await onboarding.connect(alice).claimDevice(FW_HASH, URI_1, proofAlice);

      expect(await onboarding.isLeafClaimed(leaves[0])).to.equal(true);
      expect(await onboarding.isLeafClaimed(leaves[1])).to.equal(false);
    });
  });
});
