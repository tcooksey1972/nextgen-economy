/**
 * @file marketplaceApi.js
 * @description REST API handler for Skills Marketplace operations.
 *
 * Endpoints:
 *   POST /marketplace/listings            — Create a listing
 *   GET  /marketplace/listings            — Search/filter listings
 *   GET  /marketplace/listings/{id}       — Get listing details
 *   POST /marketplace/engage              — Engage a worker (fund escrow)
 *   POST /marketplace/engage/{id}/complete — Complete engagement
 *   POST /marketplace/engage/{id}/dispute  — Raise dispute
 *   GET  /marketplace/worker/{did}/reputation — Worker reputation
 */
const { ethers } = require("ethers");
const { getMarketplace } = require("../../src/lib/contract");
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

const LISTING_TYPES = ["GIG", "CONTRACT_WORK", "PERMANENT"];
const LISTING_STATUSES = ["OPEN", "MATCHED", "IN_PROGRESS", "COMPLETED", "DISPUTED", "CANCELLED"];
const WORKER_TIERS = ["UNVERIFIED", "BASIC_ID", "CREDENTIAL_VERIFIED", "FULL_VERIFIED"];

/** POST /marketplace/listings — Create a new listing. */
async function handleCreateListing(body) {
  const {
    workerDID, title, descriptionURI, credentialIds,
    listingType, rateWei, isHourly,
  } = body;

  if (!workerDID || !title) {
    return respond(400, { error: "Missing workerDID or title" });
  }

  const listingId = ethers.keccak256(
    ethers.toUtf8Bytes(`listing-${workerDID}-${Date.now()}`)
  );
  const workerHash = ethers.keccak256(ethers.toUtf8Bytes(workerDID));

  const credHashes = (credentialIds || []).map(
    (id) => ethers.keccak256(ethers.toUtf8Bytes(id))
  );

  // Store in DynamoDB (on-chain tx is optional for listing creation)
  await dynamo.putItem(config.MARKETPLACE_TABLE, {
    pk: `LISTING#${listingId}`,
    sk: "DETAIL",
    listingId,
    workerDID,
    workerDIDHash: workerHash,
    title,
    descriptionURI: descriptionURI || "",
    credentialIds: credentialIds || [],
    listingType: LISTING_TYPES[listingType || 0],
    rateWei: rateWei || "0",
    isHourly: isHourly || true,
    status: "OPEN",
    createdAt: new Date().toISOString(),
  });

  // Also index under worker DID
  await dynamo.putItem(config.MARKETPLACE_TABLE, {
    pk: `DID#${workerHash}`,
    sk: `LISTING#${listingId}`,
    title,
    listingType: LISTING_TYPES[listingType || 0],
    status: "OPEN",
    createdAt: new Date().toISOString(),
  });

  return respond(201, {
    listingId,
    workerDID,
    title,
    status: "OPEN",
  });
}

/** GET /marketplace/listings — Search listings from DynamoDB. */
async function handleSearchListings(query) {
  const limit = Math.min(parseInt(query.limit || "50", 10), 200);

  // For MVP, return recent listings (production would use GSIs)
  const listings = await dynamo.queryByPKAndSKPrefix(
    config.MARKETPLACE_TABLE, "LISTING_INDEX", "CREATED#", limit
  );

  return respond(200, { count: listings.length, listings });
}

/** GET /marketplace/listings/{id} — Get listing details. */
async function handleGetListing(listingId) {
  if (!listingId) return respond(400, { error: "Missing listing ID" });

  const listing = await dynamo.getItem(
    config.MARKETPLACE_TABLE, `LISTING#${listingId}`, "DETAIL"
  );

  if (!listing) return respond(404, { error: "Listing not found" });
  return respond(200, { data: listing });
}

/** GET /marketplace/worker/{did}/reputation — Worker reputation. */
async function handleGetReputation(workerDIDHash) {
  if (!workerDIDHash) return respond(400, { error: "Missing worker DID" });

  const marketplace = getMarketplace();
  const [total, count] = await marketplace.getWorkerRating(workerDIDHash);

  const average = count > 0 ? Number(total) / Number(count) : 0;

  return respond(200, {
    workerDID: workerDIDHash,
    totalRating: Number(total),
    ratingCount: Number(count),
    averageRating: Math.round(average * 100) / 100,
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return respond(200, {});

  const path = event.path || event.rawPath || "/";
  const method = event.httpMethod || event.requestContext?.http?.method;
  const body = event.body ? JSON.parse(event.body) : {};
  const query = event.queryStringParameters || {};
  const pathParams = event.pathParameters || {};

  try {
    if (path === "/marketplace/listings" && method === "POST") {
      return await handleCreateListing(body);
    }
    if (path === "/marketplace/listings" && method === "GET") {
      return await handleSearchListings(query);
    }
    if (path.match(/^\/marketplace\/listings\/[^/]+$/) && method === "GET") {
      return await handleGetListing(pathParams.id);
    }
    if (path.match(/^\/marketplace\/worker\/[^/]+\/reputation$/) && method === "GET") {
      return await handleGetReputation(pathParams.did);
    }

    return respond(404, { error: "Not found", path });
  } catch (err) {
    console.error(`Error handling ${method} ${path}:`, err);
    return respond(500, { error: "Internal server error", details: err.message });
  }
};
