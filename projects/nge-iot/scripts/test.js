/**
 * @file test.js
 * @description Standalone test runner for DeviceRegistry and DataAnchor contracts.
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

  const simpleArtifact = loadArtifact(
    "examples/SimpleDeviceRegistry.sol",
    "SimpleDeviceRegistry"
  );
  const anchoredArtifact = loadArtifact(
    "examples/AnchoredDeviceRegistry.sol",
    "AnchoredDeviceRegistry"
  );

  const FW_HASH = ethers.keccak256(ethers.toUtf8Bytes("firmware-v1.0"));
  const FW_HASH_V2 = ethers.keccak256(ethers.toUtf8Bytes("firmware-v2.0"));
  const DEVICE_URI = "https://api.nextgen.economy/devices/0.json";

  const DATA_HASH_1 = ethers.keccak256(ethers.toUtf8Bytes("temperature:22.5C:1710000000"));
  const DATA_HASH_2 = ethers.keccak256(ethers.toUtf8Bytes("humidity:65%:1710000060"));
  const DATA_HASH_3 = ethers.keccak256(ethers.toUtf8Bytes("pressure:1013hPa:1710000120"));

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

  async function deploySimple() {
    const factory = new ethers.ContractFactory(
      simpleArtifact.abi,
      simpleArtifact.bytecode,
      owner
    );
    const reg = await factory.deploy();
    await reg.waitForDeployment();
    return reg;
  }

  async function deployAnchored() {
    const factory = new ethers.ContractFactory(
      anchoredArtifact.abi,
      anchoredArtifact.bytecode,
      owner
    );
    const reg = await factory.deploy();
    await reg.waitForDeployment();
    return reg;
  }

  // ═══════════════════════════════════════════
  //  DeviceRegistry — Deployment
  // ═══════════════════════════════════════════
  console.log("\n  DeviceRegistry — Deployment");

  await test("sets correct name and symbol", async () => {
    const reg = await deploySimple();
    assert((await reg.name()) === "NGE IoT Device", "wrong name");
    assert((await reg.symbol()) === "NGED", "wrong symbol");
  });

  await test("starts with zero devices", async () => {
    const reg = await deploySimple();
    assert(Number(await reg.deviceCount()) === 0, "should be 0");
    assert(Number(await reg.totalSupply()) === 0, "totalSupply should be 0");
  });

  await test("sets deployer as owner", async () => {
    const reg = await deploySimple();
    assert((await reg.owner()) === owner.address, "wrong owner");
  });

  // ═══════════════════════════════════════════
  //  DeviceRegistry — Registration
  // ═══════════════════════════════════════════
  console.log("\n  DeviceRegistry — Registration");

  await test("registers a device and mints an NFT", async () => {
    const reg = await deploySimple();
    await (await reg.registerDevice(alice.address, FW_HASH, DEVICE_URI)).wait();
    assert(Number(await reg.deviceCount()) === 1, "count should be 1");
    assert((await reg.ownerOf(0)) === alice.address, "wrong NFT owner");
    assert(Number(await reg.balanceOf(alice.address)) === 1, "balance should be 1");
  });

  await test("sets device status to Active", async () => {
    const reg = await deploySimple();
    await (await reg.registerDevice(alice.address, FW_HASH, DEVICE_URI)).wait();
    assert(Number(await reg.deviceStatus(0)) === 1, "should be Active (1)");
    assert(await reg.isDeviceActive(0), "isDeviceActive should be true");
  });

  await test("stores firmware hash", async () => {
    const reg = await deploySimple();
    await (await reg.registerDevice(alice.address, FW_HASH, DEVICE_URI)).wait();
    assert((await reg.firmwareHash(0)) === FW_HASH, "wrong firmware hash");
  });

  await test("stores token URI", async () => {
    const reg = await deploySimple();
    await (await reg.registerDevice(alice.address, FW_HASH, DEVICE_URI)).wait();
    assert((await reg.tokenURI(0)) === DEVICE_URI, "wrong URI");
  });

  await test("assigns sequential device IDs", async () => {
    const reg = await deploySimple();
    await (await reg.registerDevice(alice.address, FW_HASH, "uri-0")).wait();
    await (await reg.registerDevice(bob.address, FW_HASH, "uri-1")).wait();
    assert(Number(await reg.deviceCount()) === 2, "count should be 2");
    assert((await reg.ownerOf(0)) === alice.address, "device 0 wrong owner");
    assert((await reg.ownerOf(1)) === bob.address, "device 1 wrong owner");
  });

  await test("reverts with zero firmware hash", async () => {
    const reg = await deploySimple();
    try {
      await reg.registerDevice(alice.address, ethers.ZeroHash, DEVICE_URI);
      assert(false, "should revert");
    } catch (e) {
      assert(e.message.includes("revert"), "wrong error");
    }
  });

  await test("reverts when non-owner registers", async () => {
    const reg = await deploySimple();
    try {
      await reg.connect(attacker).registerDevice(alice.address, FW_HASH, DEVICE_URI);
      assert(false, "should revert");
    } catch (e) {
      assert(e.message.includes("revert"), "wrong error");
    }
  });

  // ═══════════════════════════════════════════
  //  DeviceRegistry — Lifecycle
  // ═══════════════════════════════════════════
  console.log("\n  DeviceRegistry — Lifecycle");

  await test("device owner can deactivate", async () => {
    const reg = await deploySimple();
    await (await reg.registerDevice(alice.address, FW_HASH, DEVICE_URI)).wait();
    await (await reg.connect(alice).deactivateDevice(0)).wait();
    assert(Number(await reg.deviceStatus(0)) === 0, "should be Inactive (0)");
    assert(!(await reg.isDeviceActive(0)), "isDeviceActive should be false");
  });

  await test("non-owner cannot deactivate", async () => {
    const reg = await deploySimple();
    await (await reg.registerDevice(alice.address, FW_HASH, DEVICE_URI)).wait();
    try {
      await reg.connect(attacker).deactivateDevice(0);
      assert(false, "should revert");
    } catch (e) {
      assert(e.message.includes("revert"), "wrong error");
    }
  });

  await test("admin can reactivate inactive device", async () => {
    const reg = await deploySimple();
    await (await reg.registerDevice(alice.address, FW_HASH, DEVICE_URI)).wait();
    await (await reg.connect(alice).deactivateDevice(0)).wait();
    await (await reg.reactivateDevice(0)).wait();
    assert(Number(await reg.deviceStatus(0)) === 1, "should be Active (1)");
  });

  await test("revert reactivating already active device", async () => {
    const reg = await deploySimple();
    await (await reg.registerDevice(alice.address, FW_HASH, DEVICE_URI)).wait();
    try {
      await reg.reactivateDevice(0);
      assert(false, "should revert");
    } catch (e) {
      assert(e.message.includes("revert"), "wrong error");
    }
  });

  await test("admin can suspend active device", async () => {
    const reg = await deploySimple();
    await (await reg.registerDevice(alice.address, FW_HASH, DEVICE_URI)).wait();
    await (await reg.suspendDevice(0)).wait();
    assert(Number(await reg.deviceStatus(0)) === 2, "should be Suspended (2)");
  });

  await test("can reactivate a suspended device", async () => {
    const reg = await deploySimple();
    await (await reg.registerDevice(alice.address, FW_HASH, DEVICE_URI)).wait();
    await (await reg.suspendDevice(0)).wait();
    await (await reg.reactivateDevice(0)).wait();
    assert(Number(await reg.deviceStatus(0)) === 1, "should be Active (1)");
  });

  // ═══════════════════════════════════════════
  //  DeviceRegistry — Firmware
  // ═══════════════════════════════════════════
  console.log("\n  DeviceRegistry — Firmware Updates");

  await test("admin can update firmware hash", async () => {
    const reg = await deploySimple();
    await (await reg.registerDevice(alice.address, FW_HASH, DEVICE_URI)).wait();
    await (await reg.updateFirmware(0, FW_HASH_V2)).wait();
    assert((await reg.firmwareHash(0)) === FW_HASH_V2, "wrong new hash");
  });

  await test("reverts firmware update with zero hash", async () => {
    const reg = await deploySimple();
    await (await reg.registerDevice(alice.address, FW_HASH, DEVICE_URI)).wait();
    try {
      await reg.updateFirmware(0, ethers.ZeroHash);
      assert(false, "should revert");
    } catch (e) {
      assert(e.message.includes("revert"), "wrong error");
    }
  });

  await test("reverts firmware update by non-admin", async () => {
    const reg = await deploySimple();
    await (await reg.registerDevice(alice.address, FW_HASH, DEVICE_URI)).wait();
    try {
      await reg.connect(attacker).updateFirmware(0, FW_HASH_V2);
      assert(false, "should revert");
    } catch (e) {
      assert(e.message.includes("revert"), "wrong error");
    }
  });

  // ═══════════════════════════════════════════
  //  DeviceRegistry — ERC-721 Transfers
  // ═══════════════════════════════════════════
  console.log("\n  DeviceRegistry — ERC-721 Transfers");

  await test("device owner can transfer NFT", async () => {
    const reg = await deploySimple();
    await (await reg.registerDevice(alice.address, FW_HASH, DEVICE_URI)).wait();
    await (await reg.connect(alice).transferFrom(alice.address, bob.address, 0)).wait();
    assert((await reg.ownerOf(0)) === bob.address, "wrong new owner");
  });

  await test("transfer retains device status and firmware", async () => {
    const reg = await deploySimple();
    await (await reg.registerDevice(alice.address, FW_HASH, DEVICE_URI)).wait();
    await (await reg.connect(alice).transferFrom(alice.address, bob.address, 0)).wait();
    assert(Number(await reg.deviceStatus(0)) === 1, "should still be Active");
    assert((await reg.firmwareHash(0)) === FW_HASH, "firmware should persist");
  });

  // ═══════════════════════════════════════════
  //  DeviceRegistry — Enumeration
  // ═══════════════════════════════════════════
  console.log("\n  DeviceRegistry — Enumeration");

  await test("reports total supply correctly", async () => {
    const reg = await deploySimple();
    await (await reg.registerDevice(alice.address, FW_HASH, "uri-0")).wait();
    await (await reg.registerDevice(bob.address, FW_HASH, "uri-1")).wait();
    assert(Number(await reg.totalSupply()) === 2, "totalSupply should be 2");
  });

  await test("enumerates tokens by owner index", async () => {
    const reg = await deploySimple();
    await (await reg.registerDevice(alice.address, FW_HASH, "uri-0")).wait();
    await (await reg.registerDevice(alice.address, FW_HASH, "uri-1")).wait();
    assert(Number(await reg.tokenOfOwnerByIndex(alice.address, 0)) === 0, "wrong token 0");
    assert(Number(await reg.tokenOfOwnerByIndex(alice.address, 1)) === 1, "wrong token 1");
  });

  // ═══════════════════════════════════════════
  //  DeviceRegistry — View Edge Cases
  // ═══════════════════════════════════════════
  console.log("\n  DeviceRegistry — View Edge Cases");

  await test("isDeviceActive returns false for non-existent device", async () => {
    const reg = await deploySimple();
    assert(!(await reg.isDeviceActive(999)), "should be false for non-existent");
  });

  // ═══════════════════════════════════════════
  //  DataAnchor — Single Anchor
  // ═══════════════════════════════════════════
  console.log("\n  DataAnchor — Single Anchor");

  await test("anchors a data hash successfully", async () => {
    const reg = await deployAnchored();
    await (await reg.registerDevice(alice.address, FW_HASH, DEVICE_URI)).wait();
    await (await reg.connect(alice).anchorData(0, DATA_HASH_1)).wait();
    assert(await reg.isAnchored(DATA_HASH_1), "should be anchored");
  });

  await test("stores anchor record correctly", async () => {
    const reg = await deployAnchored();
    await (await reg.registerDevice(alice.address, FW_HASH, DEVICE_URI)).wait();
    const tx = await reg.connect(alice).anchorData(0, DATA_HASH_1);
    const receipt = await tx.wait();
    const block = await provider.getBlock(receipt.blockNumber);

    const result = await reg.getAnchor(DATA_HASH_1);
    assert(Number(result[0]) === 0, "wrong deviceId");
    assert(Number(result[1]) === block.timestamp, "wrong timestamp");
    assert(Number(result[2]) === receipt.blockNumber, "wrong blockNumber");
  });

  await test("increments device nonce", async () => {
    const reg = await deployAnchored();
    await (await reg.registerDevice(alice.address, FW_HASH, DEVICE_URI)).wait();
    assert(Number(await reg.deviceNonce(0)) === 0, "nonce should start at 0");
    await (await reg.connect(alice).anchorData(0, DATA_HASH_1)).wait();
    assert(Number(await reg.deviceNonce(0)) === 1, "nonce should be 1");
    await (await reg.connect(alice).anchorData(0, DATA_HASH_2)).wait();
    assert(Number(await reg.deviceNonce(0)) === 2, "nonce should be 2");
  });

  await test("increments device anchor count", async () => {
    const reg = await deployAnchored();
    await (await reg.registerDevice(alice.address, FW_HASH, DEVICE_URI)).wait();
    await (await reg.connect(alice).anchorData(0, DATA_HASH_1)).wait();
    assert(Number(await reg.deviceAnchorCount(0)) === 1, "count should be 1");
  });

  await test("reverts with zero data hash", async () => {
    const reg = await deployAnchored();
    await (await reg.registerDevice(alice.address, FW_HASH, DEVICE_URI)).wait();
    try {
      await reg.connect(alice).anchorData(0, ethers.ZeroHash);
      assert(false, "should revert");
    } catch (e) {
      assert(e.message.includes("revert"), "wrong error");
    }
  });

  await test("reverts on duplicate anchor", async () => {
    const reg = await deployAnchored();
    await (await reg.registerDevice(alice.address, FW_HASH, DEVICE_URI)).wait();
    await (await reg.connect(alice).anchorData(0, DATA_HASH_1)).wait();
    try {
      await reg.connect(alice).anchorData(0, DATA_HASH_1);
      assert(false, "should revert");
    } catch (e) {
      assert(e.message.includes("revert"), "wrong error");
    }
  });

  // ═══════════════════════════════════════════
  //  DataAnchor — Batch Anchor
  // ═══════════════════════════════════════════
  console.log("\n  DataAnchor — Batch Anchor");

  await test("anchors a batch of data hashes", async () => {
    const reg = await deployAnchored();
    await (await reg.registerDevice(alice.address, FW_HASH, DEVICE_URI)).wait();
    const hashes = [DATA_HASH_1, DATA_HASH_2, DATA_HASH_3];
    await (await reg.connect(alice).anchorBatch(0, hashes)).wait();

    const batchRoot = ethers.keccak256(ethers.solidityPacked(
      ["bytes32", "bytes32", "bytes32"],
      hashes
    ));
    assert(await reg.isAnchored(batchRoot), "batch root should be anchored");
  });

  await test("increments nonce and count for batch", async () => {
    const reg = await deployAnchored();
    await (await reg.registerDevice(alice.address, FW_HASH, DEVICE_URI)).wait();
    await (await reg.connect(alice).anchorBatch(0, [DATA_HASH_1, DATA_HASH_2])).wait();
    assert(Number(await reg.deviceNonce(0)) === 1, "nonce should be 1");
    assert(Number(await reg.deviceAnchorCount(0)) === 1, "count should be 1");
  });

  await test("reverts with empty batch", async () => {
    const reg = await deployAnchored();
    await (await reg.registerDevice(alice.address, FW_HASH, DEVICE_URI)).wait();
    try {
      await reg.connect(alice).anchorBatch(0, []);
      assert(false, "should revert");
    } catch (e) {
      assert(e.message.includes("revert"), "wrong error");
    }
  });

  await test("reverts on duplicate batch root", async () => {
    const reg = await deployAnchored();
    await (await reg.registerDevice(alice.address, FW_HASH, DEVICE_URI)).wait();
    const hashes = [DATA_HASH_1, DATA_HASH_2];
    await (await reg.connect(alice).anchorBatch(0, hashes)).wait();
    try {
      await reg.connect(alice).anchorBatch(0, hashes);
      assert(false, "should revert");
    } catch (e) {
      assert(e.message.includes("revert"), "wrong error");
    }
  });

  // ═══════════════════════════════════════════
  //  DataAnchor — Verification
  // ═══════════════════════════════════════════
  console.log("\n  DataAnchor — Verification");

  await test("isAnchored returns false for unknown hash", async () => {
    const reg = await deployAnchored();
    assert(!(await reg.isAnchored(DATA_HASH_1)), "should be false");
  });

  await test("getAnchor reverts for unknown hash", async () => {
    const reg = await deployAnchored();
    try {
      await reg.getAnchor(DATA_HASH_1);
      assert(false, "should revert");
    } catch (e) {
      assert(e.message.includes("revert"), "wrong error");
    }
  });

  // ═══════════════════════════════════════════
  //  DataAnchor — Access Control
  // ═══════════════════════════════════════════
  console.log("\n  DataAnchor — Access Control");

  await test("non-owner cannot anchor data", async () => {
    const reg = await deployAnchored();
    await (await reg.registerDevice(alice.address, FW_HASH, DEVICE_URI)).wait();
    try {
      await reg.connect(attacker).anchorData(0, DATA_HASH_1);
      assert(false, "should revert");
    } catch (e) {
      assert(e.message.includes("revert"), "wrong error");
    }
  });

  await test("new owner can anchor after transfer", async () => {
    const reg = await deployAnchored();
    await (await reg.registerDevice(alice.address, FW_HASH, DEVICE_URI)).wait();
    await (await reg.connect(alice).transferFrom(alice.address, bob.address, 0)).wait();

    // Alice can no longer anchor
    try {
      await reg.connect(alice).anchorData(0, DATA_HASH_1);
      assert(false, "should revert");
    } catch (e) {
      assert(e.message.includes("revert"), "wrong error");
    }

    // Bob can anchor
    await (await reg.connect(bob).anchorData(0, DATA_HASH_1)).wait();
    assert(await reg.isAnchored(DATA_HASH_1), "should be anchored");
  });

  // ═══════════════════════════════════════════
  //  Integration — Registry + Anchor
  // ═══════════════════════════════════════════
  console.log("\n  Integration — DeviceRegistry + DataAnchor");

  await test("reverts anchor for inactive device", async () => {
    const reg = await deployAnchored();
    await (await reg.registerDevice(alice.address, FW_HASH, DEVICE_URI)).wait();
    await (await reg.connect(alice).deactivateDevice(0)).wait();
    try {
      await reg.connect(alice).anchorData(0, DATA_HASH_1);
      assert(false, "should revert");
    } catch (e) {
      assert(e.message.includes("revert"), "wrong error");
    }
  });

  await test("reverts anchor for suspended device", async () => {
    const reg = await deployAnchored();
    await (await reg.registerDevice(alice.address, FW_HASH, DEVICE_URI)).wait();
    await (await reg.suspendDevice(0)).wait();
    try {
      await reg.connect(alice).anchorData(0, DATA_HASH_1);
      assert(false, "should revert");
    } catch (e) {
      assert(e.message.includes("revert"), "wrong error");
    }
  });

  await test("allows anchor after reactivation", async () => {
    const reg = await deployAnchored();
    await (await reg.registerDevice(alice.address, FW_HASH, DEVICE_URI)).wait();
    await (await reg.connect(alice).deactivateDevice(0)).wait();
    await (await reg.reactivateDevice(0)).wait();
    await (await reg.connect(alice).anchorData(0, DATA_HASH_1)).wait();
    assert(await reg.isAnchored(DATA_HASH_1), "should be anchored");
  });

  await test("multiple devices anchor independently", async () => {
    const reg = await deployAnchored();
    await (await reg.registerDevice(alice.address, FW_HASH, DEVICE_URI)).wait();
    await (await reg.registerDevice(bob.address, FW_HASH, "uri-1")).wait();

    await (await reg.connect(alice).anchorData(0, DATA_HASH_1)).wait();
    await (await reg.connect(bob).anchorData(1, DATA_HASH_2)).wait();

    const a1 = await reg.getAnchor(DATA_HASH_1);
    const a2 = await reg.getAnchor(DATA_HASH_2);
    assert(Number(a1[0]) === 0, "device 0 wrong");
    assert(Number(a2[0]) === 1, "device 1 wrong");
    assert(Number(await reg.deviceAnchorCount(0)) === 1, "count 0 wrong");
    assert(Number(await reg.deviceAnchorCount(1)) === 1, "count 1 wrong");
  });

  // ═══════════════════════════════════════════
  //  End-to-End
  // ═══════════════════════════════════════════
  console.log("\n  End-to-End: Device Lifecycle + Data Anchoring");

  await test("full lifecycle: register → anchor → transfer → anchor → deactivate", async () => {
    const reg = await deployAnchored();

    // 1. Admin registers device for alice
    await (await reg.registerDevice(alice.address, FW_HASH, DEVICE_URI)).wait();
    assert(Number(await reg.deviceCount()) === 1, "should have 1 device");

    // 2. Alice anchors sensor data
    await (await reg.connect(alice).anchorData(0, DATA_HASH_1)).wait();
    assert(await reg.isAnchored(DATA_HASH_1), "hash 1 anchored");

    // 3. Admin updates firmware
    await (await reg.updateFirmware(0, FW_HASH_V2)).wait();
    assert((await reg.firmwareHash(0)) === FW_HASH_V2, "firmware updated");

    // 4. Alice transfers device to bob
    await (await reg.connect(alice).transferFrom(alice.address, bob.address, 0)).wait();
    assert((await reg.ownerOf(0)) === bob.address, "bob is new owner");

    // 5. Bob anchors more data
    await (await reg.connect(bob).anchorData(0, DATA_HASH_2)).wait();
    assert(Number(await reg.deviceAnchorCount(0)) === 2, "2 anchors total");

    // 6. Bob deactivates device
    await (await reg.connect(bob).deactivateDevice(0)).wait();
    assert(!(await reg.isDeviceActive(0)), "device deactivated");

    // 7. Verify historical anchors still accessible
    assert(await reg.isAnchored(DATA_HASH_1), "hash 1 still accessible");
    assert(await reg.isAnchored(DATA_HASH_2), "hash 2 still accessible");
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
