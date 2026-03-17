/**
 * @file DeviceToken.test.js
 * @description Tests for ERC-1155 DeviceToken via SimpleDeviceToken.
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DeviceToken (ERC1155)", function () {
  let token;
  let owner, alice, bob;

  const SENSOR_CREDITS = 0;
  const COMPUTE_CREDITS = 1;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("SimpleDeviceToken");
    token = await Factory.deploy();
    await token.waitForDeployment();
  });

  describe("Fungible sensor credits", function () {
    it("issues sensor credits", async function () {
      await token.issueSensorCredits(SENSOR_CREDITS, alice.address, 1000);
      expect(await token.balanceOf(alice.address, SENSOR_CREDITS)).to.equal(1000);
    });

    it("rejects issuing to NFT range", async function () {
      await expect(
        token.issueSensorCredits(1000, alice.address, 100)
      ).to.be.revertedWithCustomError(token, "TokenIdInNFTRange");
    });

    it("tracks total supply per token ID", async function () {
      await token.issueSensorCredits(SENSOR_CREDITS, alice.address, 500);
      await token.issueSensorCredits(SENSOR_CREDITS, bob.address, 300);
      expect(await token.totalSupply(SENSOR_CREDITS)).to.equal(800);
    });
  });

  describe("Device NFTs", function () {
    it("mints unique device NFTs starting at ID 1000", async function () {
      const tx1 = await token.mintDeviceNFT(alice.address);
      const receipt1 = await tx1.wait();
      expect(await token.balanceOf(alice.address, 1000)).to.equal(1);

      const tx2 = await token.mintDeviceNFT(bob.address);
      await tx2.wait();
      expect(await token.balanceOf(bob.address, 1001)).to.equal(1);
    });

    it("increments nextNFTId", async function () {
      expect(await token.nextNFTId()).to.equal(1000);
      await token.mintDeviceNFT(alice.address);
      expect(await token.nextNFTId()).to.equal(1001);
    });
  });

  describe("Batch operations", function () {
    it("batch mints multiple token types", async function () {
      await token.mintBatch(alice.address, [0, 1], [1000, 500]);
      expect(await token.balanceOf(alice.address, 0)).to.equal(1000);
      expect(await token.balanceOf(alice.address, 1)).to.equal(500);
    });
  });

  describe("Token metadata", function () {
    it("sets and reads token names", async function () {
      await token.setTokenName(0, "Sensor Credits");
      expect(await token.tokenName(0)).to.equal("Sensor Credits");
    });

    it("emits DeviceTokenTypeCreated with correct fungible flag", async function () {
      await expect(token.setTokenName(0, "Fungible"))
        .to.emit(token, "DeviceTokenTypeCreated")
        .withArgs(0, "Fungible", true);

      await expect(token.setTokenName(1000, "NFT"))
        .to.emit(token, "DeviceTokenTypeCreated")
        .withArgs(1000, "NFT", false);
    });

    it("admin can update URI", async function () {
      await token.setURI("https://new-api.example.com/{id}.json");
      // URI update doesn't have a getter per-token in base ERC1155
    });
  });

  describe("Burning (ERC1155Burnable)", function () {
    it("holders can burn their tokens", async function () {
      await token.issueSensorCredits(0, alice.address, 100);
      await token.connect(alice).burn(alice.address, 0, 50);
      expect(await token.balanceOf(alice.address, 0)).to.equal(50);
    });
  });

  describe("Access control", function () {
    it("only owner can issue credits", async function () {
      await expect(
        token.connect(alice).issueSensorCredits(0, alice.address, 100)
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });

    it("only owner can mint device NFTs", async function () {
      await expect(
        token.connect(alice).mintDeviceNFT(alice.address)
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });
  });
});
