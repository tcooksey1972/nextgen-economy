/**
 * @file AssetRegistry.test.js
 * @description Tests for the AssetRegistry module via the SimpleAssetManager contract.
 *
 * Covers: asset registration (unique + fungible), metadata storage, sequential IDs,
 * status management, location/department updates, disposal with burn, pause/unpause,
 * access control, and view edge cases.
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AssetRegistry", function () {
  // ─── Constants ───
  const BASE_URI = "https://api.nextgen.economy/assets/";
  const TOKEN_URI = "ipfs://QmAsset001";
  const COST = ethers.parseEther("10000"); // $10,000 in stablecoin units
  const USEFUL_LIFE = 60; // 5 years

  let manager, owner, alice, bob, attacker;

  beforeEach(async function () {
    [owner, alice, bob, attacker] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("SimpleAssetManager");
    manager = await Factory.deploy(BASE_URI);
    await manager.waitForDeployment();
  });

  // ═══════════════════════════════════════════
  //  Deployment
  // ═══════════════════════════════════════════
  describe("Deployment", function () {
    it("sets the deployer as owner", async function () {
      expect(await manager.owner()).to.equal(owner.address);
    });

    it("starts with zero assets", async function () {
      expect(await manager.assetCount()).to.equal(0);
    });
  });

  // ═══════════════════════════════════════════
  //  Asset Registration
  // ═══════════════════════════════════════════
  describe("Registration", function () {
    it("registers a unique equipment asset", async function () {
      await manager.registerAsset(
        alice.address, 1, 0, COST, USEFUL_LIFE,
        "Engineering", "Building A", TOKEN_URI
      );
      expect(await manager.assetCount()).to.equal(1);
      expect(await manager.balanceOf(alice.address, 0)).to.equal(1);
    });

    it("registers fungible inventory with multiple units", async function () {
      await manager.registerAsset(
        alice.address, 500, 1, ethers.parseEther("50"), 0,
        "Warehouse", "Shelf B3", TOKEN_URI
      );
      expect(await manager.balanceOf(alice.address, 0)).to.equal(500);
    });

    it("assigns sequential token IDs", async function () {
      await manager.registerAsset(
        alice.address, 1, 0, COST, USEFUL_LIFE,
        "Engineering", "Building A", TOKEN_URI
      );
      await manager.registerAsset(
        bob.address, 100, 1, ethers.parseEther("100"), 0,
        "Sales", "Warehouse C", ""
      );
      expect(await manager.assetCount()).to.equal(2);
      expect(await manager.balanceOf(alice.address, 0)).to.equal(1);
      expect(await manager.balanceOf(bob.address, 1)).to.equal(100);
    });

    it("stores metadata correctly", async function () {
      await manager.registerAsset(
        alice.address, 1, 0, COST, USEFUL_LIFE,
        "Engineering", "Building A", TOKEN_URI
      );
      const meta = await manager.assetMetadata(0);
      expect(meta.assetClass).to.equal(0); // UniqueEquipment
      expect(meta.status).to.equal(0); // Active
      expect(meta.acquisitionCost).to.equal(COST);
      expect(meta.usefulLifeMonths).to.equal(USEFUL_LIFE);
      expect(meta.department).to.equal("Engineering");
      expect(meta.location).to.equal("Building A");
    });

    it("emits AssetRegistered event", async function () {
      await expect(
        manager.registerAsset(
          alice.address, 1, 0, COST, USEFUL_LIFE,
          "Engineering", "Building A", TOKEN_URI
        )
      ).to.emit(manager, "AssetRegistered")
        .withArgs(0, 0, 1, owner.address);
    });

    it("reverts with zero amount", async function () {
      await expect(
        manager.registerAsset(
          alice.address, 0, 1, COST, 0,
          "Sales", "Warehouse", TOKEN_URI
        )
      ).to.be.revertedWithCustomError(manager, "ZeroAmount");
    });

    it("reverts with zero address", async function () {
      await expect(
        manager.registerAsset(
          ethers.ZeroAddress, 1, 0, COST, USEFUL_LIFE,
          "Engineering", "Building A", TOKEN_URI
        )
      ).to.be.revertedWithCustomError(manager, "ZeroAddress");
    });

    it("reverts unique equipment with amount > 1", async function () {
      await expect(
        manager.registerAsset(
          alice.address, 5, 0, COST, USEFUL_LIFE,
          "Engineering", "Building A", TOKEN_URI
        )
      ).to.be.revertedWithCustomError(manager, "ZeroAmount");
    });

    it("reverts unique equipment with zero useful life", async function () {
      await expect(
        manager.registerAsset(
          alice.address, 1, 0, COST, 0,
          "Engineering", "Building A", TOKEN_URI
        )
      ).to.be.revertedWithCustomError(manager, "UsefulLifeRequired");
    });

    it("reverts when non-owner registers", async function () {
      await expect(
        manager.connect(attacker).registerAsset(
          alice.address, 1, 0, COST, USEFUL_LIFE,
          "Engineering", "Building A", TOKEN_URI
        )
      ).to.be.revertedWithCustomError(manager, "OwnableUnauthorizedAccount");
    });
  });

  // ═══════════════════════════════════════════
  //  Status Management
  // ═══════════════════════════════════════════
  describe("Status Management", function () {
    beforeEach(async function () {
      await manager.registerAsset(
        alice.address, 1, 0, COST, USEFUL_LIFE,
        "Engineering", "Building A", TOKEN_URI
      );
    });

    it("changes asset status", async function () {
      await manager.setAssetStatus(0, 2); // InTransit
      expect(await manager.assetStatus(0)).to.equal(2);
    });

    it("emits AssetStatusChanged event", async function () {
      await expect(manager.setAssetStatus(0, 1))
        .to.emit(manager, "AssetStatusChanged")
        .withArgs(0, 0, 1, owner.address);
    });

    it("updates location", async function () {
      await manager.updateLocation(0, "Building B");
      const meta = await manager.assetMetadata(0);
      expect(meta.location).to.equal("Building B");
    });

    it("updates department", async function () {
      await manager.updateDepartment(0, "Operations");
      const meta = await manager.assetMetadata(0);
      expect(meta.department).to.equal("Operations");
    });

    it("reverts status change for non-existent asset", async function () {
      await expect(
        manager.setAssetStatus(999, 1)
      ).to.be.revertedWithCustomError(manager, "AssetNotFound");
    });

    it("reverts when non-owner changes status", async function () {
      await expect(
        manager.connect(attacker).setAssetStatus(0, 1)
      ).to.be.revertedWithCustomError(manager, "OwnableUnauthorizedAccount");
    });
  });

  // ═══════════════════════════════════════════
  //  Disposal
  // ═══════════════════════════════════════════
  describe("Disposal", function () {
    beforeEach(async function () {
      await manager.registerAsset(
        alice.address, 100, 1, ethers.parseEther("500"), 0,
        "Warehouse", "Shelf A", TOKEN_URI
      );
    });

    it("burns partial inventory", async function () {
      await manager.disposeAsset(alice.address, 0, 30, 0);
      expect(await manager.balanceOf(alice.address, 0)).to.equal(70);
    });

    it("marks as Disposed when all supply burned", async function () {
      await manager.disposeAsset(alice.address, 0, 100, 0);
      expect(await manager.assetStatus(0)).to.equal(4); // Disposed
    });

    it("emits AssetDisposed event", async function () {
      await expect(manager.disposeAsset(alice.address, 0, 50, ethers.parseEther("100")))
        .to.emit(manager, "AssetDisposed")
        .withArgs(0, 50, ethers.parseEther("100"), owner.address);
    });

    it("reverts with insufficient balance", async function () {
      await expect(
        manager.disposeAsset(alice.address, 0, 200, 0)
      ).to.be.revertedWithCustomError(manager, "InsufficientBalance");
    });
  });

  // ═══════════════════════════════════════════
  //  Pause / Unpause
  // ═══════════════════════════════════════════
  describe("Pausable", function () {
    it("pauses and blocks transfers", async function () {
      await manager.registerAsset(
        alice.address, 10, 1, ethers.parseEther("100"), 0,
        "Sales", "Floor 1", ""
      );
      await manager.pause();

      await expect(
        manager.connect(alice).safeTransferFrom(
          alice.address, bob.address, 0, 5, "0x"
        )
      ).to.be.revertedWithCustomError(manager, "EnforcedPause");
    });

    it("unpauses and allows transfers", async function () {
      await manager.registerAsset(
        alice.address, 10, 1, ethers.parseEther("100"), 0,
        "Sales", "Floor 1", ""
      );
      await manager.pause();
      await manager.unpause();

      await manager.connect(alice).safeTransferFrom(
        alice.address, bob.address, 0, 5, "0x"
      );
      expect(await manager.balanceOf(bob.address, 0)).to.equal(5);
    });
  });

  // ═══════════════════════════════════════════
  //  View Edge Cases
  // ═══════════════════════════════════════════
  describe("View Edge Cases", function () {
    it("isAssetActive returns false for non-existent asset", async function () {
      expect(await manager.isAssetActive(999)).to.equal(false);
    });

    it("assetMetadata reverts for non-existent asset", async function () {
      await expect(
        manager.assetMetadata(999)
      ).to.be.revertedWithCustomError(manager, "AssetNotFound");
    });
  });
});
