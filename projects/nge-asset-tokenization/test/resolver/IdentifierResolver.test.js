const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IdentifierResolver", function () {
  const BASE_URI = "https://api.nextgen.economy/assets/";
  const COST = ethers.parseEther("5000");

  // Simulate QR code / UPN / serial hashes
  const QR_HASH = ethers.keccak256(ethers.toUtf8Bytes("QR:ASSET-001-BLDGA"));
  const UPN_HASH = ethers.keccak256(ethers.toUtf8Bytes("UPN:123456789012"));
  const SERIAL_HASH = ethers.keccak256(ethers.toUtf8Bytes("SN:XYZ-2026-00042"));
  const BARCODE_HASH = ethers.keccak256(ethers.toUtf8Bytes("BC:5901234123457"));

  let manager, owner, alice, attacker;

  beforeEach(async function () {
    [owner, alice, attacker] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("SimpleAssetManager");
    manager = await Factory.deploy(BASE_URI);
    await manager.waitForDeployment();

    // Register a test asset
    await manager.registerAsset(
      alice.address, 1, 0, COST, 36,
      "Engineering", "Building A", ""
    );
  });

  // ═══════════════════════════════════════════
  //  Link Identifier
  // ═══════════════════════════════════════════
  describe("Link Identifier", function () {
    it("links a QR code to an asset", async function () {
      await manager.linkIdentifier(QR_HASH, 0, 0); // QRCode = 0
      expect(await manager.isLinked(QR_HASH)).to.equal(true);
      expect(await manager.resolve(QR_HASH)).to.equal(0);
    });

    it("links a UPN to an asset", async function () {
      await manager.linkIdentifier(UPN_HASH, 0, 1); // UPN = 1
      const record = await manager.getIdentifier(UPN_HASH);
      expect(record.tokenId).to.equal(0);
      expect(record.idType).to.equal(1);
      expect(record.registeredBy).to.equal(owner.address);
    });

    it("links multiple identifiers to the same asset", async function () {
      await manager.linkIdentifier(QR_HASH, 0, 0);
      await manager.linkIdentifier(SERIAL_HASH, 0, 2); // SerialNumber = 2
      expect(await manager.identifierCount(0)).to.equal(2);
      expect(await manager.resolve(QR_HASH)).to.equal(0);
      expect(await manager.resolve(SERIAL_HASH)).to.equal(0);
    });

    it("emits IdentifierLinked event", async function () {
      await expect(manager.linkIdentifier(QR_HASH, 0, 0))
        .to.emit(manager, "IdentifierLinked")
        .withArgs(QR_HASH, 0, 0, owner.address);
    });

    it("reverts on duplicate link", async function () {
      await manager.linkIdentifier(QR_HASH, 0, 0);
      await expect(
        manager.linkIdentifier(QR_HASH, 0, 0)
      ).to.be.revertedWithCustomError(manager, "IdentifierAlreadyLinked");
    });

    it("reverts with zero identifier", async function () {
      await expect(
        manager.linkIdentifier(ethers.ZeroHash, 0, 0)
      ).to.be.revertedWithCustomError(manager, "ZeroIdentifier");
    });

    it("reverts when non-owner links", async function () {
      await expect(
        manager.connect(attacker).linkIdentifier(QR_HASH, 0, 0)
      ).to.be.revertedWithCustomError(manager, "OwnableUnauthorizedAccount");
    });
  });

  // ═══════════════════════════════════════════
  //  Unlink Identifier
  // ═══════════════════════════════════════════
  describe("Unlink Identifier", function () {
    beforeEach(async function () {
      await manager.linkIdentifier(QR_HASH, 0, 0);
    });

    it("unlinks an identifier", async function () {
      await manager.unlinkIdentifier(QR_HASH);
      expect(await manager.isLinked(QR_HASH)).to.equal(false);
      expect(await manager.identifierCount(0)).to.equal(0);
    });

    it("emits IdentifierUnlinked event", async function () {
      await expect(manager.unlinkIdentifier(QR_HASH))
        .to.emit(manager, "IdentifierUnlinked")
        .withArgs(QR_HASH, 0, owner.address);
    });

    it("reverts when unlinking non-existent", async function () {
      await expect(
        manager.unlinkIdentifier(SERIAL_HASH)
      ).to.be.revertedWithCustomError(manager, "IdentifierNotFound");
    });
  });

  // ═══════════════════════════════════════════
  //  Batch Link
  // ═══════════════════════════════════════════
  describe("Batch Link", function () {
    it("links multiple identifiers in one transaction", async function () {
      await manager.linkBatch(
        [QR_HASH, UPN_HASH, SERIAL_HASH],
        0,
        [0, 1, 2] // QRCode, UPN, SerialNumber
      );
      expect(await manager.identifierCount(0)).to.equal(3);
      expect(await manager.resolve(QR_HASH)).to.equal(0);
      expect(await manager.resolve(UPN_HASH)).to.equal(0);
      expect(await manager.resolve(SERIAL_HASH)).to.equal(0);
    });

    it("reverts on array length mismatch", async function () {
      await expect(
        manager.linkBatch([QR_HASH, UPN_HASH], 0, [0])
      ).to.be.reverted;
    });

    it("reverts on empty batch", async function () {
      await expect(
        manager.linkBatch([], 0, [])
      ).to.be.reverted;
    });
  });

  // ═══════════════════════════════════════════
  //  Resolve
  // ═══════════════════════════════════════════
  describe("Resolve", function () {
    it("reverts for unlinked identifier", async function () {
      await expect(
        manager.resolve(QR_HASH)
      ).to.be.revertedWithCustomError(manager, "IdentifierNotFound");
    });

    it("isLinked returns false for unknown hash", async function () {
      expect(await manager.isLinked(QR_HASH)).to.equal(false);
    });
  });

  // ═══════════════════════════════════════════
  //  Full Workflow
  // ═══════════════════════════════════════════
  describe("Full Workflow — Register, Link, Resolve", function () {
    it("end-to-end: register asset → link QR + serial → scan to resolve", async function () {
      // Asset already registered in beforeEach (tokenId=0)

      // Link QR code and serial number
      await manager.linkIdentifier(QR_HASH, 0, 0);
      await manager.linkIdentifier(SERIAL_HASH, 0, 2);

      // Simulate scanning: hash the raw identifier, call resolve
      const scannedQR = ethers.keccak256(ethers.toUtf8Bytes("QR:ASSET-001-BLDGA"));
      const tokenId = await manager.resolve(scannedQR);
      expect(tokenId).to.equal(0);

      // Look up asset details using resolved token ID
      const meta = await manager.assetMetadata(tokenId);
      expect(meta.department).to.equal("Engineering");
      expect(meta.location).to.equal("Building A");
      expect(meta.status).to.equal(0); // Active
    });
  });
});
