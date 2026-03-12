/**
 * @file run.js
 * @description Lightweight test runner for the NGE Sentinel Monitor Lambda
 * functions. Tests use mocked AWS SDK and ethers.js dependencies so they
 * can run without AWS credentials or blockchain access.
 *
 * @usage node tests/run.js
 */

let passed = 0;
let failed = 0;

/**
 * Runs a single test case.
 *
 * @param {string} name - Test description.
 * @param {Function} fn - Async test function. Should throw on failure.
 */
async function test(name, fn) {
  try {
    await fn();
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
    passed++;
  } catch (err) {
    console.log(`  \x1b[31m✗\x1b[0m ${name}`);
    console.log(`    ${err.message}`);
    failed++;
  }
}

/**
 * Simple assertion helper.
 *
 * @param {boolean} condition - Must be true.
 * @param {string} message - Error message if false.
 */
function assert(condition, message) {
  if (!condition) throw new Error(message || "Assertion failed");
}

/**
 * Deep equality check for objects.
 *
 * @param {*} a - Expected value.
 * @param {*} b - Actual value.
 * @param {string} msg - Error context.
 */
function assertEqual(a, b, msg) {
  const strA = JSON.stringify(a);
  const strB = JSON.stringify(b);
  if (strA !== strB) {
    throw new Error(`${msg || "assertEqual"}: expected ${strA}, got ${strB}`);
  }
}

// ─────────────────────────────────────────────────────────
//  Mock Setup
// ─────────────────────────────────────────────────────────

/**
 * Creates a mock DynamoDB that stores items in memory.
 * Replaces the real AWS SDK calls in dynamo.js.
 */
function createMockDynamo() {
  const store = {};

  return {
    store,
    putEvent: async (event) => {
      const key = `EVENT#${event.eventName}`;
      if (!store[key]) store[key] = [];
      store[key].push(event);
    },
    getRecentEvents: async (eventName, limit = 50) => {
      const key = `EVENT#${eventName}`;
      return (store[key] || []).slice(0, limit);
    },
    getAllRecentEvents: async (limit = 20) => {
      const all = Object.values(store).flat();
      all.sort((a, b) => b.timestamp - a.timestamp);
      return all.slice(0, limit);
    },
    putState: async (state) => {
      store["VAULT_STATE"] = state;
    },
    getLatestState: async () => {
      return store["VAULT_STATE"] || null;
    },
    putLastPolledBlock: async (blockNumber) => {
      store["POLL_CURSOR"] = blockNumber;
    },
    getLastPolledBlock: async () => {
      return store["POLL_CURSOR"] || null;
    },
  };
}

// ─────────────────────────────────────────────────────────
//  Tests: API Handler
// ─────────────────────────────────────────────────────────

async function testApiHandler() {
  console.log("\nAPI Handler");

  // We can test the apiHandler directly by requiring it and mocking dynamo
  // Since it imports dynamo at module level, we override the module cache

  const mockDynamo = createMockDynamo();

  // Seed mock data
  const mockState = {
    contractAddress: "0x1234567890abcdef1234567890abcdef12345678",
    chainId: 11155111,
    blockNumber: 12345,
    timestamp: Math.floor(Date.now() / 1000),
    owner: "0xOwner",
    paused: false,
    balance: "1000000000000000000",
    deadManSwitch: {
      heartbeatInterval: 2592000,
      gracePeriod: 604800,
      lastCheckIn: Math.floor(Date.now() / 1000) - 86400,
      switchDeadline: Math.floor(Date.now() / 1000) + 2505600,
      isSwitchActivated: false,
      recoveryAddress: "0xRecovery",
      secondsRemaining: 2505600,
    },
    rateLimiter: {
      maxAmount: "10000000000000000000",
      windowDuration: 86400,
      currentUsage: "3000000000000000000",
      remaining: "7000000000000000000",
    },
    breakGlass: { threshold: 2, executionDelay: 3600, guardianCount: 3 },
    watchdog: {
      largeTransferThreshold: "5000000000000000000",
      rapidActivityThreshold: 3,
      rapidActivityWindow: 3600,
    },
  };

  await mockDynamo.putState(mockState);
  await mockDynamo.putLastPolledBlock(12345);
  await mockDynamo.putEvent({
    eventName: "HeartbeatReceived",
    blockNumber: 12340,
    transactionHash: "0xabc",
    timestamp: Math.floor(Date.now() / 1000) - 3600,
    args: { owner: "0xOwner", nextDeadline: "9999999999" },
  });

  // Override require cache for dynamo module
  const dynamoPath = require.resolve("../src/lib/dynamo");
  require.cache[dynamoPath] = {
    id: dynamoPath,
    filename: dynamoPath,
    loaded: true,
    exports: mockDynamo,
  };

  // Clear apiHandler from cache so it picks up the mock
  const handlerPath = require.resolve("../src/lambdas/apiHandler");
  delete require.cache[handlerPath];
  const { handler } = require("../src/lambdas/apiHandler");

  await test("GET /health returns HEALTHY status", async () => {
    const res = await handler({ httpMethod: "GET", path: "/health", queryStringParameters: {} });
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
    const body = JSON.parse(res.body);
    assert(body.status === "HEALTHY", `Expected HEALTHY, got ${body.status}`);
    assert(body.lastPolledBlock === 12345, "Expected lastPolledBlock 12345");
  });

  await test("GET /status returns vault state", async () => {
    const res = await handler({ httpMethod: "GET", path: "/status", queryStringParameters: {} });
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
    const body = JSON.parse(res.body);
    assert(body.data !== null, "Expected data to be present");
    assert(body.data.owner === "0xOwner", "Expected owner to match");
    assert(body.data.balance === "1000000000000000000", "Expected balance to match");
  });

  await test("GET /events returns event list", async () => {
    const res = await handler({ httpMethod: "GET", path: "/events", queryStringParameters: {} });
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
    const body = JSON.parse(res.body);
    assert(body.count >= 1, `Expected at least 1 event, got ${body.count}`);
    const hasHeartbeat = body.events.some((e) => e.eventName === "HeartbeatReceived");
    assert(hasHeartbeat, "Expected at least one HeartbeatReceived event");
  });

  await test("GET /events?type=WatchdogAlerted returns filtered events", async () => {
    const res = await handler({
      httpMethod: "GET",
      path: "/events",
      queryStringParameters: { type: "WatchdogAlerted" },
    });
    const body = JSON.parse(res.body);
    assert(body.count === 0, "Expected 0 WatchdogAlerted events");
  });

  await test("GET /proposals returns proposal events", async () => {
    const res = await handler({ httpMethod: "GET", path: "/proposals", queryStringParameters: {} });
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
    const body = JSON.parse(res.body);
    assert(Array.isArray(body.proposed), "Expected proposed array");
    assert(Array.isArray(body.executed), "Expected executed array");
  });

  await test("GET /unknown returns 404", async () => {
    const res = await handler({ httpMethod: "GET", path: "/unknown", queryStringParameters: {} });
    assert(res.statusCode === 404, `Expected 404, got ${res.statusCode}`);
  });

  await test("OPTIONS returns 200 with CORS headers", async () => {
    const res = await handler({ httpMethod: "OPTIONS", path: "/status", queryStringParameters: {} });
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
    assert(res.headers["Access-Control-Allow-Origin"] === "*", "Expected CORS origin *");
  });

  await test("GET /health with stale data shows STALE", async () => {
    const staleState = { ...mockState, timestamp: Math.floor(Date.now() / 1000) - 10000 };
    await mockDynamo.putState(staleState);
    const res = await handler({ httpMethod: "GET", path: "/health", queryStringParameters: {} });
    const body = JSON.parse(res.body);
    assert(body.status === "STALE", `Expected STALE, got ${body.status}`);
  });

  await test("GET /health with activated switch shows CRITICAL", async () => {
    const critState = { ...mockState, timestamp: Math.floor(Date.now() / 1000) };
    critState.deadManSwitch = { ...mockState.deadManSwitch, isSwitchActivated: true };
    await mockDynamo.putState(critState);
    const res = await handler({ httpMethod: "GET", path: "/health", queryStringParameters: {} });
    const body = JSON.parse(res.body);
    assert(body.status === "CRITICAL", `Expected CRITICAL, got ${body.status}`);
  });

  // Clean up module cache
  delete require.cache[dynamoPath];
  delete require.cache[handlerPath];
}

// ─────────────────────────────────────────────────────────
//  Tests: Alerts
// ─────────────────────────────────────────────────────────

async function testAlerts() {
  console.log("\nAlerts");

  // Mock SNS — alerts.js will fall back to console.log when no topic ARN
  const alertsPath = require.resolve("../src/lib/alerts");
  delete require.cache[alertsPath];

  // Ensure no ALERT_TOPIC_ARN so it logs instead of calling SNS
  const origArn = process.env.ALERT_TOPIC_ARN;
  process.env.ALERT_TOPIC_ARN = "";

  const alerts = require("../src/lib/alerts");

  await test("sendAlert with no topic ARN logs without error", async () => {
    // Should not throw — just logs to console
    await alerts.sendAlert({
      severity: "CRITICAL",
      title: "Test Alert",
      message: "This is a test.",
      data: { foo: "bar" },
    });
  });

  await test("convenience methods work", async () => {
    await alerts.info("Info Test", "info message");
    await alerts.warning("Warning Test", "warning message");
    await alerts.critical("Critical Test", "critical message");
  });

  process.env.ALERT_TOPIC_ARN = origArn || "";
  delete require.cache[alertsPath];
}

// ─────────────────────────────────────────────────────────
//  Tests: Config
// ─────────────────────────────────────────────────────────

async function testConfig() {
  console.log("\nConfig");

  const configPath = require.resolve("../src/lib/config");
  delete require.cache[configPath];
  const config = require("../src/lib/config");

  await test("config has all required fields", async () => {
    assert(typeof config.rpcUrl === "string", "rpcUrl should be string");
    assert(typeof config.eventsTable === "string", "eventsTable should be string");
    assert(typeof config.stateTable === "string", "stateTable should be string");
    assert(typeof config.chainId === "number", "chainId should be number");
    assert(typeof config.pollBlockRange === "number", "pollBlockRange should be number");
    assert(typeof config.heartbeatWarningHours === "number", "heartbeatWarningHours should be number");
  });

  await test("config defaults are sensible", async () => {
    assert(config.chainId === 11155111, "Default chainId should be Sepolia");
    assert(config.pollBlockRange === 100, "Default pollBlockRange should be 100");
    assert(config.heartbeatWarningHours === 48, "Default warning hours should be 48");
    assert(config.eventsTable === "SentinelEvents", "Default events table");
    assert(config.stateTable === "SentinelState", "Default state table");
  });

  delete require.cache[configPath];
}

// ─────────────────────────────────────────────────────────
//  Main
// ─────────────────────────────────────────────────────────

async function main() {
  console.log("NGE Sentinel Monitor — Test Suite\n");

  await testConfig();
  await testAlerts();
  await testApiHandler();

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
