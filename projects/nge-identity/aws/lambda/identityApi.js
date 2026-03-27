/**
 * @file identityApi.js
 * @description REST API handler for DID Identity operations.
 *
 * Endpoints:
 *   POST /identity/did           — Create a new DID
 *   GET  /identity/did/{didHash} — Resolve a DID
 *   PUT  /identity/did/{didHash} — Update DID document
 *   DELETE /identity/did/{didHash} — Deactivate a DID
 *   POST /identity/biometric/bind — Bind biometric to DID
 *   GET  /health                  — Health check
 */
const { ethers } = require("ethers");
const { getDIDRegistry } = require("../../src/lib/contract");
const dynamo = require("../../src/lib/dynamo");
const config = require("../../src/lib/config");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Content-Type": "application/json",
};

function respond(statusCode, body) {
  return { statusCode, headers: CORS_HEADERS, body: JSON.stringify(body) };
}

/** POST /identity/did — Create a new DID. */
async function handleCreateDID(body) {
  const { didString, documentURI } = body;
  if (!didString || !documentURI) {
    return respond(400, { error: "Missing didString or documentURI" });
  }

  const didHash = ethers.keccak256(ethers.toUtf8Bytes(didString));
  const registry = getDIDRegistry();

  const tx = await registry.createDID(didHash, documentURI);
  const receipt = await tx.wait();

  // Store in DynamoDB for fast lookups
  await dynamo.putItem(config.IDENTITY_TABLE, {
    pk: `DID#${didHash}`,
    sk: "PROFILE",
    didString,
    didHash,
    documentURI,
    controller: receipt.from,
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    createdAt: new Date().toISOString(),
    status: "ACTIVE",
  });

  return respond(201, {
    didHash,
    didString,
    documentURI,
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
  });
}

/** GET /identity/did/{didHash} — Resolve a DID. */
async function handleResolveDID(didHash) {
  if (!didHash) return respond(400, { error: "Missing didHash" });

  // Try DynamoDB cache first
  const cached = await dynamo.getItem(config.IDENTITY_TABLE, `DID#${didHash}`, "PROFILE");
  if (cached && cached.status === "ACTIVE") {
    return respond(200, { source: "cache", data: cached });
  }

  // Fall back to on-chain
  const registry = getDIDRegistry();
  const record = await registry.resolve(didHash);

  return respond(200, {
    source: "chain",
    data: {
      controller: record.controller,
      documentURI: record.documentURI,
      created: Number(record.created),
      updated: Number(record.updated),
      active: record.active,
    },
  });
}

/** PUT /identity/did/{didHash} — Update DID document. */
async function handleUpdateDocument(didHash, body) {
  const { newDocumentURI } = body;
  if (!didHash || !newDocumentURI) {
    return respond(400, { error: "Missing didHash or newDocumentURI" });
  }

  const registry = getDIDRegistry();
  const tx = await registry.updateDocument(didHash, newDocumentURI);
  const receipt = await tx.wait();

  return respond(200, {
    didHash,
    newDocumentURI,
    transactionHash: receipt.hash,
  });
}

/** DELETE /identity/did/{didHash} — Deactivate a DID. */
async function handleDeactivateDID(didHash) {
  if (!didHash) return respond(400, { error: "Missing didHash" });

  const registry = getDIDRegistry();
  const tx = await registry.deactivate(didHash);
  const receipt = await tx.wait();

  return respond(200, {
    didHash,
    status: "DEACTIVATED",
    transactionHash: receipt.hash,
  });
}

/** POST /identity/biometric/bind — Bind biometric to DID. */
async function handleBindBiometric(body) {
  const { didHash, biometricCommitment } = body;
  if (!didHash || !biometricCommitment) {
    return respond(400, { error: "Missing didHash or biometricCommitment" });
  }

  const registry = getDIDRegistry();
  const tx = await registry.bindBiometric(didHash, biometricCommitment);
  const receipt = await tx.wait();

  return respond(200, {
    didHash,
    biometricBound: true,
    transactionHash: receipt.hash,
  });
}

/** GET /health — Health check. */
async function handleHealth() {
  const registry = getDIDRegistry();
  const count = await registry.didCount();

  return respond(200, {
    status: "HEALTHY",
    module: "identity",
    didCount: Number(count),
    timestamp: Math.floor(Date.now() / 1000),
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return respond(200, {});

  const path = event.path || event.rawPath || "/";
  const method = event.httpMethod || event.requestContext?.http?.method;
  const body = event.body ? JSON.parse(event.body) : {};
  const pathParams = event.pathParameters || {};

  try {
    // POST /identity/did
    if (path === "/identity/did" && method === "POST") {
      return await handleCreateDID(body);
    }
    // GET /identity/did/{didHash}
    if (path.startsWith("/identity/did/") && method === "GET") {
      return await handleResolveDID(pathParams.didHash);
    }
    // PUT /identity/did/{didHash}
    if (path.startsWith("/identity/did/") && method === "PUT") {
      return await handleUpdateDocument(pathParams.didHash, body);
    }
    // DELETE /identity/did/{didHash}
    if (path.startsWith("/identity/did/") && method === "DELETE") {
      return await handleDeactivateDID(pathParams.didHash);
    }
    // POST /identity/biometric/bind
    if (path === "/identity/biometric/bind" && method === "POST") {
      return await handleBindBiometric(body);
    }
    // GET /health
    if (path === "/health") {
      return await handleHealth();
    }

    return respond(404, { error: "Not found", path });
  } catch (err) {
    console.error(`Error handling ${method} ${path}:`, err);
    return respond(500, { error: "Internal server error", details: err.message });
  }
};
