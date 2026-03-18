/**
 * @file apiHandler.js
 * @description REST API for the NGE Token & Governance platform.
 * Reads from DynamoDB (cached) with on-chain fallback for real-time data.
 *
 * Endpoints:
 *   GET /token-info       — Token name, symbol, supply, paused status
 *   GET /balance?address= — Balance, voting power, delegate for an address
 *   GET /transfers?address=&limit= — Transfer history for an address
 *   GET /proposals?limit= — Governance proposals
 *   GET /votes?proposalId= — Votes for a specific proposal
 *   GET /health           — System health check
 */
const dynamo = require("../lib/dynamo");
const { getTokenInfo, getBalance } = require("../lib/contract");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Content-Type": "application/json",
};

function respond(statusCode, body) {
  return { statusCode, headers: CORS_HEADERS, body: JSON.stringify(body) };
}

/** GET /token-info — on-chain token metadata and supply. */
async function handleTokenInfo(query) {
  try {
    const info = await getTokenInfo();
    return respond(200, { data: info });
  } catch (err) {
    return respond(500, { error: "Failed to read token info", details: err.message });
  }
}

/** GET /balance — on-chain balance + voting power for an address. */
async function handleBalance(query) {
  const address = query.address;
  if (!address) return respond(400, { error: "Missing address parameter" });

  try {
    const data = await getBalance(address);
    return respond(200, { data });
  } catch (err) {
    return respond(500, { error: "Failed to read balance", details: err.message });
  }
}

/** GET /transfers — DynamoDB-indexed transfer history. */
async function handleTransfers(query) {
  const address = query.address;
  if (!address) return respond(400, { error: "Missing address parameter" });

  const limit = Math.min(parseInt(query.limit || "50", 10), 200);

  try {
    const transfers = await dynamo.getTransfers(address, limit);
    const cleaned = transfers.map(({ pk, sk, ttl, ...rest }) => rest);
    return respond(200, { count: cleaned.length, transfers: cleaned });
  } catch (err) {
    return respond(500, { error: "Failed to read transfers", details: err.message });
  }
}

/** GET /proposals — DynamoDB-indexed governance proposals. */
async function handleProposals(query) {
  const limit = Math.min(parseInt(query.limit || "50", 10), 200);

  try {
    const proposals = await dynamo.getProposals(limit);
    const cleaned = proposals.map(({ pk, sk, ttl, ...rest }) => rest);
    return respond(200, { count: cleaned.length, proposals: cleaned });
  } catch (err) {
    return respond(500, { error: "Failed to read proposals", details: err.message });
  }
}

/** GET /votes — DynamoDB-indexed votes for a proposal. */
async function handleVotes(query) {
  const proposalId = query.proposalId;
  if (!proposalId) return respond(400, { error: "Missing proposalId parameter" });

  const limit = Math.min(parseInt(query.limit || "200", 10), 500);

  try {
    const votes = await dynamo.getVotes(proposalId, limit);
    const cleaned = votes.map(({ pk, sk, ttl, ...rest }) => rest);
    return respond(200, { count: cleaned.length, votes: cleaned });
  } catch (err) {
    return respond(500, { error: "Failed to read votes", details: err.message });
  }
}

/** GET /health — API health check. */
async function handleHealth() {
  const lastBlock = await dynamo.getLastPolledBlock();
  return respond(200, {
    status: lastBlock ? "HEALTHY" : "INITIALIZING",
    message: lastBlock ? "Event indexer is active" : "Waiting for first poll",
    lastPolledBlock: lastBlock,
    timestamp: Math.floor(Date.now() / 1000),
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return respond(200, {});

  const path = event.path || event.rawPath || "/";
  const query = event.queryStringParameters || {};

  try {
    switch (path) {
      case "/token-info":
        return await handleTokenInfo(query);
      case "/balance":
        return await handleBalance(query);
      case "/transfers":
        return await handleTransfers(query);
      case "/proposals":
        return await handleProposals(query);
      case "/votes":
        return await handleVotes(query);
      case "/health":
        return await handleHealth();
      default:
        return respond(404, { error: "Not found", path });
    }
  } catch (err) {
    console.error(`Error handling ${path}:`, err);
    return respond(500, { error: "Internal server error" });
  }
};
