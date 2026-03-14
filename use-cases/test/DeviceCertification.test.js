/**
 * @file DeviceCertification.test.js
 * @description Tests for the Device Certification Voting use case.
 *
 * Covers: role management, proposal creation, voting, finalization,
 * certification, revocation, and edge cases.
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { mine } = require("@nomicfoundation/hardhat-network-helpers");

describe("DeviceCertification", function () {
  const VOTING_PERIOD = 100;       // blocks
  const APPROVAL_THRESHOLD = 5000; // 50%

  let cert;
  let admin, voter1, voter2, voter3, manufacturer, other;
  let VOTER_ROLE;

  beforeEach(async function () {
    [admin, voter1, voter2, voter3, manufacturer, other] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("DeviceCertification");
    cert = await Factory.deploy(VOTING_PERIOD, APPROVAL_THRESHOLD);
    await cert.waitForDeployment();

    VOTER_ROLE = await cert.VOTER_ROLE();

    // Grant voter roles
    await cert.grantRole(VOTER_ROLE, voter1.address);
    await cert.grantRole(VOTER_ROLE, voter2.address);
    await cert.grantRole(VOTER_ROLE, voter3.address);
  });

  // ─────────────────────────────────────────────
  //  Deployment
  // ─────────────────────────────────────────────

  describe("Deployment", function () {
    it("sets voting period", async function () {
      expect(await cert.votingPeriodBlocks()).to.equal(VOTING_PERIOD);
    });

    it("sets approval threshold", async function () {
      expect(await cert.approvalThresholdBps()).to.equal(APPROVAL_THRESHOLD);
    });

    it("admin has default admin role", async function () {
      const DEFAULT_ADMIN = await cert.DEFAULT_ADMIN_ROLE();
      expect(await cert.hasRole(DEFAULT_ADMIN, admin.address)).to.be.true;
    });
  });

  // ─────────────────────────────────────────────
  //  Proposals
  // ─────────────────────────────────────────────

  describe("Proposals", function () {
    it("voter can propose certification", async function () {
      await expect(cert.connect(voter1).proposeCertification(manufacturer.address, "Acme", "ipfs://spec"))
        .to.emit(cert, "CertificationProposed")
        .withArgs(1, manufacturer.address, "Acme", "ipfs://spec");
    });

    it("non-voter cannot propose", async function () {
      await expect(
        cert.connect(other).proposeCertification(manufacturer.address, "Acme", "ipfs://spec")
      ).to.be.reverted;
    });

    it("increments proposal count", async function () {
      await cert.connect(voter1).proposeCertification(manufacturer.address, "Acme", "ipfs://spec");
      expect(await cert.proposalCount()).to.equal(1);
    });
  });

  // ─────────────────────────────────────────────
  //  Voting
  // ─────────────────────────────────────────────

  describe("Voting", function () {
    beforeEach(async function () {
      await cert.connect(voter1).proposeCertification(manufacturer.address, "Acme", "ipfs://spec");
    });

    it("voter can vote for", async function () {
      await expect(cert.connect(voter1).vote(1, true))
        .to.emit(cert, "VoteCast")
        .withArgs(1, voter1.address, true);
    });

    it("voter can vote against", async function () {
      await expect(cert.connect(voter2).vote(1, false))
        .to.emit(cert, "VoteCast")
        .withArgs(1, voter2.address, false);
    });

    it("cannot vote twice", async function () {
      await cert.connect(voter1).vote(1, true);
      await expect(
        cert.connect(voter1).vote(1, true)
      ).to.be.revertedWithCustomError(cert, "AlreadyVoted");
    });

    it("cannot vote after deadline", async function () {
      await mine(VOTING_PERIOD + 1);
      await expect(
        cert.connect(voter1).vote(1, true)
      ).to.be.revertedWithCustomError(cert, "ProposalNotActive");
    });

    it("non-voter cannot vote", async function () {
      await expect(
        cert.connect(other).vote(1, true)
      ).to.be.reverted;
    });
  });

  // ─────────────────────────────────────────────
  //  Finalization
  // ─────────────────────────────────────────────

  describe("Finalization", function () {
    beforeEach(async function () {
      await cert.connect(voter1).proposeCertification(manufacturer.address, "Acme", "ipfs://spec");
    });

    it("cannot finalize before deadline", async function () {
      await expect(cert.finalize(1))
        .to.be.revertedWithCustomError(cert, "VotingNotEnded");
    });

    it("approves when votes exceed threshold", async function () {
      await cert.connect(voter1).vote(1, true);
      await cert.connect(voter2).vote(1, true);
      await cert.connect(voter3).vote(1, false);
      await mine(VOTING_PERIOD + 1);

      await expect(cert.finalize(1))
        .to.emit(cert, "ManufacturerCertified")
        .withArgs(1, manufacturer.address);

      expect(await cert.isCertified(manufacturer.address)).to.be.true;
    });

    it("rejects when votes below threshold", async function () {
      await cert.connect(voter1).vote(1, false);
      await cert.connect(voter2).vote(1, false);
      await cert.connect(voter3).vote(1, true);
      await mine(VOTING_PERIOD + 1);

      await cert.finalize(1);
      expect(await cert.isCertified(manufacturer.address)).to.be.false;
    });

    it("rejects on no votes", async function () {
      await mine(VOTING_PERIOD + 1);
      await cert.finalize(1);
      expect(await cert.isCertified(manufacturer.address)).to.be.false;
    });

    it("grants CERTIFIED_MANUFACTURER role on approval", async function () {
      await cert.connect(voter1).vote(1, true);
      await mine(VOTING_PERIOD + 1);
      await cert.finalize(1);

      const CERTIFIED = await cert.CERTIFIED_MANUFACTURER();
      expect(await cert.hasRole(CERTIFIED, manufacturer.address)).to.be.true;
    });

    it("adds to certified manufacturers list", async function () {
      await cert.connect(voter1).vote(1, true);
      await mine(VOTING_PERIOD + 1);
      await cert.finalize(1);
      expect(await cert.certifiedCount()).to.equal(1);
    });
  });

  // ─────────────────────────────────────────────
  //  Revocation
  // ─────────────────────────────────────────────

  describe("Revocation", function () {
    it("admin can revoke certification", async function () {
      // First certify
      await cert.connect(voter1).proposeCertification(manufacturer.address, "Acme", "ipfs://spec");
      await cert.connect(voter1).vote(1, true);
      await mine(VOTING_PERIOD + 1);
      await cert.finalize(1);

      // Then revoke
      await expect(cert.revokeManufacturer(manufacturer.address, "Quality failure"))
        .to.emit(cert, "ManufacturerRevoked")
        .withArgs(manufacturer.address, "Quality failure");

      expect(await cert.isCertified(manufacturer.address)).to.be.false;
    });
  });

  // ─────────────────────────────────────────────
  //  Admin
  // ─────────────────────────────────────────────

  describe("Admin", function () {
    it("admin can cancel proposal", async function () {
      await cert.connect(voter1).proposeCertification(manufacturer.address, "Acme", "ipfs://spec");
      await cert.cancelProposal(1);
      const [,,,,, status] = await cert.getProposal(1);
      expect(status).to.equal(3); // Cancelled
    });
  });
});
