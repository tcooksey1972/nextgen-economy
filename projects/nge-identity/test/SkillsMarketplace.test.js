/**
 * @file SkillsMarketplace.test.js
 * @description Hardhat test suite for the SkillsMarketplace contract.
 *
 * Covers: listing creation, engagement lifecycle, escrow, pull-pattern
 * withdrawals, dispute resolution, rating system, and credential verification.
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SkillsMarketplace", function () {
  const DESCRIPTION_URI = "ipfs://QmListingDescription001";
  const METADATA_URI = "https://nge.cloud-creations.com/credentials/cred-001.json";
  const PLATFORM_FEE_BPS = 250; // 2.5%

  let credRegistry, marketplace;
  let owner, worker, client, treasury, attacker;
  let workerDID, clientDID, issuerDID;
  let listingId, engagementId, credentialId;

  beforeEach(async function () {
    [owner, worker, client, treasury, attacker] = await ethers.getSigners();

    // Deploy CredentialRegistry
    const CredFactory = await ethers.getContractFactory("CredentialRegistry");
    credRegistry = await CredFactory.deploy();
    await credRegistry.waitForDeployment();

    // Deploy SkillsMarketplace
    const MarketFactory = await ethers.getContractFactory("SkillsMarketplace");
    marketplace = await MarketFactory.deploy(
      await credRegistry.getAddress(),
      treasury.address,
      PLATFORM_FEE_BPS
    );
    await marketplace.waitForDeployment();

    // Setup DIDs
    workerDID = ethers.keccak256(ethers.toUtf8Bytes("did:web:worker-maria"));
    clientDID = ethers.keccak256(ethers.toUtf8Bytes("did:web:client-hospital"));
    issuerDID = ethers.keccak256(ethers.toUtf8Bytes("did:web:university.edu"));

    // Setup credential
    credentialId = ethers.keccak256(ethers.toUtf8Bytes("cred-nursing-license"));
    listingId = ethers.keccak256(ethers.toUtf8Bytes("listing-001"));
    engagementId = ethers.keccak256(ethers.toUtf8Bytes("engagement-001"));

    // Register trusted issuer and issue a credential
    await credRegistry.addTrustedIssuer(issuerDID);
    const credHash = ethers.keccak256(ethers.toUtf8Bytes("nursing-license-vc"));
    await credRegistry.issueCredential(
      credentialId, issuerDID, workerDID, credHash, 1, 0, METADATA_URI
    );
  });

  // ─────────────────────────────────────────────
  //  Listing Creation
  // ─────────────────────────────────────────────

  describe("Listing Creation", function () {
    it("creates a listing with verified credentials", async function () {
      await marketplace.connect(worker).createListing(
        listingId, workerDID, "Registered Nurse",
        DESCRIPTION_URI, [credentialId], 1, // CONTRACT_WORK
        ethers.parseEther("0.05"), true
      );
      expect(await marketplace.listingCount()).to.equal(1);
    });

    it("emits ListingCreated event", async function () {
      await expect(
        marketplace.connect(worker).createListing(
          listingId, workerDID, "RN Services",
          DESCRIPTION_URI, [credentialId], 0,
          ethers.parseEther("0.05"), true
        )
      ).to.emit(marketplace, "ListingCreated")
        .withArgs(listingId, workerDID, 0);
    });

    it("sets CREDENTIAL_VERIFIED tier with valid credential", async function () {
      await marketplace.connect(worker).createListing(
        listingId, workerDID, "RN Services",
        DESCRIPTION_URI, [credentialId], 0,
        ethers.parseEther("0.05"), true
      );
      const listing = await marketplace.getListing(listingId);
      expect(listing.verificationLevel).to.equal(2); // CREDENTIAL_VERIFIED
    });

    it("sets UNVERIFIED tier with no credentials", async function () {
      await marketplace.connect(worker).createListing(
        listingId, workerDID, "House Cleaning",
        DESCRIPTION_URI, [], 0,
        ethers.parseEther("0.01"), true
      );
      const listing = await marketplace.getListing(listingId);
      expect(listing.verificationLevel).to.equal(0); // UNVERIFIED
    });

    it("stores listing data correctly", async function () {
      await marketplace.connect(worker).createListing(
        listingId, workerDID, "RN Services",
        DESCRIPTION_URI, [credentialId], 1,
        ethers.parseEther("0.05"), false
      );
      const listing = await marketplace.getListing(listingId);
      expect(listing.workerDID).to.equal(workerDID);
      expect(listing.title).to.equal("RN Services");
      expect(listing.descriptionURI).to.equal(DESCRIPTION_URI);
      expect(listing.lType).to.equal(1); // CONTRACT_WORK
      expect(listing.rateWei).to.equal(ethers.parseEther("0.05"));
      expect(listing.isHourly).to.be.false;
      expect(listing.status).to.equal(0); // OPEN
    });

    it("reverts duplicate listing ID", async function () {
      await marketplace.connect(worker).createListing(
        listingId, workerDID, "RN", DESCRIPTION_URI, [], 0,
        ethers.parseEther("0.01"), true
      );
      await expect(
        marketplace.connect(worker).createListing(
          listingId, workerDID, "RN2", DESCRIPTION_URI, [], 0,
          ethers.parseEther("0.01"), true
        )
      ).to.be.revertedWithCustomError(marketplace, "ListingAlreadyExists");
    });

    it("cancels an open listing", async function () {
      await marketplace.connect(worker).createListing(
        listingId, workerDID, "RN", DESCRIPTION_URI, [], 0,
        ethers.parseEther("0.01"), true
      );
      await marketplace.connect(worker).cancelListing(listingId);
      const listing = await marketplace.getListing(listingId);
      expect(listing.status).to.equal(5); // CANCELLED
    });
  });

  // ─────────────────────────────────────────────
  //  Engagement Lifecycle
  // ─────────────────────────────────────────────

  describe("Engagement Lifecycle", function () {
    const ESCROW = ethers.parseEther("1.0");

    beforeEach(async function () {
      await marketplace.connect(worker).createListing(
        listingId, workerDID, "RN Services",
        DESCRIPTION_URI, [credentialId], 0,
        ethers.parseEther("0.05"), true
      );
    });

    it("engages a worker with escrow", async function () {
      await marketplace.connect(client).engageWorker(
        engagementId, listingId, clientDID, { value: ESCROW }
      );
      expect(await marketplace.engagementCount()).to.equal(1);
    });

    it("emits EngagementStarted event", async function () {
      await expect(
        marketplace.connect(client).engageWorker(
          engagementId, listingId, clientDID, { value: ESCROW }
        )
      ).to.emit(marketplace, "EngagementStarted")
        .withArgs(engagementId, listingId, clientDID);
    });

    it("stores engagement data correctly", async function () {
      await marketplace.connect(client).engageWorker(
        engagementId, listingId, clientDID, { value: ESCROW }
      );
      const eng = await marketplace.getEngagement(engagementId);
      expect(eng.listingId).to.equal(listingId);
      expect(eng.clientDID).to.equal(clientDID);
      expect(eng.workerDID).to.equal(workerDID);
      expect(eng.escrowAmount).to.equal(ESCROW);
      expect(eng.completedAt).to.equal(0);
      expect(eng.clientApproved).to.be.false;
      expect(eng.disputed).to.be.false;
    });

    it("updates listing status to IN_PROGRESS", async function () {
      await marketplace.connect(client).engageWorker(
        engagementId, listingId, clientDID, { value: ESCROW }
      );
      const listing = await marketplace.getListing(listingId);
      expect(listing.status).to.equal(2); // IN_PROGRESS
    });

    it("reverts with zero escrow", async function () {
      await expect(
        marketplace.connect(client).engageWorker(
          engagementId, listingId, clientDID, { value: 0 }
        )
      ).to.be.revertedWithCustomError(marketplace, "MustFundEscrow");
    });

    it("reverts engagement on non-open listing", async function () {
      await marketplace.connect(client).engageWorker(
        engagementId, listingId, clientDID, { value: ESCROW }
      );
      const eng2 = ethers.keccak256(ethers.toUtf8Bytes("engagement-002"));
      await expect(
        marketplace.connect(client).engageWorker(
          eng2, listingId, clientDID, { value: ESCROW }
        )
      ).to.be.revertedWithCustomError(marketplace, "ListingNotOpen");
    });
  });

  // ─────────────────────────────────────────────
  //  Completion & Pull-Pattern Withdrawals
  // ─────────────────────────────────────────────

  describe("Completion & Withdrawals", function () {
    const ESCROW = ethers.parseEther("1.0");

    beforeEach(async function () {
      await marketplace.connect(worker).createListing(
        listingId, workerDID, "RN Services",
        DESCRIPTION_URI, [credentialId], 0,
        ethers.parseEther("0.05"), true
      );
      await marketplace.connect(client).engageWorker(
        engagementId, listingId, clientDID, { value: ESCROW }
      );
    });

    it("completes an engagement", async function () {
      await marketplace.connect(client).completeEngagement(engagementId, 5);
      const eng = await marketplace.getEngagement(engagementId);
      expect(eng.clientApproved).to.be.true;
      expect(eng.completedAt).to.be.greaterThan(0);
    });

    it("emits EngagementCompleted and WorkerRated events", async function () {
      const fee = (ESCROW * BigInt(PLATFORM_FEE_BPS)) / 10000n;
      const payout = ESCROW - fee;

      const tx = marketplace.connect(client).completeEngagement(engagementId, 4);
      await expect(tx)
        .to.emit(marketplace, "EngagementCompleted")
        .withArgs(engagementId, payout);
      await expect(tx)
        .to.emit(marketplace, "WorkerRated")
        .withArgs(workerDID, engagementId, 4);
    });

    it("credits worker pending withdrawal correctly", async function () {
      const fee = (ESCROW * BigInt(PLATFORM_FEE_BPS)) / 10000n;
      const payout = ESCROW - fee;

      await marketplace.connect(client).completeEngagement(engagementId, 5);
      expect(await marketplace.pendingWithdrawals(worker.address)).to.equal(payout);
    });

    it("credits treasury pending withdrawal correctly", async function () {
      const fee = (ESCROW * BigInt(PLATFORM_FEE_BPS)) / 10000n;

      await marketplace.connect(client).completeEngagement(engagementId, 5);
      expect(await marketplace.pendingWithdrawals(treasury.address)).to.equal(fee);
    });

    it("worker can withdraw funds", async function () {
      await marketplace.connect(client).completeEngagement(engagementId, 5);
      const pending = await marketplace.pendingWithdrawals(worker.address);

      const balanceBefore = await ethers.provider.getBalance(worker.address);
      const tx = await marketplace.connect(worker).withdraw();
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(worker.address);

      expect(balanceAfter + gasUsed - balanceBefore).to.equal(pending);
      expect(await marketplace.pendingWithdrawals(worker.address)).to.equal(0);
    });

    it("treasury can withdraw fees", async function () {
      await marketplace.connect(client).completeEngagement(engagementId, 5);
      const pending = await marketplace.pendingWithdrawals(treasury.address);
      expect(pending).to.be.greaterThan(0);

      await marketplace.connect(treasury).withdraw();
      expect(await marketplace.pendingWithdrawals(treasury.address)).to.equal(0);
    });

    it("reverts withdrawal with no balance", async function () {
      await expect(
        marketplace.connect(attacker).withdraw()
      ).to.be.revertedWithCustomError(marketplace, "NothingToWithdraw");
    });

    it("reverts completing already completed engagement", async function () {
      await marketplace.connect(client).completeEngagement(engagementId, 5);
      await expect(
        marketplace.connect(client).completeEngagement(engagementId, 5)
      ).to.be.revertedWithCustomError(marketplace, "EngagementAlreadyCompleted");
    });

    it("reverts with invalid rating", async function () {
      await expect(
        marketplace.connect(client).completeEngagement(engagementId, 0)
      ).to.be.revertedWithCustomError(marketplace, "InvalidRating");
      await expect(
        marketplace.connect(client).completeEngagement(engagementId, 6)
      ).to.be.revertedWithCustomError(marketplace, "InvalidRating");
    });
  });

  // ─────────────────────────────────────────────
  //  Dispute Resolution
  // ─────────────────────────────────────────────

  describe("Dispute Resolution", function () {
    const ESCROW = ethers.parseEther("0.5");

    beforeEach(async function () {
      await marketplace.connect(worker).createListing(
        listingId, workerDID, "Cleaning",
        DESCRIPTION_URI, [], 0,
        ethers.parseEther("0.01"), true
      );
      await marketplace.connect(client).engageWorker(
        engagementId, listingId, clientDID, { value: ESCROW }
      );
    });

    it("raises a dispute", async function () {
      await marketplace.connect(client).raiseDispute(engagementId, clientDID);
      const eng = await marketplace.getEngagement(engagementId);
      expect(eng.disputed).to.be.true;
    });

    it("emits DisputeRaised event", async function () {
      await expect(
        marketplace.connect(client).raiseDispute(engagementId, clientDID)
      ).to.emit(marketplace, "DisputeRaised")
        .withArgs(engagementId, clientDID);
    });

    it("prevents completion of disputed engagement", async function () {
      await marketplace.connect(client).raiseDispute(engagementId, clientDID);
      await expect(
        marketplace.connect(client).completeEngagement(engagementId, 3)
      ).to.be.revertedWithCustomError(marketplace, "EngagementDisputed");
    });

    it("updates listing status to DISPUTED", async function () {
      await marketplace.connect(client).raiseDispute(engagementId, clientDID);
      const listing = await marketplace.getListing(listingId);
      expect(listing.status).to.equal(4); // DISPUTED
    });
  });

  // ─────────────────────────────────────────────
  //  Rating System
  // ─────────────────────────────────────────────

  describe("Rating System", function () {
    it("accumulates ratings across engagements", async function () {
      // Create multiple listings and engagements
      for (let i = 0; i < 3; i++) {
        const lId = ethers.keccak256(ethers.toUtf8Bytes(`listing-${i}`));
        const eId = ethers.keccak256(ethers.toUtf8Bytes(`engagement-${i}`));
        const escrow = ethers.parseEther("0.1");

        await marketplace.connect(worker).createListing(
          lId, workerDID, `Service ${i}`,
          DESCRIPTION_URI, [], 0,
          ethers.parseEther("0.01"), true
        );
        await marketplace.connect(client).engageWorker(
          eId, lId, clientDID, { value: escrow }
        );
        await marketplace.connect(client).completeEngagement(eId, i + 3); // ratings: 3, 4, 5
      }

      const [total, count] = await marketplace.getWorkerRating(workerDID);
      expect(count).to.equal(3);
      expect(total).to.equal(12); // 3 + 4 + 5
    });
  });

  // ─────────────────────────────────────────────
  //  Admin Functions
  // ─────────────────────────────────────────────

  describe("Admin Functions", function () {
    it("owner can update platform fee", async function () {
      await marketplace.updatePlatformFee(500);
      expect(await marketplace.platformFeeBps()).to.equal(500);
    });

    it("reverts fee update above 10%", async function () {
      await expect(marketplace.updatePlatformFee(1001)).to.be.reverted;
    });

    it("non-owner cannot update fee", async function () {
      await expect(
        marketplace.connect(attacker).updatePlatformFee(100)
      ).to.be.revertedWithCustomError(marketplace, "OwnableUnauthorizedAccount");
    });

    it("owner can update treasury", async function () {
      await marketplace.updateTreasury(attacker.address);
      expect(await marketplace.treasury()).to.equal(attacker.address);
    });
  });
});
