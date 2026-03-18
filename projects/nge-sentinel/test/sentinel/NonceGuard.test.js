/**
 * @file NonceGuard.test.js
 * @description Tests for NonceGuard (EIP-712 signed action replay protection)
 * and EnumerableGuardians, via SignedBreakGlassVault.
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SignedBreakGlassVault (NonceGuard + EnumerableGuardians)", function () {
  let vault, vaultAddr;
  let owner, guardian1, guardian2, guardian3, operator, attacker;
  let chainId;

  const GUARDIAN_SET = ethers.keccak256(ethers.toUtf8Bytes("guardians"));
  const OPERATOR_SET = ethers.keccak256(ethers.toUtf8Bytes("operators"));
  const SIGNED_PAUSE_ACTION = ethers.keccak256(ethers.toUtf8Bytes("PAUSE"));

  beforeEach(async function () {
    [owner, guardian1, guardian2, guardian3, operator, attacker] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("SignedBreakGlassVault");
    vault = await Factory.deploy(
      [guardian1.address, guardian2.address, guardian3.address],
      2, // threshold
      3600 // 1 hour delay
    );
    await vault.waitForDeployment();
    vaultAddr = await vault.getAddress();
    chainId = (await ethers.provider.getNetwork()).chainId;

    // Fund the vault
    await owner.sendTransaction({ to: vaultAddr, value: ethers.parseEther("10") });
  });

  // ─────────────────────────────────────────────
  //  EnumerableGuardians
  // ─────────────────────────────────────────────

  describe("EnumerableGuardians", function () {
    it("initializes guardians in the enumerable set", async function () {
      expect(await vault.memberCount(GUARDIAN_SET)).to.equal(3);
      expect(await vault.isMember(GUARDIAN_SET, guardian1.address)).to.equal(true);
      expect(await vault.isMember(GUARDIAN_SET, guardian2.address)).to.equal(true);
      expect(await vault.isMember(GUARDIAN_SET, guardian3.address)).to.equal(true);
    });

    it("returns all members", async function () {
      const all = await vault.members(GUARDIAN_SET);
      expect(all.length).to.equal(3);
      expect(all).to.include(guardian1.address);
    });

    it("returns member at index", async function () {
      const member = await vault.memberAt(GUARDIAN_SET, 0);
      expect(member).to.not.equal(ethers.ZeroAddress);
    });

    it("manages operator set", async function () {
      await vault.addOperator(operator.address);
      expect(await vault.isMember(OPERATOR_SET, operator.address)).to.equal(true);
      expect(await vault.memberCount(OPERATOR_SET)).to.equal(1);

      await vault.removeOperator(operator.address);
      expect(await vault.isMember(OPERATOR_SET, operator.address)).to.equal(false);
    });

    it("reverts on duplicate add", async function () {
      await vault.addOperator(operator.address);
      await expect(
        vault.addOperator(operator.address)
      ).to.be.revertedWithCustomError(vault, "MemberAlreadyExists");
    });

    it("reverts on removing non-member", async function () {
      await expect(
        vault.removeOperator(attacker.address)
      ).to.be.revertedWithCustomError(vault, "MemberNotFound");
    });
  });

  // ─────────────────────────────────────────────
  //  NonceGuard — Signed Emergency Pause
  // ─────────────────────────────────────────────

  describe("NonceGuard — Signed Actions", function () {
    async function signPauseAction(signer, deadline) {
      const nonce = await vault.nonces(signer.address);
      const domain = {
        name: "NGE NonceGuard",
        version: "1",
        chainId: chainId,
        verifyingContract: vaultAddr,
      };

      const types = {
        SignedAction: [
          { name: "signer", type: "address" },
          { name: "actionHash", type: "bytes32" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };

      const value = {
        signer: signer.address,
        actionHash: SIGNED_PAUSE_ACTION,
        nonce: nonce,
        deadline: deadline,
      };

      return signer.signTypedData(domain, types, value);
    }

    it("pauses vault with valid guardian signature", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const sig = await signPauseAction(guardian1, deadline);

      await vault.signedEmergencyPause(guardian1.address, deadline, sig);
      expect(await vault.paused()).to.equal(true);
    });

    it("increments nonce after signed action", async function () {
      expect(await vault.nonces(guardian1.address)).to.equal(0);

      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const sig = await signPauseAction(guardian1, deadline);
      await vault.signedEmergencyPause(guardian1.address, deadline, sig);

      expect(await vault.nonces(guardian1.address)).to.equal(1);
    });

    it("rejects replay of the same signature", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const sig = await signPauseAction(guardian1, deadline);
      await vault.signedEmergencyPause(guardian1.address, deadline, sig);

      // Unpause first
      await vault.unpause();

      // Try to replay
      await expect(
        vault.signedEmergencyPause(guardian1.address, deadline, sig)
      ).to.be.revertedWithCustomError(vault, "SignedActionInvalidSignature");
    });

    it("rejects expired signature", async function () {
      const deadline = 1; // Already expired
      const sig = await signPauseAction(guardian1, deadline);

      await expect(
        vault.signedEmergencyPause(guardian1.address, deadline, sig)
      ).to.be.revertedWithCustomError(vault, "SignedActionExpired");
    });

    it("rejects non-guardian signature", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const sig = await signPauseAction(attacker, deadline);

      await expect(
        vault.signedEmergencyPause(attacker.address, deadline, sig)
      ).to.be.reverted; // "Not a guardian"
    });

    it("exposes domain separator and typehash", async function () {
      expect(await vault.domainSeparator()).to.not.equal(ethers.ZeroHash);
      expect(await vault.SIGNED_ACTION_TYPEHASH()).to.not.equal(ethers.ZeroHash);
    });
  });

  // ─────────────────────────────────────────────
  //  Basic Vault Operations
  // ─────────────────────────────────────────────

  describe("Vault Operations", function () {
    it("accepts deposits", async function () {
      const balance = await ethers.provider.getBalance(vaultAddr);
      expect(balance).to.equal(ethers.parseEther("10"));
    });

    it("owner can withdraw when not paused", async function () {
      await vault.withdraw(owner.address, ethers.parseEther("1"));
    });

    it("blocks withdrawal when paused", async function () {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const sig = await (async () => {
        const nonce = await vault.nonces(guardian1.address);
        const domain = {
          name: "NGE NonceGuard",
          version: "1",
          chainId,
          verifyingContract: vaultAddr,
        };
        const types = {
          SignedAction: [
            { name: "signer", type: "address" },
            { name: "actionHash", type: "bytes32" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
          ],
        };
        return guardian1.signTypedData(domain, types, {
          signer: guardian1.address,
          actionHash: SIGNED_PAUSE_ACTION,
          nonce,
          deadline,
        });
      })();

      await vault.signedEmergencyPause(guardian1.address, deadline, sig);

      await expect(
        vault.withdraw(owner.address, ethers.parseEther("1"))
      ).to.be.revertedWithCustomError(vault, "EnforcedPause");
    });
  });
});
