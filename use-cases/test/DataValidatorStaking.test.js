/**
 * @file DataValidatorStaking.test.js
 * @description Tests for the Staking & Data Validation Rewards use case.
 *
 * Covers: staking, unstaking cooldown, validation tasks, reward distribution,
 * slashing, device confidence scores, and access control.
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("DataValidatorStaking", function () {
  const MIN_STAKE = ethers.parseEther("1000");
  const COOLDOWN = 7 * 24 * 60 * 60;  // 7 days
  const REWARD = ethers.parseEther("10");
  const SLASH = ethers.parseEther("50");

  let token, staking, stakingAddr;
  let admin, validator1, validator2, other;

  beforeEach(async function () {
    [admin, validator1, validator2, other] = await ethers.getSigners();

    // Deploy token
    token = await (await ethers.getContractFactory("NGEGovernanceToken"))
      .deploy(ethers.parseEther("100000000"), ethers.parseEther("1000000"));
    await token.waitForDeployment();

    // Deploy staking
    staking = await (await ethers.getContractFactory("DataValidatorStaking"))
      .deploy(await token.getAddress(), MIN_STAKE, COOLDOWN, REWARD, SLASH);
    await staking.waitForDeployment();
    stakingAddr = await staking.getAddress();

    // Fund reward pool
    await token.approve(stakingAddr, ethers.parseEther("100000"));
    await staking.fundRewards(ethers.parseEther("100000"));

    // Give validators tokens
    await token.transfer(validator1.address, ethers.parseEther("10000"));
    await token.transfer(validator2.address, ethers.parseEther("10000"));
  });

  // ─────────────────────────────────────────────
  //  Staking
  // ─────────────────────────────────────────────

  describe("Staking", function () {
    it("validator can stake tokens", async function () {
      await token.connect(validator1).approve(stakingAddr, ethers.parseEther("5000"));
      await expect(staking.connect(validator1).stake(ethers.parseEther("5000")))
        .to.emit(staking, "Staked")
        .withArgs(validator1.address, ethers.parseEther("5000"));
    });

    it("tracks staked amount", async function () {
      await token.connect(validator1).approve(stakingAddr, ethers.parseEther("5000"));
      await staking.connect(validator1).stake(ethers.parseEther("5000"));
      const [staked] = await staking.getValidator(validator1.address);
      expect(staked).to.equal(ethers.parseEther("5000"));
    });

    it("increments active validator count", async function () {
      await token.connect(validator1).approve(stakingAddr, ethers.parseEther("5000"));
      await staking.connect(validator1).stake(ethers.parseEther("5000"));
      expect(await staking.activeValidatorCount()).to.equal(1);
    });
  });

  // ─────────────────────────────────────────────
  //  Unstaking
  // ─────────────────────────────────────────────

  describe("Unstaking", function () {
    beforeEach(async function () {
      await token.connect(validator1).approve(stakingAddr, ethers.parseEther("5000"));
      await staking.connect(validator1).stake(ethers.parseEther("5000"));
    });

    it("validator can request unstake", async function () {
      await expect(staking.connect(validator1).requestUnstake())
        .to.emit(staking, "UnstakeRequested");
    });

    it("cannot unstake before cooldown", async function () {
      await staking.connect(validator1).requestUnstake();
      await expect(
        staking.connect(validator1).unstake()
      ).to.be.revertedWithCustomError(staking, "CooldownNotElapsed");
    });

    it("can unstake after cooldown", async function () {
      await staking.connect(validator1).requestUnstake();
      await time.increase(COOLDOWN + 1);

      const balBefore = await token.balanceOf(validator1.address);
      await staking.connect(validator1).unstake();
      const balAfter = await token.balanceOf(validator1.address);
      expect(balAfter - balBefore).to.equal(ethers.parseEther("5000"));
    });

    it("reverts unstake without request", async function () {
      await expect(
        staking.connect(validator1).unstake()
      ).to.be.revertedWithCustomError(staking, "NoUnstakeRequested");
    });

    it("decrements active validator count", async function () {
      await staking.connect(validator1).requestUnstake();
      await time.increase(COOLDOWN + 1);
      await staking.connect(validator1).unstake();
      expect(await staking.activeValidatorCount()).to.equal(0);
    });
  });

  // ─────────────────────────────────────────────
  //  Validation Tasks
  // ─────────────────────────────────────────────

  describe("Validation Tasks", function () {
    const deviceId = 42;
    const dataHash = ethers.keccak256(ethers.toUtf8Bytes("suspicious-reading"));

    beforeEach(async function () {
      // Stake both validators
      await token.connect(validator1).approve(stakingAddr, ethers.parseEther("5000"));
      await staking.connect(validator1).stake(ethers.parseEther("5000"));
      await token.connect(validator2).approve(stakingAddr, ethers.parseEther("5000"));
      await staking.connect(validator2).stake(ethers.parseEther("5000"));
    });

    it("admin creates a task", async function () {
      await expect(staking.createTask(deviceId, dataHash))
        .to.emit(staking, "TaskCreated")
        .withArgs(1, deviceId, dataHash);
    });

    it("validator submits validation", async function () {
      await staking.createTask(deviceId, dataHash);
      await expect(staking.connect(validator1).submitValidation(1, true))
        .to.emit(staking, "ValidationSubmitted")
        .withArgs(1, validator1.address, true);
    });

    it("cannot validate twice", async function () {
      await staking.createTask(deviceId, dataHash);
      await staking.connect(validator1).submitValidation(1, true);
      await expect(
        staking.connect(validator1).submitValidation(1, false)
      ).to.be.revertedWithCustomError(staking, "AlreadyValidated");
    });

    it("rejects understaked validator", async function () {
      await staking.createTask(deviceId, dataHash);
      // other has no stake
      await expect(
        staking.connect(other).submitValidation(1, true)
      ).to.be.revertedWithCustomError(staking, "InsufficientStake");
    });

    it("admin resolves task", async function () {
      await staking.createTask(deviceId, dataHash);
      await staking.connect(validator1).submitValidation(1, true);
      await expect(staking.resolveTask(1, true))
        .to.emit(staking, "ValidationResolved")
        .withArgs(1, true);
    });
  });

  // ─────────────────────────────────────────────
  //  Rewards & Slashing
  // ─────────────────────────────────────────────

  describe("Rewards & Slashing", function () {
    const deviceId = 42;
    const dataHash = ethers.keccak256(ethers.toUtf8Bytes("test-reading"));

    beforeEach(async function () {
      await token.connect(validator1).approve(stakingAddr, ethers.parseEther("5000"));
      await staking.connect(validator1).stake(ethers.parseEther("5000"));
      await token.connect(validator2).approve(stakingAddr, ethers.parseEther("5000"));
      await staking.connect(validator2).stake(ethers.parseEther("5000"));

      await staking.createTask(deviceId, dataHash);
      await staking.connect(validator1).submitValidation(1, true);  // flags anomaly
      await staking.connect(validator2).submitValidation(1, false); // clears it
      await staking.resolveTask(1, true); // it WAS an anomaly
    });

    it("rewards correct validator", async function () {
      const balBefore = await token.balanceOf(validator1.address);
      await staking.distributeReward(1, validator1.address);
      const balAfter = await token.balanceOf(validator1.address);
      expect(balAfter - balBefore).to.equal(REWARD);
    });

    it("slashes incorrect validator", async function () {
      await expect(staking.distributeReward(1, validator2.address))
        .to.emit(staking, "Slashed")
        .withArgs(validator2.address, SLASH);

      const [staked] = await staking.getValidator(validator2.address);
      expect(staked).to.equal(ethers.parseEther("5000") - SLASH);
    });

    it("tracks validator stats", async function () {
      await staking.distributeReward(1, validator1.address);
      const [, rewards, slashed, validations] = await staking.getValidator(validator1.address);
      expect(rewards).to.equal(REWARD);
      expect(slashed).to.equal(0);
      expect(validations).to.equal(1);
    });
  });

  // ─────────────────────────────────────────────
  //  Device Confidence
  // ─────────────────────────────────────────────

  describe("Device Confidence", function () {
    it("returns 100 for unknown device", async function () {
      expect(await staking.deviceConfidenceScore(999)).to.equal(100);
    });

    it("tracks anomalies in score", async function () {
      const hash1 = ethers.keccak256(ethers.toUtf8Bytes("r1"));
      const hash2 = ethers.keccak256(ethers.toUtf8Bytes("r2"));

      await token.connect(validator1).approve(stakingAddr, ethers.parseEther("5000"));
      await staking.connect(validator1).stake(ethers.parseEther("5000"));

      // Task 1: anomaly
      await staking.createTask(42, hash1);
      await staking.connect(validator1).submitValidation(1, true);
      await staking.resolveTask(1, true);

      // Task 2: no anomaly
      await staking.createTask(42, hash2);
      await staking.connect(validator1).submitValidation(2, false);
      await staking.resolveTask(2, false);

      // 1 anomaly out of 2 validations = 50% confidence
      expect(await staking.deviceConfidenceScore(42)).to.equal(50);
    });
  });

  // ─────────────────────────────────────────────
  //  End-to-end
  // ─────────────────────────────────────────────

  describe("End-to-end: Validate, reward, slash", function () {
    it("full validation lifecycle", async function () {
      // Stake
      await token.connect(validator1).approve(stakingAddr, ethers.parseEther("5000"));
      await staking.connect(validator1).stake(ethers.parseEther("5000"));

      // Create task
      const hash = ethers.keccak256(ethers.toUtf8Bytes("lifecycle"));
      await staking.createTask(1, hash);

      // Validate (correctly)
      await staking.connect(validator1).submitValidation(1, true);

      // Resolve as anomaly
      await staking.resolveTask(1, true);

      // Reward
      await staking.distributeReward(1, validator1.address);

      // Check stats
      const [staked, rewards, , validations] = await staking.getValidator(validator1.address);
      expect(staked).to.equal(ethers.parseEther("5000"));
      expect(rewards).to.equal(REWARD);
      expect(validations).to.equal(1);

      // Unstake
      await staking.connect(validator1).requestUnstake();
      await time.increase(COOLDOWN + 1);
      await staking.connect(validator1).unstake();

      const [stakedAfter] = await staking.getValidator(validator1.address);
      expect(stakedAfter).to.equal(0);
    });
  });
});
