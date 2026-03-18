/**
 * @file SignedDataAnchor.test.js
 * @description Tests for EIP-712 signed data anchoring via SignedAnchorRegistry.
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SignedDataAnchor", function () {
  const FW_HASH = ethers.keccak256(ethers.toUtf8Bytes("firmware-v1.0"));
  const DEVICE_URI = "https://api.nextgen.economy/devices/0.json";

  let registry, registryAddr;
  let owner, alice, bob;
  let chainId;

  // EIP-712 type definitions
  const ANCHOR_TYPEHASH = ethers.keccak256(
    ethers.toUtf8Bytes("AnchorData(uint256 deviceId,bytes32 dataHash,uint256 nonce)")
  );
  const BATCH_TYPEHASH = ethers.keccak256(
    ethers.toUtf8Bytes("AnchorBatch(uint256 deviceId,bytes32 batchRoot,uint256 count,uint256 nonce)")
  );

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("SignedAnchorRegistry");
    registry = await Factory.deploy();
    await registry.waitForDeployment();
    registryAddr = await registry.getAddress();
    chainId = (await ethers.provider.getNetwork()).chainId;

    // Register a device owned by Alice
    await registry.registerDevice(alice.address, FW_HASH, DEVICE_URI);
  });

  async function signAnchorData(signer, deviceId, dataHash, nonce) {
    const domain = {
      name: "NGE SignedDataAnchor",
      version: "1",
      chainId: chainId,
      verifyingContract: registryAddr,
    };

    const types = {
      AnchorData: [
        { name: "deviceId", type: "uint256" },
        { name: "dataHash", type: "bytes32" },
        { name: "nonce", type: "uint256" },
      ],
    };

    const value = { deviceId, dataHash, nonce };
    return signer.signTypedData(domain, types, value);
  }

  async function signBatchAnchor(signer, deviceId, batchRoot, count, nonce) {
    const domain = {
      name: "NGE SignedDataAnchor",
      version: "1",
      chainId: chainId,
      verifyingContract: registryAddr,
    };

    const types = {
      AnchorBatch: [
        { name: "deviceId", type: "uint256" },
        { name: "batchRoot", type: "bytes32" },
        { name: "count", type: "uint256" },
        { name: "nonce", type: "uint256" },
      ],
    };

    const value = { deviceId, batchRoot, count, nonce };
    return signer.signTypedData(domain, types, value);
  }

  describe("Single Signed Anchor", function () {
    it("anchors data with valid EIP-712 signature from device owner", async function () {
      const dataHash = ethers.keccak256(ethers.toUtf8Bytes("temperature:22.5C"));
      const nonce = await registry.deviceNonce(0);
      const sig = await signAnchorData(alice, 0, dataHash, nonce);

      // Anyone can relay the signed anchor
      await expect(registry.connect(bob).anchorDataSigned(0, dataHash, sig))
        .to.emit(registry, "DataAnchored")
        .withArgs(0, dataHash, (await ethers.provider.getBlock("latest")).timestamp + 1, 0);

      expect(await registry.isAnchored(dataHash)).to.equal(true);
      expect(await registry.deviceAnchorCount(0)).to.equal(1);
    });

    it("rejects invalid signature (wrong signer)", async function () {
      const dataHash = ethers.keccak256(ethers.toUtf8Bytes("temperature:22.5C"));
      const nonce = await registry.deviceNonce(0);
      // Bob signs but Alice owns the device
      const sig = await signAnchorData(bob, 0, dataHash, nonce);

      await expect(
        registry.anchorDataSigned(0, dataHash, sig)
      ).to.be.revertedWithCustomError(registry, "InvalidSignature");
    });

    it("rejects replay (same data hash)", async function () {
      const dataHash = ethers.keccak256(ethers.toUtf8Bytes("temperature:22.5C"));
      const nonce = await registry.deviceNonce(0);
      const sig = await signAnchorData(alice, 0, dataHash, nonce);

      await registry.anchorDataSigned(0, dataHash, sig);

      // Replay with a new signature for the same data hash
      const nonce2 = await registry.deviceNonce(0);
      const sig2 = await signAnchorData(alice, 0, dataHash, nonce2);

      await expect(
        registry.anchorDataSigned(0, dataHash, sig2)
      ).to.be.revertedWithCustomError(registry, "AlreadyAnchored");
    });

    it("increments nonce after each anchor", async function () {
      expect(await registry.deviceNonce(0)).to.equal(0);

      const dataHash1 = ethers.keccak256(ethers.toUtf8Bytes("reading-1"));
      const sig1 = await signAnchorData(alice, 0, dataHash1, 0);
      await registry.anchorDataSigned(0, dataHash1, sig1);

      expect(await registry.deviceNonce(0)).to.equal(1);

      const dataHash2 = ethers.keccak256(ethers.toUtf8Bytes("reading-2"));
      const sig2 = await signAnchorData(alice, 0, dataHash2, 1);
      await registry.anchorDataSigned(0, dataHash2, sig2);

      expect(await registry.deviceNonce(0)).to.equal(2);
    });
  });

  describe("Batch Signed Anchor", function () {
    it("anchors a batch with valid signature", async function () {
      const hashes = [
        ethers.keccak256(ethers.toUtf8Bytes("temp:22C")),
        ethers.keccak256(ethers.toUtf8Bytes("humidity:65%")),
      ];
      const batchRoot = ethers.keccak256(ethers.solidityPacked(["bytes32", "bytes32"], hashes));
      const nonce = await registry.deviceNonce(0);
      const sig = await signBatchAnchor(alice, 0, batchRoot, hashes.length, nonce);

      await expect(registry.connect(bob).anchorBatchSigned(0, hashes, sig))
        .to.emit(registry, "BatchAnchored");

      expect(await registry.isAnchored(batchRoot)).to.equal(true);
    });
  });

  describe("View functions", function () {
    it("exposes domain separator and typehashes", async function () {
      expect(await registry.domainSeparator()).to.not.equal(ethers.ZeroHash);
      expect(await registry.ANCHOR_TYPEHASH()).to.equal(ANCHOR_TYPEHASH);
      expect(await registry.BATCH_TYPEHASH()).to.equal(BATCH_TYPEHASH);
    });
  });
});
