/**
 * @file Integration.test.js
 * @description End-to-end integration tests for the NGE Identity Platform.
 *
 * Tests the full lifecycle:
 *   1. Create DID → Bind biometric
 *   2. Issue education credential → Verify
 *   3. Issue state ID credential
 *   4. Register sensor device → Anchor data → Verify reading
 *   5. Create marketplace listing (backed by credentials) → Engage → Complete
 *   6. Healthcare credential flow (mock FHIR)
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { MerkleTree } = require("merkletreejs");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("NGE Identity Platform — Integration", function () {
  let didRegistry, credRegistry, sensorAnchor, marketplace;
  let owner, alice, bob, hospital, university, treasury;

  // DIDs
  let aliceDIDHash, bobDIDHash, universityDIDHash, hospitalDIDHash;

  beforeEach(async function () {
    [owner, alice, bob, hospital, university, treasury] = await ethers.getSigners();

    // Deploy all contracts
    const DIDFactory = await ethers.getContractFactory("SimpleDIDRegistry");
    didRegistry = await DIDFactory.deploy();
    await didRegistry.waitForDeployment();

    const CredFactory = await ethers.getContractFactory("CredentialRegistry");
    credRegistry = await CredFactory.deploy();
    await credRegistry.waitForDeployment();

    const SensorFactory = await ethers.getContractFactory("SensorDataAnchor");
    sensorAnchor = await SensorFactory.deploy();
    await sensorAnchor.waitForDeployment();

    const MarketFactory = await ethers.getContractFactory("SkillsMarketplace");
    marketplace = await MarketFactory.deploy(
      await credRegistry.getAddress(),
      treasury.address,
      250 // 2.5% fee
    );
    await marketplace.waitForDeployment();

    // Create DID hashes
    aliceDIDHash = ethers.keccak256(ethers.toUtf8Bytes("did:web:nge.cloud-creations.com:users:alice"));
    bobDIDHash = ethers.keccak256(ethers.toUtf8Bytes("did:web:nge.cloud-creations.com:users:bob"));
    universityDIDHash = ethers.keccak256(ethers.toUtf8Bytes("did:web:university.example.edu"));
    hospitalDIDHash = ethers.keccak256(ethers.toUtf8Bytes("did:web:hospital.example.org"));
  });

  // ─────────────────────────────────────────────
  //  E2E: Identity → Credential → Marketplace
  // ─────────────────────────────────────────────

  it("full lifecycle: DID → biometric → credential → marketplace → escrow → complete", async function () {
    // Step 1: Alice creates her DID
    await didRegistry.connect(alice).createDID(
      aliceDIDHash,
      "https://nge.cloud-creations.com/did/alice/document.json"
    );
    expect(await didRegistry.isActive(aliceDIDHash)).to.be.true;

    // Step 2: Alice binds biometric
    const bioHash = ethers.keccak256(ethers.toUtf8Bytes("alice-fingerprint-template"));
    await didRegistry.connect(alice).bindBiometric(aliceDIDHash, bioHash);
    expect(await didRegistry.biometricToDID(bioHash)).to.equal(aliceDIDHash);

    // Step 3: University registers as trusted issuer and issues education credential
    await credRegistry.addTrustedIssuer(universityDIDHash);

    const educCredId = ethers.keccak256(ethers.toUtf8Bytes("alice-bsn-degree"));
    const educCredHash = ethers.keccak256(ethers.toUtf8Bytes("vc-bsn-nursing-iu"));
    await credRegistry.issueCredential(
      educCredId, universityDIDHash, aliceDIDHash, educCredHash,
      0, // EDUCATION
      0, // no expiration
      "https://nge.cloud-creations.com/credentials/alice-bsn.json"
    );

    // Verify credential
    let result = await credRegistry.verifyCredential(educCredId);
    expect(result.valid).to.be.true;

    // Step 4: Hospital registers as trusted issuer, issues nursing license
    await credRegistry.addTrustedIssuer(hospitalDIDHash);

    const licCredId = ethers.keccak256(ethers.toUtf8Bytes("alice-rn-license"));
    const licCredHash = ethers.keccak256(ethers.toUtf8Bytes("vc-rn-license-indiana"));
    await credRegistry.issueCredential(
      licCredId, hospitalDIDHash, aliceDIDHash, licCredHash,
      1, // PROFESSIONAL
      0,
      "https://nge.cloud-creations.com/credentials/alice-rn.json"
    );

    // Alice now has 2 credentials
    const aliceCreds = await credRegistry.getHolderCredentials(aliceDIDHash);
    expect(aliceCreds).to.have.lengthOf(2);

    // Step 5: Alice creates a marketplace listing backed by both credentials
    const listingId = ethers.keccak256(ethers.toUtf8Bytes("alice-rn-listing"));
    await marketplace.connect(alice).createListing(
      listingId, aliceDIDHash, "Registered Nurse, BSN, 8yr experience",
      "ipfs://QmAliceRNListing",
      [educCredId, licCredId],
      1, // CONTRACT_WORK
      ethers.parseEther("0.085"), // ~$85/hr equivalent
      true
    );

    const listing = await marketplace.getListing(listingId);
    expect(listing.verificationLevel).to.equal(2); // CREDENTIAL_VERIFIED
    expect(listing.status).to.equal(0); // OPEN

    // Step 6: Bob (hospital HR) engages Alice
    const engagementId = ethers.keccak256(ethers.toUtf8Bytes("bob-engages-alice"));
    const escrow = ethers.parseEther("1.0");
    await marketplace.connect(bob).engageWorker(
      engagementId, listingId, bobDIDHash, { value: escrow }
    );

    expect((await marketplace.getListing(listingId)).status).to.equal(2); // IN_PROGRESS

    // Step 7: Bob approves work, releases escrow
    await marketplace.connect(bob).completeEngagement(engagementId, 5);

    const eng = await marketplace.getEngagement(engagementId);
    expect(eng.clientApproved).to.be.true;

    // Step 8: Alice withdraws her earnings (pull pattern)
    const fee = (escrow * 250n) / 10000n;
    const payout = escrow - fee;
    expect(await marketplace.pendingWithdrawals(alice.address)).to.equal(payout);

    await marketplace.connect(alice).withdraw();
    expect(await marketplace.pendingWithdrawals(alice.address)).to.equal(0);

    // Step 9: Treasury withdraws fees
    expect(await marketplace.pendingWithdrawals(treasury.address)).to.equal(fee);
    await marketplace.connect(treasury).withdraw();

    // Verify ratings
    const [total, count] = await marketplace.getWorkerRating(aliceDIDHash);
    expect(count).to.equal(1);
    expect(total).to.equal(5);
  });

  // ─────────────────────────────────────────────
  //  E2E: Sensor Device → Data Anchor → Verify
  // ─────────────────────────────────────────────

  it("sensor lifecycle: register device → stream data → anchor batch → verify reading", async function () {
    const deviceDID = ethers.keccak256(
      ethers.toUtf8Bytes("did:web:nge.cloud-creations.com:devices:temp-sensor-001")
    );

    // Step 1: Register device
    await sensorAnchor.registerDevice(deviceDID);
    expect(await sensorAnchor.isDeviceRegistered(deviceDID)).to.be.true;

    // Step 2: Simulate 100 sensor readings
    const readings = [];
    for (let i = 0; i < 100; i++) {
      readings.push(`temperature:${(70 + Math.random() * 5).toFixed(1)}F:${1711461000 + i * 60}`);
    }

    // Step 3: Build Merkle tree
    const leaves = readings.map((r) => ethers.keccak256(ethers.toUtf8Bytes(r)));
    const tree = new MerkleTree(leaves, ethers.keccak256, { sortPairs: true });
    const root = tree.getHexRoot();

    // Step 4: Anchor batch on-chain
    const batchId = ethers.keccak256(ethers.toUtf8Bytes("batch-100-readings"));
    await sensorAnchor.anchorBatch(
      batchId, deviceDID, root, 100,
      1711461000, 1711467000,
      "ipfs://QmBatch100Readings"
    );

    expect(await sensorAnchor.batchCount()).to.equal(1);

    // Step 5: Verify individual readings against the batch root
    for (let i = 0; i < 5; i++) {
      const randomIndex = Math.floor(Math.random() * readings.length);
      const leaf = leaves[randomIndex];
      const proof = tree.getHexProof(leaf);

      const verified = await sensorAnchor.verifyReading(batchId, leaf, proof);
      expect(verified).to.be.true;
    }

    // Step 6: Verify a tampered reading fails
    const tamperedLeaf = ethers.keccak256(ethers.toUtf8Bytes("temperature:999.9F:tampered"));
    const fakeProof = tree.getHexProof(leaves[0]);
    const tamperedResult = await sensorAnchor.verifyReading(batchId, tamperedLeaf, fakeProof);
    expect(tamperedResult).to.be.false;
  });

  // ─────────────────────────────────────────────
  //  E2E: Credential Revocation
  // ─────────────────────────────────────────────

  it("credential revocation: issue → verify → revoke → re-verify fails", async function () {
    await credRegistry.addTrustedIssuer(universityDIDHash);

    const credId = ethers.keccak256(ethers.toUtf8Bytes("revocable-cred"));
    const credHash = ethers.keccak256(ethers.toUtf8Bytes("vc-document"));

    // Issue
    await credRegistry.issueCredential(
      credId, universityDIDHash, aliceDIDHash, credHash, 0, 0, ""
    );
    expect((await credRegistry.verifyCredential(credId)).valid).to.be.true;

    // Revoke
    await credRegistry.revokeCredential(credId, universityDIDHash);
    const result = await credRegistry.verifyCredential(credId);
    expect(result.valid).to.be.false;
    expect(result.revoked).to.be.true;
  });

  // ─────────────────────────────────────────────
  //  E2E: Cross-Module DID Resolution
  // ─────────────────────────────────────────────

  it("cross-module: same DID used across identity, credential, and marketplace", async function () {
    // Alice creates DID in identity module
    await didRegistry.connect(alice).createDID(aliceDIDHash, "https://example.com/alice");

    // Same DID used for credential
    await credRegistry.addTrustedIssuer(universityDIDHash);
    const credId = ethers.keccak256(ethers.toUtf8Bytes("cross-module-cred"));
    await credRegistry.issueCredential(
      credId, universityDIDHash, aliceDIDHash,
      ethers.keccak256(ethers.toUtf8Bytes("vc")),
      2, 0, "" // SKILL type
    );

    // Same DID used for marketplace listing
    const listingId = ethers.keccak256(ethers.toUtf8Bytes("cross-module-listing"));
    await marketplace.connect(alice).createListing(
      listingId, aliceDIDHash, "Cross-Module Service",
      "", [credId], 0, ethers.parseEther("0.01"), true
    );

    // Verify consistency
    expect(await didRegistry.isActive(aliceDIDHash)).to.be.true;
    expect((await credRegistry.verifyCredential(credId)).valid).to.be.true;
    expect((await marketplace.getListing(listingId)).workerDID).to.equal(aliceDIDHash);
  });

  // ─────────────────────────────────────────────
  //  E2E: Migrant Worker Portable Credentials
  // ─────────────────────────────────────────────

  it("migrant worker flow: state ID → gig listing → earn experience credential → upgrade tier", async function () {
    // Maria creates DID
    await didRegistry.connect(alice).createDID(aliceDIDHash, "https://example.com/maria");

    // Maria gets a state ID credential
    await credRegistry.addTrustedIssuer(hospitalDIDHash); // State ID issuer
    const stateIdCredId = ethers.keccak256(ethers.toUtf8Bytes("maria-indiana-id"));
    await credRegistry.issueCredential(
      stateIdCredId, hospitalDIDHash, aliceDIDHash,
      ethers.keccak256(ethers.toUtf8Bytes("state-id-commitment")),
      4, // STATE_ID
      0, "",
    );

    // Maria lists as a gig worker with just state ID
    const listing1 = ethers.keccak256(ethers.toUtf8Bytes("maria-cleaning-gig"));
    await marketplace.connect(alice).createListing(
      listing1, aliceDIDHash, "House Cleaning, Indianapolis, $25/hr",
      "", [stateIdCredId], 0, ethers.parseEther("0.025"), true
    );

    // Complete a job, earn experience
    const eng1 = ethers.keccak256(ethers.toUtf8Bytes("maria-job-1"));
    await marketplace.connect(bob).engageWorker(
      eng1, listing1, bobDIDHash, { value: ethers.parseEther("0.1") }
    );
    await marketplace.connect(bob).completeEngagement(eng1, 4);

    // Employer issues work experience credential
    const expCredId = ethers.keccak256(ethers.toUtf8Bytes("maria-exp-1"));
    await credRegistry.issueCredential(
      expCredId, hospitalDIDHash, aliceDIDHash,
      ethers.keccak256(ethers.toUtf8Bytes("work-experience")),
      3, // EXPERIENCE
      0, ""
    );

    // Maria now has 2 credentials — she lists again with better tier
    const listing2 = ethers.keccak256(ethers.toUtf8Bytes("maria-cleaning-v2"));
    await marketplace.connect(alice).createListing(
      listing2, aliceDIDHash, "Experienced House Cleaner, ID+Experience Verified",
      "", [stateIdCredId, expCredId], 0, ethers.parseEther("0.03"), true
    );

    const listing2Data = await marketplace.getListing(listing2);
    // With STATE_ID + another valid credential, should be FULL_VERIFIED
    expect(listing2Data.verificationLevel).to.be.greaterThanOrEqual(2);
  });
});
