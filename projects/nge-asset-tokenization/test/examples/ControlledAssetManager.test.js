/**
 * @file ControlledAssetManager.test.js
 * @description Tests for the role-based controlled asset management contract.
 *
 * Covers government/military use cases: ammunition accountability,
 * chain-of-custody transfers, physical count inspections, and
 * multi-role access control (Property Officer, Accountant, Custodian, Inspector).
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ControlledAssetManager", function () {
  const BASE_URI = "https://api.nextgen.economy/assets/";
  const AMMO_COST = ethers.parseEther("50000"); // $50,000 ammo lot
  const QR_HASH = ethers.keccak256(ethers.toUtf8Bytes("QR:AMMO-LOT-2026-001"));

  // Role hashes
  const PROPERTY_OFFICER = ethers.keccak256(ethers.toUtf8Bytes("PROPERTY_OFFICER"));
  const ACCOUNTANT = ethers.keccak256(ethers.toUtf8Bytes("ACCOUNTANT"));
  const CUSTODIAN = ethers.keccak256(ethers.toUtf8Bytes("CUSTODIAN"));
  const INSPECTOR = ethers.keccak256(ethers.toUtf8Bytes("INSPECTOR"));

  let manager, admin, propertyOfficer, accountant, custodian, inspector, armory, unitA, attacker;

  beforeEach(async function () {
    [admin, propertyOfficer, accountant, custodian, inspector, armory, unitA, attacker] =
      await ethers.getSigners();

    const Factory = await ethers.getContractFactory("ControlledAssetManager");
    manager = await Factory.deploy(BASE_URI);
    await manager.waitForDeployment();

    // Grant roles to separate addresses (admin has all by default)
    await manager.grantRole(PROPERTY_OFFICER, propertyOfficer.address);
    await manager.grantRole(ACCOUNTANT, accountant.address);
    await manager.grantRole(CUSTODIAN, custodian.address);
    await manager.grantRole(INSPECTOR, inspector.address);
  });

  // Helper: register an ammo lot and record acquisition
  async function setupAmmoLot(amount) {
    await manager.connect(propertyOfficer).registerAsset(
      armory.address, amount, 1, AMMO_COST, 0,
      "Armory", "Building 42", ""
    );
    await manager.connect(accountant).recordAcquisition(0, AMMO_COST);
    return 0; // tokenId
  }

  // ═══════════════════════════════════════════
  //  Role-Based Access Control
  // ═══════════════════════════════════════════
  describe("Access Control", function () {
    it("admin has all roles by default", async function () {
      expect(await manager.hasRole(PROPERTY_OFFICER, admin.address)).to.be.true;
      expect(await manager.hasRole(ACCOUNTANT, admin.address)).to.be.true;
      expect(await manager.hasRole(CUSTODIAN, admin.address)).to.be.true;
      expect(await manager.hasRole(INSPECTOR, admin.address)).to.be.true;
    });

    it("property officer can register assets", async function () {
      await manager.connect(propertyOfficer).registerAsset(
        armory.address, 10000, 1, AMMO_COST, 0,
        "Armory", "Building 42", ""
      );
      expect(await manager.assetCount()).to.equal(1);
    });

    it("accountant can record entries but not register assets", async function () {
      await setupAmmoLot(10000);
      await manager.connect(accountant).recordRevaluation(0, ethers.parseEther("48000"));
      expect(await manager.bookValue(0)).to.equal(ethers.parseEther("48000"));

      // Cannot register
      await expect(
        manager.connect(accountant).registerAsset(
          armory.address, 100, 1, AMMO_COST, 0, "X", "Y", ""
        )
      ).to.be.revertedWithCustomError(manager, "AccessControlUnauthorizedAccount");
    });

    it("attacker cannot perform any privileged action", async function () {
      await expect(
        manager.connect(attacker).registerAsset(
          armory.address, 100, 1, AMMO_COST, 0, "X", "Y", ""
        )
      ).to.be.revertedWithCustomError(manager, "AccessControlUnauthorizedAccount");
    });
  });

  // ═══════════════════════════════════════════
  //  Ammunition Accountability
  // ═══════════════════════════════════════════
  describe("Ammunition Accountability", function () {
    beforeEach(async function () {
      await setupAmmoLot(10000);
    });

    it("registers 10,000 rounds in armory", async function () {
      expect(await manager.balanceOf(armory.address, 0)).to.equal(10000);
      const meta = await manager.assetMetadata(0);
      expect(meta.department).to.equal("Armory");
    });

    it("custodian issues 500 rounds to a unit", async function () {
      // Armory must approve custodian to transfer on their behalf
      await manager.connect(armory).setApprovalForAll(await manager.getAddress(), true);

      await manager.connect(custodian).issueItems(
        armory.address, unitA.address, 0, 500, "Training exercise 2026-03"
      );

      expect(await manager.balanceOf(armory.address, 0)).to.equal(9500);
      expect(await manager.balanceOf(unitA.address, 0)).to.equal(500);
    });

    it("emits ItemsIssued event", async function () {
      await manager.connect(armory).setApprovalForAll(await manager.getAddress(), true);

      await expect(
        manager.connect(custodian).issueItems(
          armory.address, unitA.address, 0, 500, "Range day"
        )
      ).to.emit(manager, "ItemsIssued")
        .withArgs(0, armory.address, unitA.address, 500, "Range day");
    });

    it("custodian records return with expended rounds", async function () {
      await manager.connect(armory).setApprovalForAll(await manager.getAddress(), true);
      await manager.connect(custodian).issueItems(
        armory.address, unitA.address, 0, 500, "Training"
      );

      // Unit returns 480, expended 20
      await manager.connect(unitA).setApprovalForAll(await manager.getAddress(), true);
      await manager.connect(custodian).returnItems(
        unitA.address, armory.address, 0, 480, 20, "20 rounds expended at range"
      );

      expect(await manager.balanceOf(unitA.address, 0)).to.equal(0);
      expect(await manager.balanceOf(armory.address, 0)).to.equal(9980);
      // 20 burned — total supply reduced
      expect(await manager.totalSupply(0)).to.equal(9980);
    });

    it("emits ItemsReturned event", async function () {
      await manager.connect(armory).setApprovalForAll(await manager.getAddress(), true);
      await manager.connect(custodian).issueItems(
        armory.address, unitA.address, 0, 500, "Training"
      );
      await manager.connect(unitA).setApprovalForAll(await manager.getAddress(), true);

      await expect(
        manager.connect(custodian).returnItems(
          unitA.address, armory.address, 0, 480, 20, "Range complete"
        )
      ).to.emit(manager, "ItemsReturned")
        .withArgs(0, unitA.address, armory.address, 480, 20, "Range complete");
    });

    it("reverts return exceeding issued amount", async function () {
      await manager.connect(armory).setApprovalForAll(await manager.getAddress(), true);
      await manager.connect(custodian).issueItems(
        armory.address, unitA.address, 0, 500, "Training"
      );
      await manager.connect(unitA).setApprovalForAll(await manager.getAddress(), true);

      await expect(
        manager.connect(custodian).returnItems(
          unitA.address, armory.address, 0, 400, 200, "Too many"
        )
      ).to.be.revertedWithCustomError(manager, "ReturnExceedsIssued");
    });

    it("non-custodian cannot issue items", async function () {
      await expect(
        manager.connect(attacker).issueItems(
          armory.address, unitA.address, 0, 100, "Theft attempt"
        )
      ).to.be.revertedWithCustomError(manager, "AccessControlUnauthorizedAccount");
    });
  });

  // ═══════════════════════════════════════════
  //  Physical Count Inspection
  // ═══════════════════════════════════════════
  describe("Inspection", function () {
    beforeEach(async function () {
      await setupAmmoLot(10000);
    });

    it("inspector records matching physical count", async function () {
      await expect(
        manager.connect(inspector).recordInspection(0, armory.address, 10000)
      ).to.emit(manager, "InspectionRecorded")
        .withArgs(0, armory.address, 10000, 10000, false, inspector.address);
    });

    it("inspector records discrepancy", async function () {
      await expect(
        manager.connect(inspector).recordInspection(0, armory.address, 9990)
      ).to.emit(manager, "InspectionRecorded")
        .withArgs(0, armory.address, 9990, 10000, true, inspector.address);
    });

    it("non-inspector cannot record inspection", async function () {
      await expect(
        manager.connect(attacker).recordInspection(0, armory.address, 10000)
      ).to.be.revertedWithCustomError(manager, "AccessControlUnauthorizedAccount");
    });
  });

  // ═══════════════════════════════════════════
  //  QR Code Integration
  // ═══════════════════════════════════════════
  describe("QR Code / Identifier Linking", function () {
    it("property officer links QR code to ammo lot", async function () {
      await setupAmmoLot(10000);
      await manager.connect(propertyOfficer).linkIdentifier(QR_HASH, 0, 0);

      expect(await manager.resolve(QR_HASH)).to.equal(0);
      expect(await manager.identifierCount(0)).to.equal(1);
    });

    it("accountant cannot link identifiers", async function () {
      await setupAmmoLot(10000);
      await expect(
        manager.connect(accountant).linkIdentifier(QR_HASH, 0, 0)
      ).to.be.revertedWithCustomError(manager, "AccessControlUnauthorizedAccount");
    });
  });

  // ═══════════════════════════════════════════
  //  End-to-End: Ammunition Lifecycle
  // ═══════════════════════════════════════════
  describe("End-to-End: Ammunition Lifecycle", function () {
    it("full lifecycle: register > link > issue > return > inspect > dispose", async function () {
      // 1. Property officer registers ammo lot
      await manager.connect(propertyOfficer).registerAsset(
        armory.address, 10000, 1, AMMO_COST, 0,
        "Armory", "Building 42", "ipfs://ammo-lot-001"
      );

      // 2. Accountant records acquisition
      await manager.connect(accountant).recordAcquisition(0, AMMO_COST);
      expect(await manager.bookValue(0)).to.equal(AMMO_COST);

      // 3. Property officer links QR code
      await manager.connect(propertyOfficer).linkIdentifier(QR_HASH, 0, 0);

      // 4. Custodian issues 500 rounds
      await manager.connect(armory).setApprovalForAll(await manager.getAddress(), true);
      await manager.connect(custodian).issueItems(
        armory.address, unitA.address, 0, 500, "March training"
      );

      // 5. Custodian records return (480 back, 20 expended)
      await manager.connect(unitA).setApprovalForAll(await manager.getAddress(), true);
      await manager.connect(custodian).returnItems(
        unitA.address, armory.address, 0, 480, 20, "20 rounds expended"
      );

      // 6. Inspector verifies armory count
      await manager.connect(inspector).recordInspection(0, armory.address, 9980);

      // 7. Verify on-chain state
      expect(await manager.balanceOf(armory.address, 0)).to.equal(9980);
      expect(await manager.totalSupply(0)).to.equal(9980);
      expect(await manager.resolve(QR_HASH)).to.equal(0);
      expect(await manager.entryCount()).to.equal(1); // 1 acquisition entry

      // 8. Accountant records disposal of expended rounds
      await manager.connect(accountant).recordDisposal(0, 0);
      expect(await manager.bookValue(0)).to.equal(0);
    });
  });
});
