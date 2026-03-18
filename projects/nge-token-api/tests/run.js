/**
 * @file run.js
 * @description Test runner for the NGE Token API Lambda functions.
 * Tests use mocked DynamoDB and ethers dependencies.
 *
 * @usage node tests/run.js
 */

let passed = 0;
let failed = 0;

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

function assert(condition, message) {
  if (!condition) throw new Error(message || "Assertion failed");
}

// ─── Mock DynamoDB ────────────────────────────────────────

function createMockDynamo() {
  const store = {};

  return {
    store,
    putTransfer: async (transfer) => {
      const key1 = `TRANSFER#${transfer.from}`;
      const key2 = `TRANSFER#${transfer.to}`;
      if (!store[key1]) store[key1] = [];
      if (!store[key2]) store[key2] = [];
      store[key1].push(transfer);
      store[key2].push(transfer);
    },
    getTransfers: async (address, limit = 50) => {
      return (store[`TRANSFER#${address}`] || []).slice(0, limit);
    },
    putTokenEvent: async (event) => {
      const key = `EVENT#${event.eventName}`;
      if (!store[key]) store[key] = [];
      store[key].push(event);
    },
    putLastPolledBlock: async (bn) => { store.POLL_CURSOR = bn; },
    getLastPolledBlock: async () => store.POLL_CURSOR || null,
    putProposal: async (p) => {
      if (!store.PROPOSALS) store.PROPOSALS = [];
      const idx = store.PROPOSALS.findIndex((x) => x.proposalId === p.proposalId);
      if (idx >= 0) store.PROPOSALS[idx] = p;
      else store.PROPOSALS.push(p);
    },
    getProposals: async (limit = 50) => (store.PROPOSALS || []).slice(0, limit),
    putVote: async (v) => {
      if (!store.VOTES) store.VOTES = [];
      store.VOTES.push(v);
    },
    getVotes: async (proposalId, limit = 200) =>
      (store.VOTES || []).filter((v) => v.proposalId === proposalId).slice(0, limit),
    putGovernanceCursor: async (bn) => { store.GOV_CURSOR = bn; },
    getGovernanceCursor: async () => store.GOV_CURSOR || null,
  };
}

// ─── Mock Contract ────────────────────────────────────────

function createMockContract() {
  return {
    getTokenInfo: async () => ({
      name: "NextGen Economy",
      symbol: "NGE",
      decimals: 18,
      totalSupply: "1000000000000000000000000",
      supplyCap: "10000000000000000000000000",
      paused: false,
      address: "0x1234567890abcdef1234567890abcdef12345678",
    }),
    getBalance: async (address) => ({
      address,
      balance: "5000000000000000000000",
      votingPower: "5000000000000000000000",
      delegate: address,
    }),
  };
}

// ─── Tests: Config ────────────────────────────────────────

async function testConfig() {
  console.log("\nConfig");

  const configPath = require.resolve("../src/lib/config");
  delete require.cache[configPath];
  const config = require("../src/lib/config");

  await test("config has all required fields", async () => {
    assert(typeof config.rpcUrl === "string", "rpcUrl should be string");
    assert(typeof config.tokenAddress === "string", "tokenAddress should be string");
    assert(typeof config.governorAddress === "string", "governorAddress should be string");
    assert(typeof config.eventsTable === "string", "eventsTable should be string");
    assert(typeof config.governanceTable === "string", "governanceTable should be string");
    assert(typeof config.chainId === "number", "chainId should be number");
    assert(typeof config.pollBlockRange === "number", "pollBlockRange should be number");
  });

  await test("config defaults are sensible", async () => {
    assert(config.chainId === 11155111, "Default chainId should be Sepolia");
    assert(config.pollBlockRange === 200, "Default pollBlockRange should be 200");
    assert(config.eventsTable === "TokenEvents", "Default events table");
    assert(config.governanceTable === "GovernanceData", "Default governance table");
  });

  delete require.cache[configPath];
}

// ─── Tests: API Handler ──────────────────────────────────

async function testApiHandler() {
  console.log("\nAPI Handler");

  const mockDynamo = createMockDynamo();
  const mockContract = createMockContract();

  // Seed mock data
  await mockDynamo.putLastPolledBlock(100000);
  await mockDynamo.putTransfer({
    eventName: "Transfer",
    from: "0xAlice",
    to: "0xBob",
    value: "1000000000000000000",
    blockNumber: 99999,
    transactionHash: "0xabc123",
    logIndex: 0,
    timestamp: Math.floor(Date.now() / 1000) - 3600,
  });
  await mockDynamo.putProposal({
    proposalId: "12345",
    proposer: "0xAlice",
    description: "Increase supply cap to 100M NGE",
    state: 1,
    stateLabel: "Active",
    blockNumber: 99990,
  });
  await mockDynamo.putVote({
    proposalId: "12345",
    voter: "0xBob",
    support: 1,
    supportLabel: "For",
    weight: "5000000000000000000000",
    reason: "",
    blockNumber: 99995,
  });

  // Override require caches
  const dynamoPath = require.resolve("../src/lib/dynamo");
  const contractPath = require.resolve("../src/lib/contract");
  require.cache[dynamoPath] = { id: dynamoPath, filename: dynamoPath, loaded: true, exports: mockDynamo };
  require.cache[contractPath] = { id: contractPath, filename: contractPath, loaded: true, exports: mockContract };

  const handlerPath = require.resolve("../src/lambdas/apiHandler");
  delete require.cache[handlerPath];
  const { handler } = require("../src/lambdas/apiHandler");

  await test("GET /health returns healthy status", async () => {
    const res = await handler({ httpMethod: "GET", path: "/health", queryStringParameters: {} });
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
    const body = JSON.parse(res.body);
    assert(body.status === "HEALTHY", `Expected HEALTHY, got ${body.status}`);
    assert(body.lastPolledBlock === 100000, "Expected lastPolledBlock 100000");
  });

  await test("GET /token-info returns token metadata", async () => {
    const res = await handler({ httpMethod: "GET", path: "/token-info", queryStringParameters: {} });
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
    const body = JSON.parse(res.body);
    assert(body.data.name === "NextGen Economy", "Expected token name");
    assert(body.data.symbol === "NGE", "Expected token symbol");
  });

  await test("GET /balance requires address parameter", async () => {
    const res = await handler({ httpMethod: "GET", path: "/balance", queryStringParameters: {} });
    assert(res.statusCode === 400, `Expected 400, got ${res.statusCode}`);
  });

  await test("GET /balance returns balance data", async () => {
    const res = await handler({
      httpMethod: "GET",
      path: "/balance",
      queryStringParameters: { address: "0xAlice" },
    });
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
    const body = JSON.parse(res.body);
    assert(body.data.address === "0xAlice", "Expected address to match");
    assert(body.data.balance === "5000000000000000000000", "Expected balance");
  });

  await test("GET /transfers returns transfer history", async () => {
    const res = await handler({
      httpMethod: "GET",
      path: "/transfers",
      queryStringParameters: { address: "0xAlice" },
    });
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
    const body = JSON.parse(res.body);
    assert(body.count >= 1, "Expected at least 1 transfer");
  });

  await test("GET /transfers requires address", async () => {
    const res = await handler({ httpMethod: "GET", path: "/transfers", queryStringParameters: {} });
    assert(res.statusCode === 400, `Expected 400, got ${res.statusCode}`);
  });

  await test("GET /proposals returns proposals", async () => {
    const res = await handler({ httpMethod: "GET", path: "/proposals", queryStringParameters: {} });
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
    const body = JSON.parse(res.body);
    assert(body.count >= 1, `Expected at least 1 proposal, got ${body.count}`);
    assert(body.proposals[0].proposalId === "12345", "Expected proposal ID");
  });

  await test("GET /votes requires proposalId", async () => {
    const res = await handler({ httpMethod: "GET", path: "/votes", queryStringParameters: {} });
    assert(res.statusCode === 400, `Expected 400, got ${res.statusCode}`);
  });

  await test("GET /votes returns votes for proposal", async () => {
    const res = await handler({
      httpMethod: "GET",
      path: "/votes",
      queryStringParameters: { proposalId: "12345" },
    });
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
    const body = JSON.parse(res.body);
    assert(body.count >= 1, "Expected at least 1 vote");
    assert(body.votes[0].voter === "0xBob", "Expected Bob's vote");
  });

  await test("GET /unknown returns 404", async () => {
    const res = await handler({ httpMethod: "GET", path: "/unknown", queryStringParameters: {} });
    assert(res.statusCode === 404, `Expected 404, got ${res.statusCode}`);
  });

  await test("OPTIONS returns 200 with CORS", async () => {
    const res = await handler({ httpMethod: "OPTIONS", path: "/health", queryStringParameters: {} });
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
    assert(res.headers["Access-Control-Allow-Origin"] === "*", "Expected CORS origin");
  });

  // Clean up
  delete require.cache[dynamoPath];
  delete require.cache[contractPath];
  delete require.cache[handlerPath];
}

// ─── Main ────────────────────────────────────────────────

async function main() {
  console.log("NGE Token API — Test Suite\n");

  await testConfig();
  await testApiHandler();

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
