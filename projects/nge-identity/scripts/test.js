/**
 * @file test.js
 * @description Standalone test runner for NGE Identity Platform contracts.
 *
 * Uses pre-compiled artifacts from compile.js and runs tests against
 * a local JSON-RPC node (Hardhat or Anvil).
 *
 * Prerequisites:
 *   1. Compile first:  node scripts/compile.js
 *   2. Start a node:   npx hardhat node  (in a separate terminal)
 *   3. Run tests:      node scripts/test.js
 *
 * @usage node scripts/test.js
 */
const { ethers } = require("ethers");
const { MerkleTree } = require("merkletreejs");
const fs = require("fs");
const path = require("path");

const assert = (condition, msg) => {
  if (!condition) throw new Error(`ASSERTION FAILED: ${msg}`);
};

const ARTIFACTS_DIR = path.join(__dirname, "..", "artifacts");

function loadArtifact(sourcePath, contractName) {
  const file = path.join(ARTIFACTS_DIR, sourcePath, `${contractName}.json`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

async function main() {
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  const accounts = await provider.listAccounts();
  if (accounts.length < 6) {
    console.error("Need at least 6 accounts. Start a hardhat/anvil node.");
    process.exit(1);
  }

  const [owner, alice, bob, hospital, university, treasury] = accounts;

  // Load artifacts
  const didArtifact = loadArtifact("examples/SimpleDIDRegistry.sol", "SimpleDIDRegistry");
  const credArtifact = loadArtifact("identity/CredentialRegistry.sol", "CredentialRegistry");
  const sensorArtifact = loadArtifact("identity/SensorDataAnchor.sol", "SensorDataAnchor");
  const marketArtifact = loadArtifact("identity/SkillsMarketplace.sol", "SkillsMarketplace");

  // DID hashes
  const aliceDID = ethers.keccak256(ethers.toUtf8Bytes("did:web:nge:users:alice"));
  const bobDID = ethers.keccak256(ethers.toUtf8Bytes("did:web:nge:users:bob"));
  const uniDID = ethers.keccak256(ethers.toUtf8Bytes("did:web:university.edu"));
  const hospDID = ethers.keccak256(ethers.toUtf8Bytes("did:web:hospital.org"));
  const DID_URI = "https://nge.cloud-creations.com/did/doc.json";

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  \u2713 ${name}`);
      passed++;
    } catch (err) {
      console.log(`  \u2717 ${name}`);
      console.log(`    ${err.message.split("\n")[0]}`);
      failed++;
    }
  }

  async function deployDID() {
    const factory = new ethers.ContractFactory(didArtifact.abi, didArtifact.bytecode, owner);
    const c = await factory.deploy();
    await c.waitForDeployment();
    return c;
  }

  async function deployCred() {
    const factory = new ethers.ContractFactory(credArtifact.abi, credArtifact.bytecode, owner);
    const c = await factory.deploy();
    await c.waitForDeployment();
    return c;
  }

  async function deploySensor() {
    const factory = new ethers.ContractFactory(sensorArtifact.abi, sensorArtifact.bytecode, owner);
    const c = await factory.deploy();
    await c.waitForDeployment();
    return c;
  }

  async function deployMarket(credAddr) {
    const factory = new ethers.ContractFactory(marketArtifact.abi, marketArtifact.bytecode, owner);
    const c = await factory.deploy(credAddr, treasury.address, 250);
    await c.waitForDeployment();
    return c;
  }

  // ═══════════════════════════════════════════
  //  DIDRegistry Tests
  // ═══════════════════════════════════════════
  console.log("\n  DIDRegistry — Creation");

  await test("creates a DID successfully", async () => {
    const reg = await deployDID();
    await (await reg.connect(alice).createDID(aliceDID, DID_URI)).wait();
    assert(await reg.isActive(aliceDID), "should be active");
    assert(Number(await reg.didCount()) === 1, "count should be 1");
  });

  await test("stores DID record correctly", async () => {
    const reg = await deployDID();
    await (await reg.connect(alice).createDID(aliceDID, DID_URI)).wait();
    const record = await reg.resolve(aliceDID);
    assert(record[0] === alice.address, "wrong controller");
    assert(record[1] === DID_URI, "wrong URI");
    assert(record[4] === true, "should be active");
  });

  await test("reverts on duplicate DID", async () => {
    const reg = await deployDID();
    await (await reg.connect(alice).createDID(aliceDID, DID_URI)).wait();
    try {
      await reg.connect(bob).createDID(aliceDID, DID_URI);
      assert(false, "should revert");
    } catch (e) { assert(e.message.includes("revert"), "wrong error"); }
  });

  console.log("\n  DIDRegistry — Updates & Deactivation");

  await test("updates document URI", async () => {
    const reg = await deployDID();
    await (await reg.connect(alice).createDID(aliceDID, DID_URI)).wait();
    await (await reg.connect(alice).updateDocument(aliceDID, "https://new-uri.com")).wait();
    const record = await reg.resolve(aliceDID);
    assert(record[1] === "https://new-uri.com", "wrong URI");
  });

  await test("deactivates a DID", async () => {
    const reg = await deployDID();
    await (await reg.connect(alice).createDID(aliceDID, DID_URI)).wait();
    await (await reg.connect(alice).deactivate(aliceDID)).wait();
    assert(!(await reg.isActive(aliceDID)), "should be inactive");
  });

  await test("non-controller cannot update", async () => {
    const reg = await deployDID();
    await (await reg.connect(alice).createDID(aliceDID, DID_URI)).wait();
    try {
      await reg.connect(bob).updateDocument(aliceDID, "https://hack.com");
      assert(false, "should revert");
    } catch (e) { assert(e.message.includes("revert"), "wrong error"); }
  });

  console.log("\n  DIDRegistry — Biometric Binding");

  await test("binds biometric commitment", async () => {
    const reg = await deployDID();
    await (await reg.connect(alice).createDID(aliceDID, DID_URI)).wait();
    const bio = ethers.keccak256(ethers.toUtf8Bytes("fingerprint"));
    await (await reg.connect(alice).bindBiometric(aliceDID, bio)).wait();
    assert((await reg.biometricToDID(bio)) === aliceDID, "wrong DID");
  });

  await test("prevents duplicate biometric", async () => {
    const reg = await deployDID();
    await (await reg.connect(alice).createDID(aliceDID, DID_URI)).wait();
    await (await reg.connect(bob).createDID(bobDID, DID_URI)).wait();
    const bio = ethers.keccak256(ethers.toUtf8Bytes("fingerprint"));
    await (await reg.connect(alice).bindBiometric(aliceDID, bio)).wait();
    try {
      await reg.connect(bob).bindBiometric(bobDID, bio);
      assert(false, "should revert");
    } catch (e) { assert(e.message.includes("revert"), "wrong error"); }
  });

  console.log("\n  DIDRegistry — Controller Transfer");

  await test("transfers control to new address", async () => {
    const reg = await deployDID();
    await (await reg.connect(alice).createDID(aliceDID, DID_URI)).wait();
    await (await reg.connect(alice).changeController(aliceDID, bob.address)).wait();
    assert((await reg.controllerOf(aliceDID)) === bob.address, "wrong controller");
  });

  await test("old controller loses access after transfer", async () => {
    const reg = await deployDID();
    await (await reg.connect(alice).createDID(aliceDID, DID_URI)).wait();
    await (await reg.connect(alice).changeController(aliceDID, bob.address)).wait();
    try {
      await reg.connect(alice).updateDocument(aliceDID, "https://fail.com");
      assert(false, "should revert");
    } catch (e) { assert(e.message.includes("revert"), "wrong error"); }
  });

  // ═══════════════════════════════════════════
  //  CredentialRegistry Tests
  // ═══════════════════════════════════════════
  console.log("\n  CredentialRegistry — Issuer Management");

  await test("adds and checks trusted issuer", async () => {
    const reg = await deployCred();
    await (await reg.addTrustedIssuer(uniDID)).wait();
    assert(await reg.isTrustedIssuer(uniDID), "should be trusted");
  });

  await test("removes trusted issuer", async () => {
    const reg = await deployCred();
    await (await reg.addTrustedIssuer(uniDID)).wait();
    await (await reg.removeTrustedIssuer(uniDID)).wait();
    assert(!(await reg.isTrustedIssuer(uniDID)), "should not be trusted");
  });

  console.log("\n  CredentialRegistry — Issuance & Verification");

  await test("issues and verifies credential", async () => {
    const reg = await deployCred();
    await (await reg.addTrustedIssuer(uniDID)).wait();
    const credId = ethers.keccak256(ethers.toUtf8Bytes("cred-1"));
    const credHash = ethers.keccak256(ethers.toUtf8Bytes("vc-doc"));
    await (await reg.issueCredential(credId, uniDID, aliceDID, credHash, 0, 0, "")).wait();
    const result = await reg.verifyCredential(credId);
    assert(result[0] === true, "should be valid");
  });

  await test("revokes credential", async () => {
    const reg = await deployCred();
    await (await reg.addTrustedIssuer(uniDID)).wait();
    const credId = ethers.keccak256(ethers.toUtf8Bytes("cred-rev"));
    const credHash = ethers.keccak256(ethers.toUtf8Bytes("vc-rev"));
    await (await reg.issueCredential(credId, uniDID, aliceDID, credHash, 0, 0, "")).wait();
    await (await reg.revokeCredential(credId, uniDID)).wait();
    const result = await reg.verifyCredential(credId);
    assert(result[0] === false, "should be invalid");
    assert(result[2] === true, "should be revoked");
  });

  await test("rejects untrusted issuer", async () => {
    const reg = await deployCred();
    const credId = ethers.keccak256(ethers.toUtf8Bytes("cred-fake"));
    try {
      await reg.issueCredential(credId, uniDID, aliceDID, credId, 0, 0, "");
      assert(false, "should revert");
    } catch (e) { assert(e.message.includes("revert"), "wrong error"); }
  });

  await test("tracks holder credentials", async () => {
    const reg = await deployCred();
    await (await reg.addTrustedIssuer(uniDID)).wait();
    for (let i = 0; i < 3; i++) {
      const id = ethers.keccak256(ethers.toUtf8Bytes(`cred-${i}`));
      const hash = ethers.keccak256(ethers.toUtf8Bytes(`hash-${i}`));
      await (await reg.issueCredential(id, uniDID, aliceDID, hash, i, 0, "")).wait();
    }
    const creds = await reg.getHolderCredentials(aliceDID);
    assert(creds.length === 3, "should have 3 credentials");
  });

  // ═══════════════════════════════════════════
  //  SensorDataAnchor Tests
  // ═══════════════════════════════════════════
  console.log("\n  SensorDataAnchor — Device Registration");

  const deviceDID = ethers.keccak256(ethers.toUtf8Bytes("did:device:temp-001"));

  await test("registers and deregisters device", async () => {
    const sa = await deploySensor();
    await (await sa.registerDevice(deviceDID)).wait();
    assert(await sa.isDeviceRegistered(deviceDID), "should be registered");
    assert(Number(await sa.deviceCount()) === 1, "count should be 1");
    await (await sa.deregisterDevice(deviceDID)).wait();
    assert(!(await sa.isDeviceRegistered(deviceDID)), "should not be registered");
  });

  console.log("\n  SensorDataAnchor — Batch Anchoring & Merkle Verification");

  await test("anchors batch and verifies readings", async () => {
    const sa = await deploySensor();
    await (await sa.registerDevice(deviceDID)).wait();

    const readings = ["temp:72.4F:1000", "temp:73.1F:1060", "temp:72.8F:1120", "temp:71.9F:1180"];
    const leaves = readings.map((r) => ethers.keccak256(ethers.toUtf8Bytes(r)));
    const tree = new MerkleTree(leaves, ethers.keccak256, { sortPairs: true });
    const root = tree.getHexRoot();

    const batchId = ethers.keccak256(ethers.toUtf8Bytes("batch-1"));
    await (await sa.anchorBatch(batchId, deviceDID, root, 4, 1000, 1180, "ipfs://meta")).wait();
    assert(Number(await sa.batchCount()) === 1, "batch count should be 1");

    // Verify each reading
    for (let i = 0; i < leaves.length; i++) {
      const proof = tree.getHexProof(leaves[i]);
      assert(await sa.verifyReading(batchId, leaves[i], proof), `reading ${i} should verify`);
    }

    // Tampered reading should fail
    const fake = ethers.keccak256(ethers.toUtf8Bytes("tampered"));
    assert(!(await sa.verifyReading(batchId, fake, tree.getHexProof(leaves[0]))), "tampered should fail");
  });

  // ═══════════════════════════════════════════
  //  SkillsMarketplace Tests
  // ═══════════════════════════════════════════
  console.log("\n  SkillsMarketplace — Listing & Engagement");

  await test("creates listing and engages with escrow", async () => {
    const cred = await deployCred();
    const market = await deployMarket(await cred.getAddress());
    await (await cred.addTrustedIssuer(uniDID)).wait();

    const credId = ethers.keccak256(ethers.toUtf8Bytes("nurse-license"));
    const credHash = ethers.keccak256(ethers.toUtf8Bytes("vc-nurse"));
    await (await cred.issueCredential(credId, uniDID, aliceDID, credHash, 1, 0, "")).wait();

    const listingId = ethers.keccak256(ethers.toUtf8Bytes("rn-listing"));
    await (await market.connect(alice).createListing(
      listingId, aliceDID, "RN Services", "",
      [credId], 1, ethers.parseEther("0.05"), true
    )).wait();

    assert(Number(await market.listingCount()) === 1, "listing count wrong");

    const engId = ethers.keccak256(ethers.toUtf8Bytes("eng-1"));
    await (await market.connect(bob).engageWorker(
      engId, listingId, bobDID, { value: ethers.parseEther("1.0") }
    )).wait();

    assert(Number(await market.engagementCount()) === 1, "engagement count wrong");
  });

  await test("complete engagement with pull-pattern withdrawal", async () => {
    const cred = await deployCred();
    const market = await deployMarket(await cred.getAddress());

    const listingId = ethers.keccak256(ethers.toUtf8Bytes("gig-listing"));
    await (await market.connect(alice).createListing(
      listingId, aliceDID, "Cleaning", "", [], 0, ethers.parseEther("0.01"), true
    )).wait();

    const engId = ethers.keccak256(ethers.toUtf8Bytes("eng-clean"));
    const escrow = ethers.parseEther("1.0");
    await (await market.connect(bob).engageWorker(
      engId, listingId, bobDID, { value: escrow }
    )).wait();

    await (await market.connect(bob).completeEngagement(engId, 5)).wait();

    // Check pull-pattern balances
    const fee = (escrow * 250n) / 10000n;
    const payout = escrow - fee;
    const workerBalance = await market.pendingWithdrawals(alice.address);
    assert(workerBalance === payout, "wrong worker payout");

    const treasuryBalance = await market.pendingWithdrawals(treasury.address);
    assert(treasuryBalance === fee, "wrong treasury fee");

    // Worker withdraws
    await (await market.connect(alice).withdraw()).wait();
    assert(BigInt(await market.pendingWithdrawals(alice.address)) === 0n, "should be zero after withdraw");
  });

  await test("dispute prevents completion", async () => {
    const cred = await deployCred();
    const market = await deployMarket(await cred.getAddress());

    const listingId = ethers.keccak256(ethers.toUtf8Bytes("dispute-listing"));
    await (await market.connect(alice).createListing(
      listingId, aliceDID, "Work", "", [], 0, ethers.parseEther("0.01"), true
    )).wait();

    const engId = ethers.keccak256(ethers.toUtf8Bytes("eng-dispute"));
    await (await market.connect(bob).engageWorker(
      engId, listingId, bobDID, { value: ethers.parseEther("0.5") }
    )).wait();

    await (await market.connect(bob).raiseDispute(engId, bobDID)).wait();
    try {
      await market.connect(bob).completeEngagement(engId, 3);
      assert(false, "should revert");
    } catch (e) { assert(e.message.includes("revert"), "wrong error"); }
  });

  // ═══════════════════════════════════════════
  //  Integration — Full Lifecycle
  // ═══════════════════════════════════════════
  console.log("\n  Integration — Full Lifecycle");

  await test("DID → biometric → credential → marketplace → escrow → withdraw", async () => {
    const did = await deployDID();
    const cred = await deployCred();
    const sensor = await deploySensor();
    const market = await deployMarket(await cred.getAddress());

    // 1. Create DID
    await (await did.connect(alice).createDID(aliceDID, DID_URI)).wait();
    assert(await did.isActive(aliceDID), "DID should be active");

    // 2. Bind biometric
    const bio = ethers.keccak256(ethers.toUtf8Bytes("alice-bio"));
    await (await did.connect(alice).bindBiometric(aliceDID, bio)).wait();

    // 3. Issue credential
    await (await cred.addTrustedIssuer(uniDID)).wait();
    const credId = ethers.keccak256(ethers.toUtf8Bytes("e2e-cred"));
    await (await cred.issueCredential(
      credId, uniDID, aliceDID,
      ethers.keccak256(ethers.toUtf8Bytes("vc")),
      0, 0, ""
    )).wait();
    const result = await cred.verifyCredential(credId);
    assert(result[0] === true, "credential should be valid");

    // 4. Create listing
    const listingId = ethers.keccak256(ethers.toUtf8Bytes("e2e-listing"));
    await (await market.connect(alice).createListing(
      listingId, aliceDID, "E2E Service", "", [credId], 0,
      ethers.parseEther("0.01"), true
    )).wait();

    // 5. Engage
    const engId = ethers.keccak256(ethers.toUtf8Bytes("e2e-eng"));
    await (await market.connect(bob).engageWorker(
      engId, listingId, bobDID, { value: ethers.parseEther("1.0") }
    )).wait();

    // 6. Complete
    await (await market.connect(bob).completeEngagement(engId, 5)).wait();

    // 7. Withdraw
    await (await market.connect(alice).withdraw()).wait();
    await (await market.connect(treasury).withdraw()).wait();

    // 8. Register sensor device
    const devDID = ethers.keccak256(ethers.toUtf8Bytes("did:device:e2e"));
    await (await sensor.registerDevice(devDID)).wait();

    // 9. Anchor sensor data
    const readings = ["r1", "r2", "r3", "r4"];
    const leaves = readings.map((r) => ethers.keccak256(ethers.toUtf8Bytes(r)));
    const tree = new MerkleTree(leaves, ethers.keccak256, { sortPairs: true });
    const batchId = ethers.keccak256(ethers.toUtf8Bytes("e2e-batch"));
    await (await sensor.anchorBatch(batchId, devDID, tree.getHexRoot(), 4, 1000, 2000, "")).wait();

    // 10. Verify reading
    const proof = tree.getHexProof(leaves[2]);
    assert(await sensor.verifyReading(batchId, leaves[2], proof), "reading should verify");
  });

  // ═══════════════════════════════════════════
  //  Summary
  // ═══════════════════════════════════════════
  console.log(`\n  ${passed} passing, ${failed} failing\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
