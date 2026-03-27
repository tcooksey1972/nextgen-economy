/**
 * @file credentialApi.js
 * @description REST API handler for Verifiable Credential operations.
 *
 * Endpoints:
 *   POST /credentials/issue            — Issue a new credential
 *   GET  /credentials/{id}/verify      — Verify a credential
 *   POST /credentials/{id}/revoke      — Revoke a credential
 *   GET  /credentials/holder/{didHash} — List holder's credentials
 *   GET  /credentials/{id}             — Get credential details
 */
const { ethers } = require("ethers");
const { getCredentialRegistry } = require("../../src/lib/contract");
const dynamo = require("../../src/lib/dynamo");
const config = require("../../src/lib/config");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Content-Type": "application/json",
};

function respond(statusCode, body) {
  return { statusCode, headers: CORS_HEADERS, body: JSON.stringify(body) };
}

const CREDENTIAL_TYPES = [
  "EDUCATION", "PROFESSIONAL", "SKILL", "EXPERIENCE",
  "STATE_ID", "HEALTHCARE", "SENSOR_ATTESTATION",
];

/** POST /credentials/issue — Issue a Verifiable Credential. */
async function handleIssueCredential(body) {
  const {
    credentialId, issuerDID, holderDID, credentialType,
    expiresAt, metadataURI, vcDocument,
  } = body;

  if (!credentialId || !issuerDID || !holderDID || credentialType === undefined) {
    return respond(400, { error: "Missing required fields" });
  }

  // Hash the VC document for on-chain anchoring
  const credentialHash = ethers.keccak256(
    ethers.toUtf8Bytes(JSON.stringify(vcDocument || {}))
  );

  const credIdHash = ethers.keccak256(ethers.toUtf8Bytes(credentialId));
  const issuerHash = ethers.keccak256(ethers.toUtf8Bytes(issuerDID));
  const holderHash = ethers.keccak256(ethers.toUtf8Bytes(holderDID));

  const registry = getCredentialRegistry();
  const tx = await registry.issueCredential(
    credIdHash, issuerHash, holderHash, credentialHash,
    credentialType, expiresAt || 0, metadataURI || ""
  );
  const receipt = await tx.wait();

  // Store in DynamoDB
  await dynamo.putItem(config.CREDENTIAL_TABLE, {
    pk: `CRED#${credIdHash}`,
    sk: "DETAIL",
    credentialId,
    credentialIdHash: credIdHash,
    issuerDID,
    holderDID,
    credentialType: CREDENTIAL_TYPES[credentialType] || "UNKNOWN",
    credentialHash,
    metadataURI: metadataURI || "",
    transactionHash: receipt.hash,
    issuedAt: new Date().toISOString(),
    expiresAt: expiresAt || null,
    status: "ACTIVE",
  });

  // Also index under holder
  await dynamo.putItem(config.CREDENTIAL_TABLE, {
    pk: `DID#${holderHash}`,
    sk: `CREDENTIAL#${credIdHash}`,
    credentialId,
    credentialType: CREDENTIAL_TYPES[credentialType] || "UNKNOWN",
    issuerDID,
    issuedAt: new Date().toISOString(),
  });

  return respond(201, {
    credentialIdHash: credIdHash,
    credentialHash,
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
  });
}

/** GET /credentials/{id}/verify — Verify a credential. */
async function handleVerifyCredential(credentialIdHash) {
  if (!credentialIdHash) return respond(400, { error: "Missing credential ID" });

  const registry = getCredentialRegistry();
  const result = await registry.verifyCredential(credentialIdHash);

  return respond(200, {
    credentialId: credentialIdHash,
    valid: result.valid,
    expired: result.expired,
    revoked: result.revoked,
    trustedIssuer: result.trustedIssuer,
    verifiedAt: new Date().toISOString(),
  });
}

/** POST /credentials/{id}/revoke — Revoke a credential. */
async function handleRevokeCredential(credentialIdHash, body) {
  const { issuerDID } = body;
  if (!credentialIdHash || !issuerDID) {
    return respond(400, { error: "Missing credential ID or issuerDID" });
  }

  const issuerHash = ethers.keccak256(ethers.toUtf8Bytes(issuerDID));
  const registry = getCredentialRegistry();
  const tx = await registry.revokeCredential(credentialIdHash, issuerHash);
  const receipt = await tx.wait();

  return respond(200, {
    credentialId: credentialIdHash,
    status: "REVOKED",
    transactionHash: receipt.hash,
  });
}

/** GET /credentials/holder/{didHash} — List credentials for a holder. */
async function handleGetHolderCredentials(didHash) {
  if (!didHash) return respond(400, { error: "Missing DID hash" });

  // Try DynamoDB first
  const cached = await dynamo.queryByPKAndSKPrefix(
    config.CREDENTIAL_TABLE, `DID#${didHash}`, "CREDENTIAL#"
  );

  if (cached.length > 0) {
    return respond(200, { source: "cache", count: cached.length, credentials: cached });
  }

  // Fall back to on-chain
  const registry = getCredentialRegistry();
  const credIds = await registry.getHolderCredentials(didHash);

  return respond(200, {
    source: "chain",
    count: credIds.length,
    credentialIds: credIds,
  });
}

/** GET /credentials/{id} — Get credential details. */
async function handleGetCredential(credentialIdHash) {
  if (!credentialIdHash) return respond(400, { error: "Missing credential ID" });

  const registry = getCredentialRegistry();
  const cred = await registry.getCredential(credentialIdHash);

  return respond(200, {
    issuerDID: cred.issuerDID,
    holderDID: cred.holderDID,
    credentialHash: cred.credentialHash,
    credentialType: CREDENTIAL_TYPES[cred.cType] || "UNKNOWN",
    issuedAt: Number(cred.issuedAt),
    expiresAt: Number(cred.expiresAt),
    revoked: cred.revoked,
    metadataURI: cred.metadataURI,
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return respond(200, {});

  const path = event.path || event.rawPath || "/";
  const method = event.httpMethod || event.requestContext?.http?.method;
  const body = event.body ? JSON.parse(event.body) : {};
  const pathParams = event.pathParameters || {};

  try {
    if (path === "/credentials/issue" && method === "POST") {
      return await handleIssueCredential(body);
    }
    if (path.match(/^\/credentials\/[^/]+\/verify$/) && method === "GET") {
      return await handleVerifyCredential(pathParams.id);
    }
    if (path.match(/^\/credentials\/[^/]+\/revoke$/) && method === "POST") {
      return await handleRevokeCredential(pathParams.id, body);
    }
    if (path.match(/^\/credentials\/holder\//) && method === "GET") {
      return await handleGetHolderCredentials(pathParams.didHash);
    }
    if (path.match(/^\/credentials\/[^/]+$/) && method === "GET") {
      return await handleGetCredential(pathParams.id);
    }

    return respond(404, { error: "Not found", path });
  } catch (err) {
    console.error(`Error handling ${method} ${path}:`, err);
    return respond(500, { error: "Internal server error", details: err.message });
  }
};
