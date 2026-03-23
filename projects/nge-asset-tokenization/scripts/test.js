/**
 * @file test.js
 * @description Standalone test runner for the Asset Tokenization contracts.
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
  if (accounts.length < 4) {
    console.error("Need at least 4 accounts. Start a hardhat/anvil node.");
    process.exit(1);
  }

  const [owner, alice, bob, attacker] = accounts;

  const managerArtifact = loadArtifact(
    "examples/SimpleAssetManager.sol",
    "SimpleAssetManager"
  );

  const BASE_URI = "https://api.nextgen.economy/assets/";
  const COST = ethers.parseEther("12000");
  const USEFUL_LIFE = 12;
  const QR_HASH = ethers.keccak256(ethers.toUtf8Bytes("QR:ASSET-001"));
  const SERIAL_HASH = ethers.keccak256(ethers.toUtf8Bytes("SN:XYZ-2026-001"));

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

  async function deployManager() {
    const factory = new ethers.ContractFactory(
      managerArtifact.abi,
      managerArtifact.bytecode,
      owner
    );
    const mgr = await factory.deploy(BASE_URI);
    await mgr.waitForDeployment();
    return mgr;
  }

  // ═══════════════════════════════════════════
  //  AssetRegistry — Deployment
  // ═══════════════════════════════════════════
  console.log("\n  AssetRegistry — Deployment");

  await test("sets deployer as owner", async () => {
    const mgr = await deployManager();
    assert((await mgr.owner()) === owner.address, "wrong owner");
  });

  await test("starts with zero assets", async () => {
    const mgr = await deployManager();
    assert(Number(await mgr.assetCount()) === 0, "should be 0");
  });

  // ═══════════════════════════════════════════
  //  AssetRegistry — Registration
  // ═══════════════════════════════════════════
  console.log("\n  AssetRegistry — Registration");

  await test("registers a unique equipment asset", async () => {
    const mgr = await deployManager();
    await (await mgr.registerAsset(
      alice.address, 1, 0, COST, USEFUL_LIFE,
      "Engineering", "Building A", "ipfs://asset001"
    )).wait();
    assert(Number(await mgr.assetCount()) === 1, "count should be 1");
    assert(Number(await mgr.balanceOf(alice.address, 0)) === 1, "balance should be 1");
  });

  await test("registers fungible inventory", async () => {
    const mgr = await deployManager();
    await (await mgr.registerAsset(
      alice.address, 500, 1, ethers.parseEther("50"), 0,
      "Warehouse", "Shelf B3", ""
    )).wait();
    assert(Number(await mgr.balanceOf(alice.address, 0)) === 500, "balance should be 500");
  });

  await test("stores metadata correctly", async () => {
    const mgr = await deployManager();
    await (await mgr.registerAsset(
      alice.address, 1, 0, COST, USEFUL_LIFE,
      "Engineering", "Building A", ""
    )).wait();
    const meta = await mgr.assetMetadata(0);
    assert(Number(meta.assetClass) === 0, "should be UniqueEquipment");
    assert(Number(meta.status) === 0, "should be Active");
    assert(meta.acquisitionCost === COST, "wrong cost");
    assert(meta.department === "Engineering", "wrong department");
  });

  await test("reverts when non-owner registers", async () => {
    const mgr = await deployManager();
    try {
      await mgr.connect(attacker).registerAsset(
        alice.address, 1, 0, COST, USEFUL_LIFE,
        "Engineering", "Building A", ""
      );
      assert(false, "should revert");
    } catch (e) {
      assert(e.message.includes("revert"), "wrong error");
    }
  });

  // ═══════════════════════════════════════════
  //  AssetRegistry — Status Management
  // ═══════════════════════════════════════════
  console.log("\n  AssetRegistry — Status Management");

  await test("changes asset status", async () => {
    const mgr = await deployManager();
    await (await mgr.registerAsset(
      alice.address, 1, 0, COST, USEFUL_LIFE,
      "Engineering", "Building A", ""
    )).wait();
    await (await mgr.setAssetStatus(0, 2)).wait(); // InTransit
    assert(Number(await mgr.assetStatus(0)) === 2, "should be InTransit");
  });

  await test("updates location", async () => {
    const mgr = await deployManager();
    await (await mgr.registerAsset(
      alice.address, 1, 0, COST, USEFUL_LIFE,
      "Engineering", "Building A", ""
    )).wait();
    await (await mgr.updateLocation(0, "Building B")).wait();
    const meta = await mgr.assetMetadata(0);
    assert(meta.location === "Building B", "wrong location");
  });

  // ═══════════════════════════════════════════
  //  AssetLedger — Depreciation
  // ═══════════════════════════════════════════
  console.log("\n  AssetLedger — Depreciation");

  await test("records acquisition and sets book value", async () => {
    const mgr = await deployManager();
    await (await mgr.registerAsset(
      alice.address, 1, 0, COST, USEFUL_LIFE,
      "Engineering", "Building A", ""
    )).wait();
    await (await mgr.recordAcquisition(0, COST)).wait();
    assert((await mgr.bookValue(0)) === COST, "wrong book value");
  });

  await test("records one month of depreciation", async () => {
    const mgr = await deployManager();
    await (await mgr.registerAsset(
      alice.address, 1, 0, COST, USEFUL_LIFE,
      "Engineering", "Building A", ""
    )).wait();
    await (await mgr.recordAcquisition(0, COST)).wait();
    await (await mgr.recordDepreciation(0)).wait();

    const monthly = COST / BigInt(USEFUL_LIFE);
    assert((await mgr.bookValue(0)) === COST - monthly, "wrong book value");
    assert((await mgr.accumulatedDepreciation(0)) === monthly, "wrong accumulated");
    assert(Number(await mgr.depreciationPeriods(0)) === 1, "wrong period count");
  });

  await test("fully depreciates over useful life", async () => {
    const mgr = await deployManager();
    await (await mgr.registerAsset(
      alice.address, 1, 0, COST, USEFUL_LIFE,
      "Engineering", "Building A", ""
    )).wait();
    await (await mgr.recordAcquisition(0, COST)).wait();

    for (let i = 0; i < USEFUL_LIFE; i++) {
      await (await mgr.recordDepreciation(0)).wait();
    }
    assert((await mgr.bookValue(0)) === BigInt(0), "should be fully depreciated");
    assert((await mgr.accumulatedDepreciation(0)) === COST, "accumulated should equal cost");
  });

  // ═══════════════════════════════════════════
  //  IdentifierResolver — QR / UPN
  // ═══════════════════════════════════════════
  console.log("\n  IdentifierResolver — QR / UPN");

  await test("links a QR code to an asset", async () => {
    const mgr = await deployManager();
    await (await mgr.registerAsset(
      alice.address, 1, 0, COST, USEFUL_LIFE,
      "Engineering", "Building A", ""
    )).wait();
    await (await mgr.linkIdentifier(QR_HASH, 0, 0)).wait();

    assert(await mgr.isLinked(QR_HASH), "should be linked");
    assert(Number(await mgr.resolve(QR_HASH)) === 0, "should resolve to token 0");
  });

  await test("links multiple identifiers to same asset", async () => {
    const mgr = await deployManager();
    await (await mgr.registerAsset(
      alice.address, 1, 0, COST, USEFUL_LIFE,
      "Engineering", "Building A", ""
    )).wait();
    await (await mgr.linkIdentifier(QR_HASH, 0, 0)).wait();
    await (await mgr.linkIdentifier(SERIAL_HASH, 0, 2)).wait();

    assert(Number(await mgr.identifierCount(0)) === 2, "should have 2 identifiers");
  });

  await test("unlinks an identifier", async () => {
    const mgr = await deployManager();
    await (await mgr.registerAsset(
      alice.address, 1, 0, COST, USEFUL_LIFE,
      "Engineering", "Building A", ""
    )).wait();
    await (await mgr.linkIdentifier(QR_HASH, 0, 0)).wait();
    await (await mgr.unlinkIdentifier(QR_HASH)).wait();

    assert(!(await mgr.isLinked(QR_HASH)), "should be unlinked");
    assert(Number(await mgr.identifierCount(0)) === 0, "count should be 0");
  });

  await test("reverts on duplicate link", async () => {
    const mgr = await deployManager();
    await (await mgr.registerAsset(
      alice.address, 1, 0, COST, USEFUL_LIFE,
      "Engineering", "Building A", ""
    )).wait();
    await (await mgr.linkIdentifier(QR_HASH, 0, 0)).wait();
    try {
      await mgr.linkIdentifier(QR_HASH, 0, 0);
      assert(false, "should revert");
    } catch (e) {
      assert(e.message.includes("revert"), "wrong error");
    }
  });

  // ═══════════════════════════════════════════
  //  End-to-End
  // ═══════════════════════════════════════════
  console.log("\n  End-to-End: Register + Depreciate + Scan");

  await test("full lifecycle: register → link QR → depreciate → scan → dispose", async () => {
    const mgr = await deployManager();

    // 1. Register equipment
    await (await mgr.registerAsset(
      alice.address, 1, 0, COST, USEFUL_LIFE,
      "Operations", "Floor 3", "ipfs://equip42"
    )).wait();

    // 2. Record acquisition in ledger
    await (await mgr.recordAcquisition(0, COST)).wait();

    // 3. Link QR code
    await (await mgr.linkIdentifier(QR_HASH, 0, 0)).wait();

    // 4. Depreciate 6 months
    for (let i = 0; i < 6; i++) {
      await (await mgr.recordDepreciation(0)).wait();
    }
    const monthly = COST / BigInt(USEFUL_LIFE);
    const expected = COST - monthly * BigInt(6);
    assert((await mgr.bookValue(0)) === expected, "wrong book value after 6 months");

    // 5. Scan QR to find asset
    const tokenId = Number(await mgr.resolve(QR_HASH));
    assert(tokenId === 0, "QR should resolve to token 0");

    // 6. Verify asset details
    const meta = await mgr.assetMetadata(tokenId);
    assert(meta.department === "Operations", "wrong department");
    assert(Number(meta.status) === 0, "should still be Active");

    // 7. Dispose
    await (await mgr.recordDisposal(0, ethers.parseEther("5000"))).wait();
    assert((await mgr.bookValue(0)) === BigInt(0), "book value should be 0 after disposal");
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
