/**
 * @file CredentialRegistry.test.js
 * @description Hardhat test suite for the CredentialRegistry contract.
 *
 * Covers: trusted issuer management, credential issuance, verification,
 * revocation, expiration, and access control.
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("CredentialRegistry", function () {
  const METADATA_URI = "https://nge.cloud-creations.com/credentials/cred-001.json";

  let registry;
  let owner, issuerSigner, holderSigner, attacker;
  let issuerDID, holderDID, credentialId, credentialHash;

  beforeEach(async function () {
    [owner, issuerSigner, holderSigner, attacker] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("CredentialRegistry");
    registry = await Factory.deploy();
    await registry.waitForDeployment();

    issuerDID = ethers.keccak256(ethers.toUtf8Bytes("did:web:university.example.edu"));
    holderDID = ethers.keccak256(ethers.toUtf8Bytes("did:web:nge.cloud-creations.com:users:alice"));
    credentialId = ethers.keccak256(ethers.toUtf8Bytes("urn:uuid:credential-001"));
    credentialHash = ethers.keccak256(ethers.toUtf8Bytes("vc-json-ld-document-content"));
  });

  // ─────────────────────────────────────────────
  //  Trusted Issuer Management
  // ─────────────────────────────────────────────

  describe("Trusted Issuer Management", function () {
    it("admin can add trusted issuer", async function () {
      await registry.addTrustedIssuer(issuerDID);
      expect(await registry.isTrustedIssuer(issuerDID)).to.be.true;
    });

    it("emits IssuerTrusted event", async function () {
      await expect(registry.addTrustedIssuer(issuerDID))
        .to.emit(registry, "IssuerTrusted")
        .withArgs(issuerDID);
    });

    it("admin can remove trusted issuer", async function () {
      await registry.addTrustedIssuer(issuerDID);
      await registry.removeTrustedIssuer(issuerDID);
      expect(await registry.isTrustedIssuer(issuerDID)).to.be.false;
    });

    it("emits IssuerUntrusted event", async function () {
      await registry.addTrustedIssuer(issuerDID);
      await expect(registry.removeTrustedIssuer(issuerDID))
        .to.emit(registry, "IssuerUntrusted")
        .withArgs(issuerDID);
    });

    it("non-admin cannot add trusted issuer", async function () {
      await expect(
        registry.connect(attacker).addTrustedIssuer(issuerDID)
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });

    it("non-admin cannot remove trusted issuer", async function () {
      await registry.addTrustedIssuer(issuerDID);
      await expect(
        registry.connect(attacker).removeTrustedIssuer(issuerDID)
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });
  });

  // ─────────────────────────────────────────────
  //  Credential Issuance
  // ─────────────────────────────────────────────

  describe("Credential Issuance", function () {
    beforeEach(async function () {
      await registry.addTrustedIssuer(issuerDID);
    });

    it("issues a credential successfully", async function () {
      await registry.issueCredential(
        credentialId, issuerDID, holderDID, credentialHash,
        0, // EDUCATION
        0, // no expiration
        METADATA_URI
      );
      expect(await registry.credentialCount()).to.equal(1);
    });

    it("emits CredentialIssued event", async function () {
      await expect(
        registry.issueCredential(
          credentialId, issuerDID, holderDID, credentialHash, 0, 0, METADATA_URI
        )
      ).to.emit(registry, "CredentialIssued")
        .withArgs(credentialId, issuerDID, holderDID, 0);
    });

    it("stores credential record correctly", async function () {
      await registry.issueCredential(
        credentialId, issuerDID, holderDID, credentialHash, 1, 0, METADATA_URI
      );
      const cred = await registry.getCredential(credentialId);

      expect(cred.issuerDID).to.equal(issuerDID);
      expect(cred.holderDID).to.equal(holderDID);
      expect(cred.credentialHash).to.equal(credentialHash);
      expect(cred.cType).to.equal(1); // PROFESSIONAL
      expect(cred.issuedAt).to.be.greaterThan(0);
      expect(cred.expiresAt).to.equal(0);
      expect(cred.revoked).to.be.false;
      expect(cred.metadataURI).to.equal(METADATA_URI);
    });

    it("adds credential to holder list", async function () {
      await registry.issueCredential(
        credentialId, issuerDID, holderDID, credentialHash, 0, 0, METADATA_URI
      );
      const holderCreds = await registry.getHolderCredentials(holderDID);
      expect(holderCreds).to.have.lengthOf(1);
      expect(holderCreds[0]).to.equal(credentialId);
    });

    it("adds credential to issuer list", async function () {
      await registry.issueCredential(
        credentialId, issuerDID, holderDID, credentialHash, 0, 0, METADATA_URI
      );
      const issuerCreds = await registry.getIssuerCredentials(issuerDID);
      expect(issuerCreds).to.have.lengthOf(1);
    });

    it("supports all credential types", async function () {
      for (let cType = 0; cType <= 6; cType++) {
        const id = ethers.keccak256(ethers.toUtf8Bytes(`cred-type-${cType}`));
        const hash = ethers.keccak256(ethers.toUtf8Bytes(`hash-${cType}`));
        await registry.issueCredential(id, issuerDID, holderDID, hash, cType, 0, METADATA_URI);
        const cred = await registry.getCredential(id);
        expect(cred.cType).to.equal(cType);
      }
      expect(await registry.credentialCount()).to.equal(7);
    });

    it("reverts on duplicate credential ID", async function () {
      await registry.issueCredential(
        credentialId, issuerDID, holderDID, credentialHash, 0, 0, METADATA_URI
      );
      await expect(
        registry.issueCredential(
          credentialId, issuerDID, holderDID, credentialHash, 0, 0, METADATA_URI
        )
      ).to.be.revertedWithCustomError(registry, "CredentialAlreadyExists");
    });

    it("reverts with untrusted issuer", async function () {
      const fakeDID = ethers.keccak256(ethers.toUtf8Bytes("did:web:fake-university.com"));
      await expect(
        registry.issueCredential(
          credentialId, fakeDID, holderDID, credentialHash, 0, 0, METADATA_URI
        )
      ).to.be.revertedWithCustomError(registry, "IssuerNotTrusted");
    });

    it("reverts with zero credential ID", async function () {
      await expect(
        registry.issueCredential(
          ethers.ZeroHash, issuerDID, holderDID, credentialHash, 0, 0, METADATA_URI
        )
      ).to.be.revertedWithCustomError(registry, "InvalidCredentialId");
    });

    it("reverts with zero credential hash", async function () {
      await expect(
        registry.issueCredential(
          credentialId, issuerDID, holderDID, ethers.ZeroHash, 0, 0, METADATA_URI
        )
      ).to.be.revertedWithCustomError(registry, "InvalidCredentialHash");
    });
  });

  // ─────────────────────────────────────────────
  //  Verification
  // ─────────────────────────────────────────────

  describe("Verification", function () {
    beforeEach(async function () {
      await registry.addTrustedIssuer(issuerDID);
    });

    it("verifies a valid credential", async function () {
      await registry.issueCredential(
        credentialId, issuerDID, holderDID, credentialHash, 0, 0, METADATA_URI
      );
      const result = await registry.verifyCredential(credentialId);
      expect(result.valid).to.be.true;
      expect(result.expired).to.be.false;
      expect(result.revoked).to.be.false;
      expect(result.trustedIssuer).to.be.true;
    });

    it("detects expired credential", async function () {
      const expiresAt = (await time.latest()) + 100;
      await registry.issueCredential(
        credentialId, issuerDID, holderDID, credentialHash, 0, expiresAt, METADATA_URI
      );

      // Before expiration
      let result = await registry.verifyCredential(credentialId);
      expect(result.valid).to.be.true;
      expect(result.expired).to.be.false;

      // After expiration
      await time.increase(200);
      result = await registry.verifyCredential(credentialId);
      expect(result.valid).to.be.false;
      expect(result.expired).to.be.true;
    });

    it("detects untrusted issuer after removal", async function () {
      await registry.issueCredential(
        credentialId, issuerDID, holderDID, credentialHash, 0, 0, METADATA_URI
      );

      await registry.removeTrustedIssuer(issuerDID);
      const result = await registry.verifyCredential(credentialId);
      expect(result.valid).to.be.false;
      expect(result.trustedIssuer).to.be.false;
    });

    it("returns invalid for non-existent credential", async function () {
      const fakeId = ethers.keccak256(ethers.toUtf8Bytes("non-existent"));
      const result = await registry.verifyCredential(fakeId);
      expect(result.valid).to.be.false;
    });
  });

  // ─────────────────────────────────────────────
  //  Revocation
  // ─────────────────────────────────────────────

  describe("Revocation", function () {
    beforeEach(async function () {
      await registry.addTrustedIssuer(issuerDID);
      await registry.issueCredential(
        credentialId, issuerDID, holderDID, credentialHash, 0, 0, METADATA_URI
      );
    });

    it("revokes a credential", async function () {
      await registry.revokeCredential(credentialId, issuerDID);
      const result = await registry.verifyCredential(credentialId);
      expect(result.revoked).to.be.true;
      expect(result.valid).to.be.false;
    });

    it("emits CredentialRevoked event", async function () {
      await expect(registry.revokeCredential(credentialId, issuerDID))
        .to.emit(registry, "CredentialRevoked")
        .withArgs(credentialId, issuerDID);
    });

    it("reverts when wrong issuer revokes", async function () {
      const otherDID = ethers.keccak256(ethers.toUtf8Bytes("did:web:other.edu"));
      await expect(
        registry.revokeCredential(credentialId, otherDID)
      ).to.be.revertedWithCustomError(registry, "NotCredentialIssuer");
    });

    it("reverts on double revocation", async function () {
      await registry.revokeCredential(credentialId, issuerDID);
      await expect(
        registry.revokeCredential(credentialId, issuerDID)
      ).to.be.revertedWithCustomError(registry, "AlreadyRevoked");
    });

    it("reverts revoking non-existent credential", async function () {
      const fakeId = ethers.keccak256(ethers.toUtf8Bytes("non-existent"));
      await expect(
        registry.revokeCredential(fakeId, issuerDID)
      ).to.be.revertedWithCustomError(registry, "CredentialNotFound");
    });
  });

  // ─────────────────────────────────────────────
  //  Multi-Credential Queries
  // ─────────────────────────────────────────────

  describe("Multi-Credential Queries", function () {
    beforeEach(async function () {
      await registry.addTrustedIssuer(issuerDID);
    });

    it("holder accumulates multiple credentials", async function () {
      for (let i = 0; i < 5; i++) {
        const id = ethers.keccak256(ethers.toUtf8Bytes(`cred-${i}`));
        const hash = ethers.keccak256(ethers.toUtf8Bytes(`hash-${i}`));
        await registry.issueCredential(id, issuerDID, holderDID, hash, i % 7, 0, METADATA_URI);
      }
      const creds = await registry.getHolderCredentials(holderDID);
      expect(creds).to.have.lengthOf(5);
    });

    it("issuer tracks all issued credentials", async function () {
      const holderDID2 = ethers.keccak256(ethers.toUtf8Bytes("did:web:bob"));
      for (let i = 0; i < 3; i++) {
        const id = ethers.keccak256(ethers.toUtf8Bytes(`cred-${i}`));
        const hash = ethers.keccak256(ethers.toUtf8Bytes(`hash-${i}`));
        const holder = i < 2 ? holderDID : holderDID2;
        await registry.issueCredential(id, issuerDID, holder, hash, 0, 0, METADATA_URI);
      }
      const issuerCreds = await registry.getIssuerCredentials(issuerDID);
      expect(issuerCreds).to.have.lengthOf(3);
    });
  });
});
