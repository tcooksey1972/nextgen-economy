/**
 * Interact: AnchoredDeviceRegistry
 * Exercises the full IoT device lifecycle and data anchoring on a local Hardhat node.
 *
 * Covers: device registration, firmware updates, data anchoring, batch anchoring,
 * device deactivation/reactivation/suspension, NFT transfers, and access control.
 *
 * Usage:
 *   npx hardhat run scripts/interact.js --network localhost
 */
const { ethers } = require("hardhat");

async function main() {
  const [owner, deviceOwner1, deviceOwner2, unauthorized] = await ethers.getSigners();

  // ─────────────────────────────────────────────
  //  Step 1: Deploy AnchoredDeviceRegistry
  // ─────────────────────────────────────────────
  console.log("=== AnchoredDeviceRegistry: Interaction Script ===\n");
  console.log("--- Step 1: Deploy AnchoredDeviceRegistry ---");

  const Factory = await ethers.getContractFactory("AnchoredDeviceRegistry");
  const registry = await Factory.deploy();
  await registry.waitForDeployment();
  const registryAddr = await registry.getAddress();

  console.log("  Registry deployed to:", registryAddr);
  console.log("  Name:", await registry.name());
  console.log("  Symbol:", await registry.symbol());
  console.log("  Owner:", owner.address);

  // ─────────────────────────────────────────────
  //  Step 2: Register devices
  // ─────────────────────────────────────────────
  console.log("\n--- Step 2: Register devices ---");

  const fwHash1 = ethers.keccak256(ethers.toUtf8Bytes("firmware-v1.0.0-sensor-alpha"));
  const fwHash2 = ethers.keccak256(ethers.toUtf8Bytes("firmware-v2.1.0-gateway-beta"));

  const tx1 = await registry.registerDevice(
    deviceOwner1.address,
    fwHash1,
    "https://api.nextgen.economy/devices/0"
  );
  await tx1.wait();
  console.log("  Device 0 registered to:", deviceOwner1.address);
  console.log("  Firmware hash:", fwHash1.slice(0, 18) + "...");

  const tx2 = await registry.registerDevice(
    deviceOwner2.address,
    fwHash2,
    "https://api.nextgen.economy/devices/1"
  );
  await tx2.wait();
  console.log("  Device 1 registered to:", deviceOwner2.address);
  console.log("  Total devices:", (await registry.deviceCount()).toString());

  // Non-admin cannot register
  try {
    const fakeHash = ethers.keccak256(ethers.toUtf8Bytes("fake"));
    await registry.connect(unauthorized).registerDevice(unauthorized.address, fakeHash, "");
    console.log("  ERROR: Should have reverted!");
  } catch (error) {
    console.log("  Non-admin registration correctly reverted");
  }

  // ─────────────────────────────────────────────
  //  Step 3: Query device info
  // ─────────────────────────────────────────────
  console.log("\n--- Step 3: Query device info ---");

  const status0 = await registry.deviceStatus(0);
  const statusLabels = ["Inactive", "Active", "Suspended"];
  console.log("  Device 0 status:", statusLabels[Number(status0)]);
  console.log("  Device 0 active:", await registry.isDeviceActive(0));
  console.log("  Device 0 firmware:", (await registry.firmwareHash(0)).slice(0, 18) + "...");
  console.log("  Device 0 owner (NFT):", await registry.ownerOf(0));
  console.log("  Device 0 tokenURI:", await registry.tokenURI(0));

  // ─────────────────────────────────────────────
  //  Step 4: Anchor sensor data
  // ─────────────────────────────────────────────
  console.log("\n--- Step 4: Anchor sensor data ---");

  const sensorData1 = ethers.keccak256(ethers.toUtf8Bytes("temp:22.5,humidity:45,ts:1700000001"));
  const tx3 = await registry.connect(deviceOwner1).anchorData(0, sensorData1);
  await tx3.wait();
  console.log("  Anchored data for device 0");
  console.log("  Data hash:", sensorData1.slice(0, 18) + "...");
  console.log("  Is anchored:", await registry.isAnchored(sensorData1));

  const anchor = await registry.getAnchor(sensorData1);
  console.log("  Anchor deviceId:", anchor[0].toString());
  console.log("  Anchor timestamp:", anchor[1].toString());
  console.log("  Device 0 anchor count:", (await registry.deviceAnchorCount(0)).toString());

  // Non-owner cannot anchor data for someone else's device
  try {
    const fakeData = ethers.keccak256(ethers.toUtf8Bytes("fake-reading"));
    await registry.connect(unauthorized).anchorData(0, fakeData);
    console.log("  ERROR: Should have reverted!");
  } catch (error) {
    console.log("  Non-device-owner anchor correctly reverted");
  }

  // ─────────────────────────────────────────────
  //  Step 5: Batch anchor data
  // ─────────────────────────────────────────────
  console.log("\n--- Step 5: Batch anchor data ---");

  const batchHashes = [
    ethers.keccak256(ethers.toUtf8Bytes("temp:23.1,humidity:42,ts:1700000100")),
    ethers.keccak256(ethers.toUtf8Bytes("temp:23.3,humidity:41,ts:1700000200")),
    ethers.keccak256(ethers.toUtf8Bytes("temp:23.0,humidity:43,ts:1700000300")),
  ];

  const tx4 = await registry.connect(deviceOwner1).anchorBatch(0, batchHashes);
  await tx4.wait();
  console.log("  Batch anchored 3 readings for device 0");
  console.log("  Device 0 total anchors:", (await registry.deviceAnchorCount(0)).toString());
  console.log("  Device 0 nonce:", (await registry.deviceNonce(0)).toString());

  // ─────────────────────────────────────────────
  //  Step 6: Update firmware
  // ─────────────────────────────────────────────
  console.log("\n--- Step 6: Update firmware ---");

  const newFwHash = ethers.keccak256(ethers.toUtf8Bytes("firmware-v1.1.0-sensor-alpha-patched"));
  const tx5 = await registry.updateFirmware(0, newFwHash);
  await tx5.wait();
  console.log("  Device 0 firmware updated");
  console.log("  New firmware hash:", (await registry.firmwareHash(0)).slice(0, 18) + "...");

  // ─────────────────────────────────────────────
  //  Step 7: Deactivate and reactivate device
  // ─────────────────────────────────────────────
  console.log("\n--- Step 7: Deactivate and reactivate device ---");

  const tx6 = await registry.connect(deviceOwner1).deactivateDevice(0);
  await tx6.wait();
  console.log("  Device 0 deactivated by owner");
  console.log("  Device 0 active:", await registry.isDeviceActive(0));

  // Cannot anchor data for inactive device
  try {
    const inactiveData = ethers.keccak256(ethers.toUtf8Bytes("inactive-reading"));
    await registry.connect(deviceOwner1).anchorData(0, inactiveData);
    console.log("  ERROR: Should have reverted!");
  } catch (error) {
    console.log("  Anchor on inactive device correctly reverted");
  }

  // Admin reactivates
  const tx7 = await registry.reactivateDevice(0);
  await tx7.wait();
  console.log("  Device 0 reactivated by admin");
  console.log("  Device 0 active:", await registry.isDeviceActive(0));

  // ─────────────────────────────────────────────
  //  Step 8: Suspend device (compromised scenario)
  // ─────────────────────────────────────────────
  console.log("\n--- Step 8: Suspend device (compromised scenario) ---");

  const tx8 = await registry.suspendDevice(1);
  await tx8.wait();
  const status1 = await registry.deviceStatus(1);
  console.log("  Device 1 suspended by admin");
  console.log("  Device 1 status:", statusLabels[Number(status1)]);

  // ─────────────────────────────────────────────
  //  Step 9: Transfer device NFT
  // ─────────────────────────────────────────────
  console.log("\n--- Step 9: Transfer device NFT ---");

  const tx9 = await registry.connect(deviceOwner1).transferFrom(
    deviceOwner1.address,
    deviceOwner2.address,
    0
  );
  await tx9.wait();
  console.log("  Device 0 NFT transferred from deviceOwner1 to deviceOwner2");
  console.log("  New device 0 owner:", await registry.ownerOf(0));
  console.log("  deviceOwner2 device count:", (await registry.balanceOf(deviceOwner2.address)).toString());

  // New owner can anchor data
  const postTransferData = ethers.keccak256(ethers.toUtf8Bytes("new-owner-reading"));
  const tx10 = await registry.connect(deviceOwner2).anchorData(0, postTransferData);
  await tx10.wait();
  console.log("  New owner anchored data for device 0: success");

  // ─────────────────────────────────────────────
  //  Summary
  // ─────────────────────────────────────────────
  console.log("\n=== Summary ===");
  console.log("  Registry address:", registryAddr);
  console.log("  Total devices:", (await registry.deviceCount()).toString());
  console.log("  Device 0 — owner:", await registry.ownerOf(0), "| active:", await registry.isDeviceActive(0), "| anchors:", (await registry.deviceAnchorCount(0)).toString());
  console.log("  Device 1 — status:", statusLabels[Number(await registry.deviceStatus(1))]);
  console.log("  Registration, lifecycle, anchoring, batch, and NFT transfer all verified.");
  console.log("  Access control enforced for admin and device-owner operations.\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
