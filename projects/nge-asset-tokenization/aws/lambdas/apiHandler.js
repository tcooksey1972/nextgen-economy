/**
 * @file apiHandler.js
 * @description REST API handler for the Asset Tokenization dashboard.
 *
 * Routes:
 *   GET  /assets                    — List all registered assets
 *   GET  /assets/{tokenId}          — Get single asset detail
 *   GET  /events                    — Recent events (optional ?type=AssetRegistered)
 *   GET  /ledger/{tokenId}          — Journal entries for an asset
 *   GET  /resolve/{identifierHash}  — Resolve QR/UPN/barcode to asset
 *   GET  /health                    — System health check
 *   POST /sync                      — On-demand event sync (indexes new blocks)
 *   OPTIONS /{proxy+}               — CORS preflight
 *
 * Event indexing is on-demand only (POST /sync) — no scheduled poller.
 * This keeps costs at $0 when nobody is using the demo.
 */
const config = require("../lib/config");
const dynamo = require("../lib/dynamo");
const { getProvider, getContract, queryEvents, getAssetSnapshot } = require("../lib/contract");
const alerts = require("../lib/alerts");

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

/** Event names to index when /sync is called. */
const EVENT_NAMES = [
  "AssetRegistered", "AssetStatusChanged", "AssetDisposed",
  "IdentifierLinked", "JournalEntryRecorded", "DepreciationRecorded",
  "ItemsIssued", "ItemsReturned", "InspectionRecorded",
];

/** Converts BigInt values in event args to strings for DynamoDB. */
function serializeArgs(args, fragment) {
  const result = {};
  for (let i = 0; i < fragment.inputs.length; i++) {
    const input = fragment.inputs[i];
    const val = args[i];
    result[input.name] = typeof val === "bigint" ? val.toString() : val;
  }
  return result;
}

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

    // POST /sync — on-demand event indexing (rate-limited: 1 call per 10 min)
    if (path === "/sync" && method === "POST") {
      // Server-side rate limit: check last sync timestamp
      const lastSync = await dynamo.getLastSyncTime();
      const now = Math.floor(Date.now() / 1000);
      const SYNC_COOLDOWN_SECONDS = 600; // 10 minutes
      if (lastSync && (now - lastSync) < SYNC_COOLDOWN_SECONDS) {
        const retryAfter = SYNC_COOLDOWN_SECONDS - (now - lastSync);
        return respond(429, {
          error: "Sync rate limited",
          message: `Please wait ${retryAfter}s before syncing again`,
          retryAfter,
        });
      }

      const provider = getProvider();
      const contract = getContract();
      const currentBlock = await provider.getBlockNumber();

      let lastBlock = await dynamo.getLastPolledBlock();
      if (!lastBlock) {
        lastBlock = Math.max(0, currentBlock - config.pollBlockRange);
      }

      const fromBlock = lastBlock + 1;
      if (fromBlock > currentBlock) {
        return respond(200, { processed: 0, message: "No new blocks" });
      }

      let totalProcessed = 0;

      for (const eventName of EVENT_NAMES) {
        try {
          const events = await queryEvents(eventName, fromBlock, currentBlock);
          for (const ev of events) {
            const block = await provider.getBlock(ev.blockNumber);
            const fragment = contract.interface.getEvent(eventName);
            const decoded = serializeArgs(ev.args, fragment);

            await dynamo.putEvent({
              eventName,
              blockNumber: ev.blockNumber,
              transactionHash: ev.transactionHash,
              timestamp: block?.timestamp || 0,
              args: decoded,
            });

            if (decoded.tokenId !== undefined) {
              try {
                const snapshot = await getAssetSnapshot(Number(decoded.tokenId));
                await dynamo.putAsset(snapshot);
              } catch (err) {
                console.warn(`Failed to snapshot asset ${decoded.tokenId}:`, err.message);
              }
            }

            if (eventName === "InspectionRecorded" && decoded.discrepancy) {
              await alerts.warning(
                "Inspection Discrepancy",
                `Asset #${decoded.tokenId}: physical=${decoded.physicalCount}, on-chain=${decoded.onChainBalance}`,
                decoded
              );
            }

            totalProcessed++;
          }
        } catch (err) {
          console.error(`Error polling ${eventName}:`, err.message);
        }
      }

      await dynamo.putLastPolledBlock(currentBlock);
      await dynamo.putLastSyncTime(now);
      return respond(200, { processed: totalProcessed, fromBlock, toBlock: currentBlock });
    }

    return respond(404, { error: `Route not found: ${method} ${path}` });
  } catch (err) {
    console.error("API error:", err);
    return respond(500, { error: "Internal server error" });
  }
};
