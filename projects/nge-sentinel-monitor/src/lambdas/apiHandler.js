/**
 * @file apiHandler.js
 * @description Lambda function serving the REST API via API Gateway.
 * Reads from DynamoDB (never hits the blockchain directly) for fast,
 * cheap responses.
 *
 * Endpoints:
 *   GET /status    — Current vault state snapshot
 *   GET /events    — Recent contract events (with optional type filter)
 *   GET /proposals — BreakGlass proposal events
 *   GET /health    — System health summary
 *
 * All responses include CORS headers for the S3-hosted dashboard.
 *
 * @see ../lib/dynamo.js - All data is read from DynamoDB
 */
const dynamo = require("../lib/dynamo");

/**
 * Standard CORS headers for all responses.
 * Allows any origin since the dashboard may be served from S3 or localhost.
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

/**
 * Builds a standard API response.
 *
 * @param {number} statusCode - HTTP status code.
 * @param {Object} body - Response body (will be JSON-stringified).
 * @returns {Object} API Gateway proxy response.
 */
function respond(statusCode, body) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

/**
 * GET /status — Returns the latest vault state snapshot.
 *
 * @returns {Promise<Object>} API Gateway response with vault state.
 */
async function handleStatus() {
  const state = await dynamo.getLatestState();
  if (!state) {
    return respond(200, {
      message: "No state data yet. The heartbeat monitor has not run.",
      data: null,
    });
  }

  // Remove DynamoDB internal fields
  const { pk, sk, ttl, ...data } = state;
  return respond(200, { data });
}

/**
 * GET /events — Returns recent contract events.
 * Query params:
 *   ?type=WatchdogAlerted  — filter by event type
 *   ?limit=20              — max events to return (default 50)
 *
 * @param {Object} queryParams - API Gateway query string parameters.
 * @returns {Promise<Object>} API Gateway response with events array.
 */
async function handleEvents(queryParams) {
  const limit = Math.min(parseInt(queryParams.limit || "50", 10), 200);
  const type = queryParams.type || null;

  let events;
  if (type) {
    events = await dynamo.getRecentEvents(type, limit);
  } else {
    events = await dynamo.getAllRecentEvents(limit);
  }

  // Clean DynamoDB internal fields
  const cleaned = events.map(({ pk, sk, ttl, ...rest }) => rest);

  return respond(200, {
    count: cleaned.length,
    events: cleaned,
  });
}

/**
 * GET /proposals — Returns recent BreakGlass proposal events.
 *
 * @returns {Promise<Object>} API Gateway response with proposal events.
 */
async function handleProposals() {
  const [proposed, approved, executed, cancelled] = await Promise.all([
    dynamo.getRecentEvents("EmergencyProposed", 20),
    dynamo.getRecentEvents("EmergencyApproved", 20),
    dynamo.getRecentEvents("EmergencyExecuted", 20),
    dynamo.getRecentEvents("EmergencyCancelled", 20),
  ]);

  const clean = (items) => items.map(({ pk, sk, ttl, ...rest }) => rest);

  return respond(200, {
    proposed: clean(proposed),
    approved: clean(approved),
    executed: clean(executed),
    cancelled: clean(cancelled),
  });
}

/**
 * GET /health — Returns a simple system health summary.
 * Useful for uptime monitoring and quick status checks.
 *
 * @returns {Promise<Object>} API Gateway response with health status.
 */
async function handleHealth() {
  const state = await dynamo.getLatestState();
  const lastBlock = await dynamo.getLastPolledBlock();

  if (!state) {
    return respond(200, {
      status: "INITIALIZING",
      message: "Monitor has not collected data yet.",
      lastPolledBlock: lastBlock,
    });
  }

  const now = Math.floor(Date.now() / 1000);
  const stateAge = now - (state.timestamp || 0);
  const deadline = state.deadManSwitch?.switchDeadline || 0;
  const secondsRemaining = deadline - now;

  let status = "HEALTHY";
  const issues = [];

  if (stateAge > 7200) {
    status = "STALE";
    issues.push(`State data is ${Math.floor(stateAge / 60)} minutes old`);
  }

  if (state.deadManSwitch?.isSwitchActivated) {
    status = "CRITICAL";
    issues.push("Dead man switch has been activated");
  } else if (secondsRemaining <= 0) {
    status = "CRITICAL";
    issues.push("Heartbeat deadline has passed");
  } else if (secondsRemaining <= 172800) {
    // 48 hours
    status = "WARNING";
    issues.push(`Heartbeat deadline in ${Math.floor(secondsRemaining / 3600)} hours`);
  }

  if (state.paused) {
    if (status !== "CRITICAL") status = "WARNING";
    issues.push("Vault is paused");
  }

  return respond(200, {
    status,
    issues,
    lastStateUpdate: state.timestamp,
    lastPolledBlock: lastBlock,
    vaultBalance: state.balance,
    paused: state.paused,
    switchActivated: state.deadManSwitch?.isSwitchActivated || false,
  });
}

/**
 * Lambda handler — routes API Gateway requests to the appropriate handler.
 *
 * @param {Object} event - API Gateway proxy event.
 * @returns {Promise<Object>} API Gateway proxy response.
 */
exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return respond(200, {});
  }

  const path = event.path || event.rawPath || "/";
  const queryParams = event.queryStringParameters || {};

  try {
    switch (path) {
      case "/status":
        return await handleStatus();
      case "/events":
        return await handleEvents(queryParams);
      case "/proposals":
        return await handleProposals();
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
