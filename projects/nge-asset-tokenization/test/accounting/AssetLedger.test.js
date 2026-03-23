const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AssetLedger", function () {
  const BASE_URI = "https://api.nextgen.economy/assets/";
  const COST = ethers.parseEther("12000"); // $12,000
  const USEFUL_LIFE = 12; // 12 months

  let manager, owner, alice;

  beforeEach(async function () {
    [owner, alice] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("SimpleAssetManager");
    manager = await Factory.deploy(BASE_URI);
    await manager.waitForDeployment();
  });

  // Helper: register + record acquisition
  async function setupAsset() {
    await manager.registerAsset(
      alice.address, 1, 0, COST, USEFUL_LIFE,
      "Engineering", "Building A", ""
    );
    await manager.recordAcquisition(0, COST);
  }

  // ═══════════════════════════════════════════
  //  Acquisition
  // ═══════════════════════════════════════════
  describe("Acquisition", function () {
    it("records acquisition and sets book value", async function () {
      await setupAsset();
      expect(await manager.bookValue(0)).to.equal(COST);
      expect(await manager.entryCount()).to.equal(1);
    });

    it("emits JournalEntryRecorded event", async function () {
      await manager.registerAsset(
        alice.address, 1, 0, COST, USEFUL_LIFE,
        "Engineering", "Building A", ""
      );
      await expect(manager.recordAcquisition(0, COST))
        .to.emit(manager, "JournalEntryRecorded")
        .withArgs(0, 0, 0, COST, 0); // entryId=0, tokenId=0, Acquisition, debit=COST, credit=0
    });

    it("stores journal entry correctly", async function () {
      await setupAsset();
      const entry = await manager.getEntry(0);
      expect(entry.tokenId).to.equal(0);
      expect(entry.entryType).to.equal(0); // Acquisition
      expect(entry.debitAmount).to.equal(COST);
      expect(entry.creditAmount).to.equal(0);
      expect(entry.recordedBy).to.equal(owner.address);
    });

    it("reverts with zero cost", async function () {
      await expect(
        manager.recordAcquisition(0, 0)
      ).to.be.revertedWithCustomError(manager, "InvalidEntryAmounts");
    });
  });

  // ═══════════════════════════════════════════
  //  Depreciation
  // ═══════════════════════════════════════════
  describe("Depreciation", function () {
    beforeEach(async function () {
      await setupAsset();
    });

    it("records one month of depreciation", async function () {
      await manager.recordDepreciation(0);
      const monthly = COST / BigInt(USEFUL_LIFE);
      expect(await manager.bookValue(0)).to.equal(COST - monthly);
      expect(await manager.accumulatedDepreciation(0)).to.equal(monthly);
      expect(await manager.depreciationPeriods(0)).to.equal(1);
    });

    it("emits DepreciationRecorded event", async function () {
      const monthly = COST / BigInt(USEFUL_LIFE);
      await expect(manager.recordDepreciation(0))
        .to.emit(manager, "DepreciationRecorded")
        .withArgs(0, 1, monthly, COST - monthly);
    });

    it("depreciates fully over useful life", async function () {
      for (let i = 0; i < USEFUL_LIFE; i++) {
        await manager.recordDepreciation(0);
      }
      expect(await manager.bookValue(0)).to.equal(0);
      expect(await manager.accumulatedDepreciation(0)).to.equal(COST);
      expect(await manager.depreciationPeriods(0)).to.equal(USEFUL_LIFE);
    });

    it("last period absorbs rounding remainder", async function () {
      // Use a cost that doesn't divide evenly: 10000 / 12 = 833.33...
      const oddCost = ethers.parseEther("10000");
      await manager.registerAsset(
        alice.address, 1, 0, oddCost, USEFUL_LIFE,
        "Finance", "Office", ""
      );
      await manager.recordAcquisition(1, oddCost);

      for (let i = 0; i < USEFUL_LIFE; i++) {
        await manager.recordDepreciation(1);
      }
      expect(await manager.bookValue(1)).to.equal(0);
      expect(await manager.accumulatedDepreciation(1)).to.equal(oddCost);
    });

    it("reverts when all periods exhausted", async function () {
      for (let i = 0; i < USEFUL_LIFE; i++) {
        await manager.recordDepreciation(0);
      }
      await expect(
        manager.recordDepreciation(0)
      ).to.be.revertedWithCustomError(manager, "DepreciationAlreadyCurrent");
    });

    it("reverts for non-depreciable asset", async function () {
      // Register fungible inventory with usefulLife=0
      await manager.registerAsset(
        alice.address, 100, 1, ethers.parseEther("500"), 0,
        "Warehouse", "Shelf A", ""
      );
      await manager.recordAcquisition(1, ethers.parseEther("500"));

      await expect(
        manager.recordDepreciation(1)
      ).to.be.revertedWithCustomError(manager, "AssetNotDepreciable");
    });
  });

  // ═══════════════════════════════════════════
  //  Revaluation
  // ═══════════════════════════════════════════
  describe("Revaluation", function () {
    beforeEach(async function () {
      await setupAsset();
    });

    it("records upward revaluation", async function () {
      const newValue = ethers.parseEther("15000");
      await manager.recordRevaluation(0, newValue);
      expect(await manager.bookValue(0)).to.equal(newValue);
    });

    it("records downward revaluation", async function () {
      const newValue = ethers.parseEther("8000");
      await manager.recordRevaluation(0, newValue);
      expect(await manager.bookValue(0)).to.equal(newValue);
    });

    it("no-ops when value unchanged", async function () {
      const countBefore = await manager.entryCount();
      await manager.recordRevaluation(0, COST);
      expect(await manager.entryCount()).to.equal(countBefore);
    });
  });

  // ═══════════════════════════════════════════
  //  Impairment
  // ═══════════════════════════════════════════
  describe("Impairment", function () {
    beforeEach(async function () {
      await setupAsset();
    });

    it("writes down book value", async function () {
      const impairment = ethers.parseEther("3000");
      await manager.recordImpairment(0, impairment);
      expect(await manager.bookValue(0)).to.equal(COST - impairment);
    });

    it("reverts with amount exceeding book value", async function () {
      const tooMuch = COST + ethers.parseEther("1");
      await expect(
        manager.recordImpairment(0, tooMuch)
      ).to.be.revertedWithCustomError(manager, "InvalidEntryAmounts");
    });

    it("reverts with zero amount", async function () {
      await expect(
        manager.recordImpairment(0, 0)
      ).to.be.revertedWithCustomError(manager, "InvalidEntryAmounts");
    });
  });

  // ═══════════════════════════════════════════
  //  Disposal
  // ═══════════════════════════════════════════
  describe("Disposal Entry", function () {
    beforeEach(async function () {
      await setupAsset();
    });

    it("records disposal with gain", async function () {
      const salePrice = ethers.parseEther("15000");
      await manager.recordDisposal(0, salePrice);
      expect(await manager.bookValue(0)).to.equal(0);

      const entry = await manager.getEntry(1); // entry 0 = acquisition
      expect(entry.entryType).to.equal(4); // Disposal
      expect(entry.debitAmount).to.equal(salePrice);
      expect(entry.creditAmount).to.equal(COST);
    });

    it("records disposal with loss", async function () {
      const salePrice = ethers.parseEther("5000");
      await manager.recordDisposal(0, salePrice);
      expect(await manager.bookValue(0)).to.equal(0);
    });
  });

  // ═══════════════════════════════════════════
  //  Transfer Entry
  // ═══════════════════════════════════════════
  describe("Transfer Entry", function () {
    it("records department transfer", async function () {
      await setupAsset();
      await manager.recordTransfer(0, "Engineering", "Operations");

      const entry = await manager.getEntry(1);
      expect(entry.entryType).to.equal(5); // Transfer
      expect(entry.memo).to.equal("Transfer: Engineering to Operations");
    });
  });
});
