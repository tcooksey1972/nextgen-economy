/**
 * @file DIDRegistry.test.js
 * @description Hardhat test suite for the DIDRegistry contract.
 *
 * Covers: DID creation, document updates, deactivation, controller changes,
 * biometric binding, admin operations, and edge cases.
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DIDRegistry", function () {
  const DID_URI = "https://nge.cloud-creations.com/did/alice/document.json";
  const DID_URI_2 = "https://nge.cloud-creations.com/did/alice/document-v2.json";
  const BOB_DID_URI = "https://nge.cloud-creations.com/did/bob/document.json";

  let registry;
  let owner, alice, bob, attacker;
  let didHashAlice, didHashBob;

  beforeEach(async function () {
    [owner, alice, bob, attacker] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("SimpleDIDRegistry");
    registry = await Factory.deploy();
    await registry.waitForDeployment();

    didHashAlice = ethers.keccak256(ethers.toUtf8Bytes("did:web:nge.cloud-creations.com:users:alice"));
    didHashBob = ethers.keccak256(ethers.toUtf8Bytes("did:web:nge.cloud-creations.com:users:bob"));
  });

  // ─────────────────────────────────────────────
  //  DID Creation
  // ─────────────────────────────────────────────

  describe("DID Creation", function () {
    it("creates a DID successfully", async function () {
      await registry.connect(alice).createDID(didHashAlice, DID_URI);
      expect(await registry.isActive(didHashAlice)).to.be.true;
      expect(await registry.didCount()).to.equal(1);
    });

    it("emits DIDCreated event", async function () {
      await expect(registry.connect(alice).createDID(didHashAlice, DID_URI))
        .to.emit(registry, "DIDCreated")
        .withArgs(didHashAlice, alice.address, DID_URI);
    });

    it("stores DID record correctly", async function () {
      await registry.connect(alice).createDID(didHashAlice, DID_URI);
      const record = await registry.resolve(didHashAlice);

      expect(record.controller).to.equal(alice.address);
      expect(record.documentURI).to.equal(DID_URI);
      expect(record.active).to.be.true;
      expect(record.created).to.be.greaterThan(0);
      expect(record.updated).to.equal(record.created);
    });

    it("sets caller as controller", async function () {
      await registry.connect(alice).createDID(didHashAlice, DID_URI);
      expect(await registry.controllerOf(didHashAlice)).to.equal(alice.address);
    });

    it("tracks DIDs by controller", async function () {
      await registry.connect(alice).createDID(didHashAlice, DID_URI);
      const dids = await registry.getDIDsByController(alice.address);
      expect(dids).to.have.lengthOf(1);
      expect(dids[0]).to.equal(didHashAlice);
    });

    it("allows multiple DIDs per controller", async function () {
      const didHash2 = ethers.keccak256(ethers.toUtf8Bytes("did:web:nge.cloud-creations.com:users:alice2"));
      await registry.connect(alice).createDID(didHashAlice, DID_URI);
      await registry.connect(alice).createDID(didHash2, DID_URI_2);

      const dids = await registry.getDIDsByController(alice.address);
      expect(dids).to.have.lengthOf(2);
      expect(await registry.didCount()).to.equal(2);
    });

    it("reverts on duplicate DID hash", async function () {
      await registry.connect(alice).createDID(didHashAlice, DID_URI);
      await expect(
        registry.connect(bob).createDID(didHashAlice, BOB_DID_URI)
      ).to.be.revertedWithCustomError(registry, "DIDAlreadyExists");
    });

    it("reverts with zero DID hash", async function () {
      await expect(
        registry.connect(alice).createDID(ethers.ZeroHash, DID_URI)
      ).to.be.revertedWithCustomError(registry, "InvalidDIDHash");
    });

    it("reverts with empty document URI", async function () {
      await expect(
        registry.connect(alice).createDID(didHashAlice, "")
      ).to.be.revertedWithCustomError(registry, "InvalidDocumentURI");
    });
  });

  // ─────────────────────────────────────────────
  //  Document Updates
  // ─────────────────────────────────────────────

  describe("Document Updates", function () {
    beforeEach(async function () {
      await registry.connect(alice).createDID(didHashAlice, DID_URI);
    });

    it("updates document URI", async function () {
      await registry.connect(alice).updateDocument(didHashAlice, DID_URI_2);
      const record = await registry.resolve(didHashAlice);
      expect(record.documentURI).to.equal(DID_URI_2);
    });

    it("emits DIDUpdated event", async function () {
      await expect(registry.connect(alice).updateDocument(didHashAlice, DID_URI_2))
        .to.emit(registry, "DIDUpdated")
        .withArgs(didHashAlice, DID_URI_2);
    });

    it("updates the timestamp", async function () {
      const before = await registry.resolve(didHashAlice);
      await ethers.provider.send("evm_increaseTime", [100]);
      await registry.connect(alice).updateDocument(didHashAlice, DID_URI_2);
      const after = await registry.resolve(didHashAlice);
      expect(after.updated).to.be.greaterThan(before.updated);
    });

    it("reverts when non-controller updates", async function () {
      await expect(
        registry.connect(attacker).updateDocument(didHashAlice, DID_URI_2)
      ).to.be.revertedWithCustomError(registry, "NotDIDController");
    });

    it("reverts with empty URI", async function () {
      await expect(
        registry.connect(alice).updateDocument(didHashAlice, "")
      ).to.be.revertedWithCustomError(registry, "InvalidDocumentURI");
    });
  });

  // ─────────────────────────────────────────────
  //  Deactivation
  // ─────────────────────────────────────────────

  describe("Deactivation", function () {
    beforeEach(async function () {
      await registry.connect(alice).createDID(didHashAlice, DID_URI);
    });

    it("deactivates a DID", async function () {
      await registry.connect(alice).deactivate(didHashAlice);
      expect(await registry.isActive(didHashAlice)).to.be.false;
    });

    it("emits DIDDeactivated event", async function () {
      await expect(registry.connect(alice).deactivate(didHashAlice))
        .to.emit(registry, "DIDDeactivated")
        .withArgs(didHashAlice);
    });

    it("reverts when non-controller deactivates", async function () {
      await expect(
        registry.connect(attacker).deactivate(didHashAlice)
      ).to.be.revertedWithCustomError(registry, "NotDIDController");
    });

    it("reverts operations on deactivated DID", async function () {
      await registry.connect(alice).deactivate(didHashAlice);
      await expect(
        registry.connect(alice).updateDocument(didHashAlice, DID_URI_2)
      ).to.be.revertedWithCustomError(registry, "DIDDeactivatedError");
    });
  });

  // ─────────────────────────────────────────────
  //  Controller Changes
  // ─────────────────────────────────────────────

  describe("Controller Changes", function () {
    beforeEach(async function () {
      await registry.connect(alice).createDID(didHashAlice, DID_URI);
    });

    it("transfers control to new address", async function () {
      await registry.connect(alice).changeController(didHashAlice, bob.address);
      expect(await registry.controllerOf(didHashAlice)).to.equal(bob.address);
    });

    it("emits DIDControllerChanged event", async function () {
      await expect(registry.connect(alice).changeController(didHashAlice, bob.address))
        .to.emit(registry, "DIDControllerChanged")
        .withArgs(didHashAlice, alice.address, bob.address);
    });

    it("new controller can update document", async function () {
      await registry.connect(alice).changeController(didHashAlice, bob.address);
      await registry.connect(bob).updateDocument(didHashAlice, DID_URI_2);
      const record = await registry.resolve(didHashAlice);
      expect(record.documentURI).to.equal(DID_URI_2);
    });

    it("old controller loses access", async function () {
      await registry.connect(alice).changeController(didHashAlice, bob.address);
      await expect(
        registry.connect(alice).updateDocument(didHashAlice, DID_URI_2)
      ).to.be.revertedWithCustomError(registry, "NotDIDController");
    });

    it("reverts transfer to zero address", async function () {
      await expect(
        registry.connect(alice).changeController(didHashAlice, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(registry, "NotDIDController");
    });
  });

  // ─────────────────────────────────────────────
  //  Biometric Binding
  // ─────────────────────────────────────────────

  describe("Biometric Binding", function () {
    const BIO_HASH = ethers.keccak256(ethers.toUtf8Bytes("biometric-template-alice-fingerprint"));
    const BIO_HASH_2 = ethers.keccak256(ethers.toUtf8Bytes("biometric-template-bob-fingerprint"));

    beforeEach(async function () {
      await registry.connect(alice).createDID(didHashAlice, DID_URI);
    });

    it("binds a biometric commitment", async function () {
      await registry.connect(alice).bindBiometric(didHashAlice, BIO_HASH);
      expect(await registry.biometricToDID(BIO_HASH)).to.equal(didHashAlice);
    });

    it("emits BiometricBound event", async function () {
      await expect(registry.connect(alice).bindBiometric(didHashAlice, BIO_HASH))
        .to.emit(registry, "BiometricBound")
        .withArgs(didHashAlice, BIO_HASH);
    });

    it("prevents duplicate biometric binding", async function () {
      await registry.connect(alice).bindBiometric(didHashAlice, BIO_HASH);

      // Bob creates a DID and tries to bind same biometric
      await registry.connect(bob).createDID(didHashBob, BOB_DID_URI);
      await expect(
        registry.connect(bob).bindBiometric(didHashBob, BIO_HASH)
      ).to.be.revertedWithCustomError(registry, "BiometricAlreadyBound");
    });

    it("allows different biometrics for different DIDs", async function () {
      await registry.connect(alice).bindBiometric(didHashAlice, BIO_HASH);
      await registry.connect(bob).createDID(didHashBob, BOB_DID_URI);
      await registry.connect(bob).bindBiometric(didHashBob, BIO_HASH_2);

      expect(await registry.biometricToDID(BIO_HASH)).to.equal(didHashAlice);
      expect(await registry.biometricToDID(BIO_HASH_2)).to.equal(didHashBob);
    });

    it("reverts with zero biometric hash", async function () {
      await expect(
        registry.connect(alice).bindBiometric(didHashAlice, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(registry, "InvalidDIDHash");
    });

    it("reverts when non-controller binds", async function () {
      await expect(
        registry.connect(attacker).bindBiometric(didHashAlice, BIO_HASH)
      ).to.be.revertedWithCustomError(registry, "NotDIDController");
    });
  });

  // ─────────────────────────────────────────────
  //  Admin Operations
  // ─────────────────────────────────────────────

  describe("Admin Operations", function () {
    beforeEach(async function () {
      await registry.connect(alice).createDID(didHashAlice, DID_URI);
    });

    it("admin can force-deactivate a DID", async function () {
      await registry.connect(owner).adminDeactivate(didHashAlice);
      expect(await registry.isActive(didHashAlice)).to.be.false;
    });

    it("non-admin cannot force-deactivate", async function () {
      await expect(
        registry.connect(attacker).adminDeactivate(didHashAlice)
      ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    });

    it("admin deactivate reverts for non-existent DID", async function () {
      await expect(
        registry.connect(owner).adminDeactivate(didHashBob)
      ).to.be.revertedWithCustomError(registry, "DIDNotFound");
    });

    it("admin deactivate reverts for already deactivated DID", async function () {
      await registry.connect(alice).deactivate(didHashAlice);
      await expect(
        registry.connect(owner).adminDeactivate(didHashAlice)
      ).to.be.revertedWithCustomError(registry, "DIDDeactivatedError");
    });
  });

  // ─────────────────────────────────────────────
  //  View Edge Cases
  // ─────────────────────────────────────────────

  describe("View Edge Cases", function () {
    it("isActive returns false for non-existent DID", async function () {
      expect(await registry.isActive(didHashAlice)).to.be.false;
    });

    it("controllerOf returns zero for non-existent DID", async function () {
      expect(await registry.controllerOf(didHashAlice)).to.equal(ethers.ZeroAddress);
    });

    it("resolve reverts for non-existent DID", async function () {
      await expect(
        registry.resolve(didHashAlice)
      ).to.be.revertedWithCustomError(registry, "DIDNotFound");
    });

    it("biometricToDID returns zero for unbound biometric", async function () {
      const fakeHash = ethers.keccak256(ethers.toUtf8Bytes("fake"));
      expect(await registry.biometricToDID(fakeHash)).to.equal(ethers.ZeroHash);
    });

    it("getDIDsByController returns empty for unknown controller", async function () {
      const dids = await registry.getDIDsByController(attacker.address);
      expect(dids).to.have.lengthOf(0);
    });
  });
});
