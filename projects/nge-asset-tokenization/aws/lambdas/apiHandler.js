/**
 * @file apiHandler.js
 * @description REST API handler for the Asset Tokenization dashboard.
 *
 * Routes:
 *   GET /assets                    — List all registered assets
 *   GET /assets/{tokenId}          — Get single asset detail
 *   GET /events                    — Recent events (optional ?type=AssetRegistered)
 *   GET /ledger/{tokenId}          — Journal entries for an asset
 *   GET /resolve/{identifierHash}  — Resolve QR/UPN/barcode to asset
 *   GET /health                    — System health check
 *   OPTIONS /{proxy+}              — CORS preflight
 */
const dynamo = require("../lib/dynamo");
const { getContract, getAssetSnapshot } = require("../lib/contract");

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
};

function respond(statusCode, body) {
  return {
    statusCode,
    headers: CORS,
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  const method = event.httpMethod;
  const path = event.path;
  const params = event.queryStringParameters || {};
  const pathParams = event.pathParameters || {};

  try {
    // CORS preflight
    if (method === "OPTIONS") {
      return respond(200, { ok: true });
    }

    // GET /assets — list all assets
    if (path === "/assets" && method === "GET") {
      const limit = parseInt(params.limit || "100", 10);
      const assets = await dynamo.listAssets(limit);
      // Strip internal DynamoDB fields
      const cleaned = assets.map(({ pk, sk, ttl, ...rest }) => rest);
      return respond(200, { assets: cleaned, count: cleaned.length });
    }

    // GET /assets/{tokenId} — single asset detail
    if (path.startsWith("/assets/") && method === "GET") {
      const tokenId = pathParams.tokenId;
      // Try DynamoDB cache first, fall back to on-chain
      let asset = await dynamo.getAsset(tokenId);
      if (!asset) {
        try {
          asset = await getAssetSnapshot(Number(tokenId));
          await dynamo.putAsset(asset);
        } catch (err) {
          return respond(404, { error: `Asset ${tokenId} not found` });
        }
      }
      const { pk, sk, ttl, ...cleaned } = asset;
      return respond(200, cleaned);
    }

    // GET /events — recent events
    if (path === "/events" && method === "GET") {
      const limit = Math.min(parseInt(params.limit || "50", 10), 200);
      let events;
      if (params.type) {
        events = await dynamo.getRecentEvents(params.type, limit);
      } else {
        events = await dynamo.getAllRecentEvents(limit);
      }
      const cleaned = events.map(({ pk, sk, ttl, ...rest }) => rest);
      return respond(200, { events: cleaned, count: cleaned.length });
    }

    // GET /ledger/{tokenId} — journal entries for an asset
    if (path.startsWith("/ledger/") && method === "GET") {
      const tokenId = pathParams.tokenId;
      const limit = Math.min(parseInt(params.limit || "50", 10), 200);
      const entries = await dynamo.getRecentEvents("JournalEntryRecorded", limit);
      const filtered = entries
        .filter((e) => e.args?.tokenId === tokenId)
        .map(({ pk, sk, ttl, ...rest }) => rest);
      return respond(200, { entries: filtered, count: filtered.length });
    }

    // GET /resolve/{identifierHash} — resolve identifier to asset
    if (path.startsWith("/resolve/") && method === "GET") {
      const hash = pathParams.identifierHash;
      const contract = getContract();
      try {
        const linked = await contract.isLinked(hash);
        if (!linked) {
          return respond(404, { error: "Identifier not linked" });
        }
        const tokenId = await contract.resolve(hash);
        const asset = await getAssetSnapshot(Number(tokenId));
        return respond(200, { identifierHash: hash, ...asset });
      } catch (err) {
        return respond(404, { error: "Identifier not found" });
      }
    }

    // GET /health — system health
    if (path === "/health" && method === "GET") {
      const contract = getContract();
      const assetCount = await contract.assetCount();
      const entryCount = await contract.entryCount();
      return respond(200, {
        status: "healthy",
        assetCount: assetCount.toString(),
        journalEntries: entryCount.toString(),
        timestamp: new Date().toISOString(),
      });
    }

    return respond(404, { error: `Route not found: ${method} ${path}` });
  } catch (err) {
    console.error("API error:", err);
    return respond(500, { error: "Internal server error" });
  }
};
