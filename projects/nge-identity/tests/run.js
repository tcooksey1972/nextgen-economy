/**
 * @file run.js
 * @description Lightweight test runner for the NGE Identity Lambda functions.
 * Tests use mocked DynamoDB, contract, and config dependencies so they can
 * run without AWS credentials or blockchain access.
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
    console.log(`  \x1b[32m\u2713\x1b[0m ${name}`);
    passed++;
  } catch (err) {
    console.log(`  \x1b[31m\u2717\x1b[0m ${name}`);
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
 * Replaces the real dynamo.js module.
 */
function createMockDynamo() {
  const store = {};

  function tableKey(tableName, pk, sk) {
    return `${tableName}||${pk}||${sk}`;
  }

  return {
    store,

    putItem: async (tableName, item) => {
      const key = tableKey(tableName, item.pk, item.sk);
      store[key] = { ...item };
    },

    getItem: async (tableName, pk, sk) => {
      const key = tableKey(tableName, pk, sk);
      return store[key] || null;
    },

    queryByPK: async (tableName, pk, limit = 50) => {
      const prefix = `${tableName}||${pk}||`;
      return Object.entries(store)
        .filter(([k]) => k.startsWith(prefix))
        .map(([, v]) => v)
        .slice(0, limit);
    },

    queryByPKAndSKPrefix: async (tableName, pk, skPrefix, limit = 50) => {
      const prefix = `${tableName}||${pk}||${skPrefix}`;
      return Object.entries(store)
        .filter(([k]) => k.startsWith(prefix))
        .map(([, v]) => v)
        .slice(0, limit);
    },

    reset: () => {
      for (const key of Object.keys(store)) delete store[key];
    },
  };
}

/**
 * Creates mock config with test values.
 */
function createMockConfig() {
  return {
    ETH_RPC_URL: "http://localhost:8545",
    DID_REGISTRY_ADDRESS: "0x0000000000000000000000000000000000000001",
    CREDENTIAL_REGISTRY_ADDRESS: "0x0000000000000000000000000000000000000002",
    MARKETPLACE_ADDRESS: "0x0000000000000000000000000000000000000003",
    SENSOR_ANCHOR_ADDRESS: "0x0000000000000000000000000000000000000004",
    SIGNER_PRIVATE_KEY: "0x" + "ab".repeat(32),
    IDENTITY_TABLE: "TestIdentityData",
    CREDENTIAL_TABLE: "TestCredentialData",
    MARKETPLACE_TABLE: "TestMarketplaceData",
    SENSOR_TABLE: "TestSensorData",
    CREDENTIAL_BUCKET: "test-bucket",
    CHAIN_ID: 11155111,
    FHIR_SERVER_URL: "",
  };
}

/**
 * Creates mock contract objects that return predictable results.
 */
function createMockContracts() {
  const mockTxReceipt = {
    hash: "0x" + "ff".repeat(32),
    blockNumber: 42,
    from: "0x" + "aa".repeat(20),
  };
  const mockTx = { wait: async () => mockTxReceipt };

  return {
    getDIDRegistry: () => ({
      createDID: async () => mockTx,
      updateDocument: async () => mockTx,
      deactivate: async () => mockTx,
      bindBiometric: async () => mockTx,
      resolve: async (didHash) => ({
        controller: "0x" + "aa".repeat(20),
        documentURI: "https://example.com/did.json",
        created: BigInt(1700000000),
        updated: BigInt(1700000000),
        active: true,
      }),
      isActive: async () => true,
      controllerOf: async () => "0x" + "aa".repeat(20),
      didCount: async () => BigInt(5),
    }),

    getCredentialRegistry: () => ({
      issueCredential: async () => mockTx,
      revokeCredential: async () => mockTx,
      verifyCredential: async () => ({
        valid: true,
        expired: false,
        revoked: false,
        trustedIssuer: true,
      }),
      getHolderCredentials: async () => ["0x" + "cc".repeat(32)],
      getCredential: async () => ({
        issuerDID: "0x" + "11".repeat(32),
        holderDID: "0x" + "22".repeat(32),
        credentialHash: "0x" + "33".repeat(32),
        cType: 0,
        issuedAt: BigInt(1700000000),
        expiresAt: BigInt(0),
        revoked: false,
        metadataURI: "https://example.com/cred.json",
      }),
      credentialCount: async () => BigInt(10),
    }),

    getMarketplace: () => ({
      createListing: async () => mockTx,
      engageWorker: async () => mockTx,
      completeEngagement: async () => mockTx,
      getListing: async () => ({
        workerDID: "0x" + "44".repeat(32),
        title: "Test Listing",
        descriptionURI: "",
        requiredCredentials: [],
        verificationLevel: 1,
        lType: 0,
        rateWei: BigInt(1000),
        isHourly: true,
        status: 0,
        createdAt: BigInt(1700000000),
      }),
      getWorkerRating: async () => [BigInt(45), BigInt(10)],
    }),

    getSensorAnchor: () => ({
      registerDevice: async () => mockTx,
      anchorBatch: async () => mockTx,
      verifyReading: async (batchId, leaf, proof) => true,
      getBatch: async () => ({
        deviceDID: "0x" + "55".repeat(32),
        merkleRoot: "0x" + "66".repeat(32),
        readingCount: BigInt(100),
        startTimestamp: BigInt(1700000000),
        endTimestamp: BigInt(1700003600),
        metadataURI: "",
        anchoredAt: BigInt(1700003700),
      }),
      isDeviceRegistered: async () => true,
    }),
  };
}

/**
 * Installs mocks into require.cache and clears handler caches.
 * Returns cleanup function.
 */
function installMocks(mockDynamo, mockConfig, mockContracts) {
  const dynamoPath = require.resolve("../src/lib/dynamo");
  const configPath = require.resolve("../src/lib/config");
  const contractPath = require.resolve("../src/lib/contract");

  require.cache[dynamoPath] = {
    id: dynamoPath, filename: dynamoPath, loaded: true,
    exports: mockDynamo,
  };
  require.cache[configPath] = {
    id: configPath, filename: configPath, loaded: true,
    exports: mockConfig,
  };
  require.cache[contractPath] = {
    id: contractPath, filename: contractPath, loaded: true,
    exports: mockContracts,
  };

  return function cleanup() {
    delete require.cache[dynamoPath];
    delete require.cache[configPath];
    delete require.cache[contractPath];
  };
}

/**
 * Loads a handler fresh (clears its cache first).
 */
function loadHandler(handlerPath) {
  const resolved = require.resolve(handlerPath);
  delete require.cache[resolved];
  return require(resolved);
}

// ─────────────────────────────────────────────────────────
//  Tests: identityApi.js
// ─────────────────────────────────────────────────────────

async function testIdentityApi() {
  console.log("\nIdentity API (identityApi.js)");

  const mockDynamo = createMockDynamo();
  const mockConfig = createMockConfig();
  const mockContracts = createMockContracts();
  const cleanup = installMocks(mockDynamo, mockConfig, mockContracts);
  const { handler } = loadHandler("../aws/lambda/identityApi");

  await test("POST /identity/did creates a DID and returns 201", async () => {
    const res = await handler({
      httpMethod: "POST",
      path: "/identity/did",
      body: JSON.stringify({ didString: "did:nge:alice", documentURI: "https://example.com/alice.json" }),
      pathParameters: {},
    });
    assert(res.statusCode === 201, `Expected 201, got ${res.statusCode}`);
    const body = JSON.parse(res.body);
    assert(body.didHash, "Expected didHash in response");
    assert(body.transactionHash, "Expected transactionHash in response");
    assert(body.documentURI === "https://example.com/alice.json", "Expected documentURI match");
  });

  await test("POST /identity/did returns 400 when missing fields", async () => {
    const res = await handler({
      httpMethod: "POST",
      path: "/identity/did",
      body: JSON.stringify({ didString: "did:nge:bob" }),
      pathParameters: {},
    });
    assert(res.statusCode === 400, `Expected 400, got ${res.statusCode}`);
    const body = JSON.parse(res.body);
    assert(body.error.includes("Missing"), "Expected missing field error");
  });

  await test("POST /identity/did returns 400 with empty body", async () => {
    const res = await handler({
      httpMethod: "POST",
      path: "/identity/did",
      body: JSON.stringify({}),
      pathParameters: {},
    });
    assert(res.statusCode === 400, `Expected 400, got ${res.statusCode}`);
  });

  await test("GET /identity/did/{didHash} resolves from chain when not cached", async () => {
    const res = await handler({
      httpMethod: "GET",
      path: "/identity/did/0xabc123",
      pathParameters: { didHash: "0xabc123" },
    });
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
    const body = JSON.parse(res.body);
    assert(body.source === "chain", "Expected chain source when not cached");
    assert(body.data.active === true, "Expected active DID");
  });

  await test("GET /identity/did/{didHash} resolves from cache when present", async () => {
    // Seed the cache
    await mockDynamo.putItem(mockConfig.IDENTITY_TABLE, {
      pk: "DID#0xcached",
      sk: "PROFILE",
      didString: "did:nge:cached",
      didHash: "0xcached",
      documentURI: "https://example.com/cached.json",
      status: "ACTIVE",
    });
    const res = await handler({
      httpMethod: "GET",
      path: "/identity/did/0xcached",
      pathParameters: { didHash: "0xcached" },
    });
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
    const body = JSON.parse(res.body);
    assert(body.source === "cache", "Expected cache source");
  });

  await test("GET /identity/did returns 400 when didHash is missing", async () => {
    const res = await handler({
      httpMethod: "GET",
      path: "/identity/did/",
      pathParameters: {},
    });
    // The path starts with /identity/did/ but pathParameters.didHash is undefined
    assert(res.statusCode === 400, `Expected 400, got ${res.statusCode}`);
  });

  await test("GET /health returns HEALTHY status with didCount", async () => {
    const res = await handler({
      httpMethod: "GET",
      path: "/health",
      pathParameters: {},
    });
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
    const body = JSON.parse(res.body);
    assert(body.status === "HEALTHY", `Expected HEALTHY, got ${body.status}`);
    assert(body.didCount === 5, `Expected didCount 5, got ${body.didCount}`);
    assert(body.module === "identity", "Expected module identity");
  });

  await test("OPTIONS returns 200 with CORS headers", async () => {
    const res = await handler({
      httpMethod: "OPTIONS",
      path: "/identity/did",
      pathParameters: {},
    });
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
    assert(res.headers["Access-Control-Allow-Origin"] === "*", "Expected CORS origin *");
  });

  await test("GET /unknown returns 404", async () => {
    const res = await handler({
      httpMethod: "GET",
      path: "/nonexistent",
      pathParameters: {},
    });
    assert(res.statusCode === 404, `Expected 404, got ${res.statusCode}`);
  });

  cleanup();
}

// ─────────────────────────────────────────────────────────
//  Tests: credentialApi.js
// ─────────────────────────────────────────────────────────

async function testCredentialApi() {
  console.log("\nCredential API (credentialApi.js)");

  const mockDynamo = createMockDynamo();
  const mockConfig = createMockConfig();
  const mockContracts = createMockContracts();
  const cleanup = installMocks(mockDynamo, mockConfig, mockContracts);
  const { handler } = loadHandler("../aws/lambda/credentialApi");

  await test("POST /credentials/issue creates a credential and returns 201", async () => {
    const res = await handler({
      httpMethod: "POST",
      path: "/credentials/issue",
      body: JSON.stringify({
        credentialId: "cred-001",
        issuerDID: "did:nge:issuer",
        holderDID: "did:nge:holder",
        credentialType: 0,
        vcDocument: { name: "Test Credential" },
      }),
      pathParameters: {},
    });
    assert(res.statusCode === 201, `Expected 201, got ${res.statusCode}`);
    const body = JSON.parse(res.body);
    assert(body.credentialIdHash, "Expected credentialIdHash");
    assert(body.credentialHash, "Expected credentialHash");
    assert(body.transactionHash, "Expected transactionHash");
  });

  await test("POST /credentials/issue returns 400 when missing fields", async () => {
    const res = await handler({
      httpMethod: "POST",
      path: "/credentials/issue",
      body: JSON.stringify({ credentialId: "cred-002" }),
      pathParameters: {},
    });
    assert(res.statusCode === 400, `Expected 400, got ${res.statusCode}`);
    const body = JSON.parse(res.body);
    assert(body.error.includes("Missing"), "Expected missing fields error");
  });

  await test("POST /credentials/issue handles empty body", async () => {
    const res = await handler({
      httpMethod: "POST",
      path: "/credentials/issue",
      body: JSON.stringify({}),
      pathParameters: {},
    });
    assert(res.statusCode === 400, `Expected 400, got ${res.statusCode}`);
  });

  await test("GET /credentials/{id}/verify returns verification result", async () => {
    const res = await handler({
      httpMethod: "GET",
      path: "/credentials/0xabc/verify",
      pathParameters: { id: "0xabc" },
    });
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
    const body = JSON.parse(res.body);
    assert(body.valid === true, "Expected valid credential");
    assert(body.expired === false, "Expected not expired");
    assert(body.revoked === false, "Expected not revoked");
    assert(body.trustedIssuer === true, "Expected trusted issuer");
  });

  await test("GET /credentials/{id}/verify returns 400 when id param is undefined", async () => {
    const res = await handler({
      httpMethod: "GET",
      path: "/credentials/someid/verify",
      pathParameters: {},
    });
    assert(res.statusCode === 400, `Expected 400, got ${res.statusCode}`);
  });

  await test("GET /credentials/holder/{didHash} returns credentials from cache", async () => {
    // Seed some cached credentials
    const { ethers } = require("ethers");
    const holderHash = ethers.keccak256(ethers.toUtf8Bytes("did:nge:holder"));
    const credIdHash = ethers.keccak256(ethers.toUtf8Bytes("cred-cached"));
    await mockDynamo.putItem(mockConfig.CREDENTIAL_TABLE, {
      pk: `DID#${holderHash}`,
      sk: `CREDENTIAL#${credIdHash}`,
      credentialId: "cred-cached",
      credentialType: "EDUCATION",
      issuerDID: "did:nge:issuer",
      issuedAt: new Date().toISOString(),
    });

    const res = await handler({
      httpMethod: "GET",
      path: `/credentials/holder/${holderHash}`,
      pathParameters: { didHash: holderHash },
    });
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
    const body = JSON.parse(res.body);
    assert(body.source === "cache", "Expected cache source");
    assert(body.count >= 1, "Expected at least 1 credential");
  });

  await test("GET /credentials/holder/{didHash} falls back to chain when cache empty", async () => {
    const res = await handler({
      httpMethod: "GET",
      path: "/credentials/holder/0xnocache",
      pathParameters: { didHash: "0xnocache" },
    });
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
    const body = JSON.parse(res.body);
    assert(body.source === "chain", "Expected chain source");
  });

  await test("GET /unknown returns 404", async () => {
    const res = await handler({
      httpMethod: "GET",
      path: "/unknown/path",
      pathParameters: {},
    });
    assert(res.statusCode === 404, `Expected 404, got ${res.statusCode}`);
  });

  cleanup();
}

// ─────────────────────────────────────────────────────────
//  Tests: marketplaceApi.js
// ─────────────────────────────────────────────────────────

async function testMarketplaceApi() {
  console.log("\nMarketplace API (marketplaceApi.js)");

  const mockDynamo = createMockDynamo();
  const mockConfig = createMockConfig();
  const mockContracts = createMockContracts();
  const cleanup = installMocks(mockDynamo, mockConfig, mockContracts);
  const { handler } = loadHandler("../aws/lambda/marketplaceApi");

  await test("POST /marketplace/listings creates a listing and returns 201", async () => {
    const res = await handler({
      httpMethod: "POST",
      path: "/marketplace/listings",
      body: JSON.stringify({
        workerDID: "did:nge:worker1",
        title: "Solidity Developer",
        descriptionURI: "https://example.com/listing.json",
        listingType: 0,
        rateWei: "1000000000000000000",
      }),
      queryStringParameters: {},
      pathParameters: {},
    });
    assert(res.statusCode === 201, `Expected 201, got ${res.statusCode}`);
    const body = JSON.parse(res.body);
    assert(body.listingId, "Expected listingId");
    assert(body.title === "Solidity Developer", "Expected title match");
    assert(body.status === "OPEN", "Expected OPEN status");
  });

  await test("POST /marketplace/listings returns 400 when missing workerDID", async () => {
    const res = await handler({
      httpMethod: "POST",
      path: "/marketplace/listings",
      body: JSON.stringify({ title: "No Worker DID" }),
      queryStringParameters: {},
      pathParameters: {},
    });
    assert(res.statusCode === 400, `Expected 400, got ${res.statusCode}`);
    const body = JSON.parse(res.body);
    assert(body.error.includes("Missing"), "Expected missing field error");
  });

  await test("POST /marketplace/listings returns 400 when missing title", async () => {
    const res = await handler({
      httpMethod: "POST",
      path: "/marketplace/listings",
      body: JSON.stringify({ workerDID: "did:nge:worker2" }),
      queryStringParameters: {},
      pathParameters: {},
    });
    assert(res.statusCode === 400, `Expected 400, got ${res.statusCode}`);
  });

  await test("GET /marketplace/listings returns listings list", async () => {
    const res = await handler({
      httpMethod: "GET",
      path: "/marketplace/listings",
      queryStringParameters: {},
      pathParameters: {},
    });
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
    const body = JSON.parse(res.body);
    assert(typeof body.count === "number", "Expected count to be a number");
    assert(Array.isArray(body.listings), "Expected listings array");
  });

  await test("GET /marketplace/listings respects limit parameter", async () => {
    const res = await handler({
      httpMethod: "GET",
      path: "/marketplace/listings",
      queryStringParameters: { limit: "5" },
      pathParameters: {},
    });
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
  });

  await test("GET /marketplace/listings/{id} returns listing detail", async () => {
    // Seed a listing
    const listingId = "0x" + "bb".repeat(32);
    await mockDynamo.putItem(mockConfig.MARKETPLACE_TABLE, {
      pk: `LISTING#${listingId}`,
      sk: "DETAIL",
      listingId,
      title: "Seeded Listing",
      status: "OPEN",
    });
    const res = await handler({
      httpMethod: "GET",
      path: `/marketplace/listings/${listingId}`,
      queryStringParameters: {},
      pathParameters: { id: listingId },
    });
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
    const body = JSON.parse(res.body);
    assert(body.data.title === "Seeded Listing", "Expected seeded listing title");
  });

  await test("GET /marketplace/listings/{id} returns 404 for nonexistent listing", async () => {
    const res = await handler({
      httpMethod: "GET",
      path: "/marketplace/listings/0xnonexistent",
      queryStringParameters: {},
      pathParameters: { id: "0xnonexistent" },
    });
    assert(res.statusCode === 404, `Expected 404, got ${res.statusCode}`);
  });

  await test("GET /marketplace/worker/{did}/reputation returns rating", async () => {
    const res = await handler({
      httpMethod: "GET",
      path: "/marketplace/worker/0xworker/reputation",
      queryStringParameters: {},
      pathParameters: { did: "0xworker" },
    });
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
    const body = JSON.parse(res.body);
    assert(body.totalRating === 45, `Expected totalRating 45, got ${body.totalRating}`);
    assert(body.ratingCount === 10, `Expected ratingCount 10, got ${body.ratingCount}`);
    assert(body.averageRating === 4.5, `Expected averageRating 4.5, got ${body.averageRating}`);
  });

  cleanup();
}

// ─────────────────────────────────────────────────────────
//  Tests: sensorApi.js
// ─────────────────────────────────────────────────────────

async function testSensorApi() {
  console.log("\nSensor API (sensorApi.js)");

  const mockDynamo = createMockDynamo();
  const mockConfig = createMockConfig();
  const mockContracts = createMockContracts();
  const cleanup = installMocks(mockDynamo, mockConfig, mockContracts);
  const { handler } = loadHandler("../aws/lambda/sensorApi");

  await test("POST /sensors/register registers a device and returns 201", async () => {
    const res = await handler({
      httpMethod: "POST",
      path: "/sensors/register",
      body: JSON.stringify({ deviceDID: "did:nge:sensor001" }),
      queryStringParameters: {},
      pathParameters: {},
    });
    assert(res.statusCode === 201, `Expected 201, got ${res.statusCode}`);
    const body = JSON.parse(res.body);
    assert(body.deviceDIDHash, "Expected deviceDIDHash");
    assert(body.transactionHash, "Expected transactionHash");
  });

  await test("POST /sensors/register returns 400 when missing deviceDID", async () => {
    const res = await handler({
      httpMethod: "POST",
      path: "/sensors/register",
      body: JSON.stringify({}),
      queryStringParameters: {},
      pathParameters: {},
    });
    assert(res.statusCode === 400, `Expected 400, got ${res.statusCode}`);
    const body = JSON.parse(res.body);
    assert(body.error.includes("Missing"), "Expected missing field error");
  });

  await test("POST /sensors/anchor anchors a batch and returns 201", async () => {
    const res = await handler({
      httpMethod: "POST",
      path: "/sensors/anchor",
      body: JSON.stringify({
        batchId: "batch-001",
        deviceDID: "did:nge:sensor001",
        merkleRoot: "0x" + "aa".repeat(32),
        readingCount: 100,
        startTimestamp: 1700000000,
        endTimestamp: 1700003600,
      }),
      queryStringParameters: {},
      pathParameters: {},
    });
    assert(res.statusCode === 201, `Expected 201, got ${res.statusCode}`);
    const body = JSON.parse(res.body);
    assert(body.batchHash, "Expected batchHash");
    assert(body.merkleRoot, "Expected merkleRoot");
    assert(body.transactionHash, "Expected transactionHash");
  });

  await test("POST /sensors/anchor returns 400 when missing required fields", async () => {
    const res = await handler({
      httpMethod: "POST",
      path: "/sensors/anchor",
      body: JSON.stringify({ batchId: "batch-002" }),
      queryStringParameters: {},
      pathParameters: {},
    });
    assert(res.statusCode === 400, `Expected 400, got ${res.statusCode}`);
  });

  await test("POST /sensors/anchor returns 400 with empty body", async () => {
    const res = await handler({
      httpMethod: "POST",
      path: "/sensors/anchor",
      body: JSON.stringify({}),
      queryStringParameters: {},
      pathParameters: {},
    });
    assert(res.statusCode === 400, `Expected 400, got ${res.statusCode}`);
  });

  await test("GET /sensors/{deviceDID}/batches returns batches list", async () => {
    // Seed a batch in the mock store
    const { ethers } = require("ethers");
    const deviceHash = ethers.keccak256(ethers.toUtf8Bytes("did:nge:sensor001"));
    const batchHash = ethers.keccak256(ethers.toUtf8Bytes("batch-001"));
    await mockDynamo.putItem(mockConfig.SENSOR_TABLE, {
      pk: `DEVICE#${deviceHash}`,
      sk: `BATCH#${batchHash}`,
      batchId: "batch-001",
      batchHash,
      merkleRoot: "0x" + "aa".repeat(32),
    });

    const res = await handler({
      httpMethod: "GET",
      path: `/sensors/${deviceHash}/batches`,
      queryStringParameters: {},
      pathParameters: { deviceDID: deviceHash },
    });
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
    const body = JSON.parse(res.body);
    assert(body.count >= 1, `Expected at least 1 batch, got ${body.count}`);
  });

  await test("GET /unknown returns 404", async () => {
    const res = await handler({
      httpMethod: "GET",
      path: "/sensors/unknown/path",
      queryStringParameters: {},
      pathParameters: {},
    });
    assert(res.statusCode === 404, `Expected 404, got ${res.statusCode}`);
  });

  cleanup();
}

// ─────────────────────────────────────────────────────────
//  Tests: fhirApi.js
// ─────────────────────────────────────────────────────────

async function testFhirApi() {
  console.log("\nFHIR API (fhirApi.js)");

  const mockDynamo = createMockDynamo();
  const mockConfig = createMockConfig();
  const mockContracts = createMockContracts();
  const cleanup = installMocks(mockDynamo, mockConfig, mockContracts);
  const { handler } = loadHandler("../aws/lambda/fhirApi");

  await test("POST /fhir/credentials/verify returns verification with FHIR mock", async () => {
    const res = await handler({
      httpMethod: "POST",
      path: "/fhir/credentials/verify",
      body: JSON.stringify({
        npiNumber: "1234567890",
        firstName: "Jane",
        lastName: "Smith",
        qualificationCode: "RN",
        holderDID: "did:nge:nurse001",
        issuerDID: "did:nge:issuer001",
      }),
      pathParameters: {},
    });
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
    const body = JSON.parse(res.body);
    assert(body.verified === true, "Expected verified true (all fields match mock)");
    assert(body.verification.npiMatch === true, "Expected NPI match");
    assert(body.verification.nameMatch === true, "Expected name match");
    assert(body.verification.qualificationMatch === true, "Expected qualification match");
    assert(body.credential !== null, "Expected credential to be issued");
  });

  await test("POST /fhir/credentials/verify returns 400 when missing npiNumber", async () => {
    const res = await handler({
      httpMethod: "POST",
      path: "/fhir/credentials/verify",
      body: JSON.stringify({ holderDID: "did:nge:nurse002" }),
      pathParameters: {},
    });
    assert(res.statusCode === 400, `Expected 400, got ${res.statusCode}`);
    const body = JSON.parse(res.body);
    assert(body.error.includes("Missing"), "Expected missing field error");
  });

  await test("POST /fhir/credentials/verify returns not verified on name mismatch", async () => {
    const res = await handler({
      httpMethod: "POST",
      path: "/fhir/credentials/verify",
      body: JSON.stringify({
        npiNumber: "1234567890",
        firstName: "John",
        lastName: "Doe",
        qualificationCode: "RN",
        holderDID: "did:nge:nurse003",
        issuerDID: "did:nge:issuer001",
      }),
      pathParameters: {},
    });
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
    const body = JSON.parse(res.body);
    assert(body.verified === false, "Expected verified false (name mismatch)");
    assert(body.verification.nameMatch === false, "Expected name mismatch");
    assert(body.credential === null, "Expected no credential issued");
  });

  await test("POST /fhir/records/anchor anchors a FHIR bundle and returns 201", async () => {
    const res = await handler({
      httpMethod: "POST",
      path: "/fhir/records/anchor",
      body: JSON.stringify({
        fhirBundle: { resourceType: "Bundle", entry: [] },
        deviceDID: "did:nge:device001",
      }),
      pathParameters: {},
    });
    assert(res.statusCode === 201, `Expected 201, got ${res.statusCode}`);
    const body = JSON.parse(res.body);
    assert(body.bundleHash, "Expected bundleHash");
    assert(body.resourceType === "Bundle", "Expected resourceType Bundle");
  });

  await test("POST /fhir/records/anchor returns 400 when missing fhirBundle", async () => {
    const res = await handler({
      httpMethod: "POST",
      path: "/fhir/records/anchor",
      body: JSON.stringify({}),
      pathParameters: {},
    });
    assert(res.statusCode === 400, `Expected 400, got ${res.statusCode}`);
    const body = JSON.parse(res.body);
    assert(body.error.includes("Missing"), "Expected missing field error");
  });

  await test("GET /fhir/records/{hash}/verify returns 404 for unknown bundle", async () => {
    const res = await handler({
      httpMethod: "GET",
      path: "/fhir/records/0xunknown/verify",
      pathParameters: { hash: "0xunknown" },
    });
    assert(res.statusCode === 404, `Expected 404, got ${res.statusCode}`);
  });

  await test("GET /fhir/records/{hash}/verify returns verified for anchored bundle", async () => {
    // First anchor a bundle, then verify it
    const { ethers } = require("ethers");
    const fhirBundle = { resourceType: "Observation", entry: [{ data: "test" }] };
    const bundleHash = ethers.keccak256(
      ethers.toUtf8Bytes(JSON.stringify(fhirBundle))
    );
    await mockDynamo.putItem(mockConfig.CREDENTIAL_TABLE, {
      pk: `FHIR#${bundleHash}`,
      sk: "RECORD",
      bundleHash,
      resourceType: "Observation",
      anchoredAt: new Date().toISOString(),
    });

    const res = await handler({
      httpMethod: "GET",
      path: `/fhir/records/${bundleHash}/verify`,
      pathParameters: { hash: bundleHash },
    });
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
    const body = JSON.parse(res.body);
    assert(body.verified === true, "Expected verified true");
    assert(body.resourceType === "Observation", "Expected resourceType Observation");
  });

  await test("GET /unknown returns 404", async () => {
    const res = await handler({
      httpMethod: "GET",
      path: "/fhir/unknown",
      pathParameters: {},
    });
    assert(res.statusCode === 404, `Expected 404, got ${res.statusCode}`);
  });

  cleanup();
}

// ─────────────────────────────────────────────────────────
//  Tests: stateIdVerification.js
// ─────────────────────────────────────────────────────────

async function testStateIdVerification() {
  console.log("\nState ID Verification (stateIdVerification.js)");

  const mockDynamo = createMockDynamo();
  const mockConfig = createMockConfig();
  const mockContracts = createMockContracts();
  const cleanup = installMocks(mockDynamo, mockConfig, mockContracts);
  const { handler } = loadHandler("../aws/lambda/stateIdVerification");

  // Use a future date for expiration tests
  const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  await test("Valid Indiana ID passes validation and returns commitment", async () => {
    const res = await handler({
      issuingState: "IN",
      firstName: "John",
      lastName: "Doe",
      dateOfBirth: "1990-01-15",
      idNumber: "1234-56-7890",
      expirationDate: futureDate,
      documentType: "driversLicense",
      address: { street: "123 Main St", city: "Indianapolis", state: "IN", zip: "46201" },
      holderDID: "did:nge:john",
    });
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
    assert(res.valid === true, "Expected valid true");
    assert(res.commitment, "Expected commitment hash");
    assert(res.issuingAuthority === "Indiana Bureau of Motor Vehicles", "Expected IN BMV");
  });

  await test("Indiana ID with invalid format returns 400", async () => {
    const res = await handler({
      issuingState: "IN",
      firstName: "John",
      lastName: "Doe",
      dateOfBirth: "1990-01-15",
      idNumber: "INVALID-FORMAT",
      expirationDate: futureDate,
      documentType: "driversLicense",
      address: { street: "123 Main St", city: "Indianapolis", state: "IN", zip: "46201" },
      holderDID: "did:nge:john",
    });
    assert(res.statusCode === 400, `Expected 400, got ${res.statusCode}`);
    assert(res.valid === false, "Expected valid false");
    assert(res.errors.length > 0, "Expected validation errors");
  });

  await test("Missing required fields returns 400", async () => {
    const res = await handler({
      issuingState: "IN",
      firstName: "John",
    });
    assert(res.statusCode === 400, `Expected 400, got ${res.statusCode}`);
    assert(res.valid === false, "Expected valid false");
    assert(res.error.includes("Missing required fields"), "Expected missing fields error");
  });

  await test("Ohio ID with valid format passes validation", async () => {
    const res = await handler({
      issuingState: "OH",
      firstName: "Jane",
      lastName: "Smith",
      dateOfBirth: "1985-05-20",
      idNumber: "AB123456",
      expirationDate: futureDate,
      documentType: "driversLicense",
      address: { street: "456 Oak Ave", city: "Columbus", state: "OH", zip: "43215" },
      holderDID: "did:nge:jane",
    });
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
    assert(res.valid === true, "Expected valid true");
    assert(res.issuingAuthority === "Ohio Bureau of Motor Vehicles", "Expected OH BMV");
  });

  await test("Ohio ID with Indiana format fails validation", async () => {
    const res = await handler({
      issuingState: "OH",
      firstName: "Jane",
      lastName: "Smith",
      dateOfBirth: "1985-05-20",
      idNumber: "1234-56-7890",
      expirationDate: futureDate,
      documentType: "driversLicense",
      address: { street: "456 Oak Ave", city: "Columbus", state: "OH", zip: "43215" },
      holderDID: "did:nge:jane",
    });
    assert(res.statusCode === 400, `Expected 400, got ${res.statusCode}`);
    assert(res.valid === false, "Expected valid false");
  });

  await test("Commitment hash is deterministic for same input", async () => {
    const { ethers } = require("ethers");
    const data = {
      firstName: "John",
      lastName: "Doe",
      dateOfBirth: "1990-01-15",
      idNumber: "1234-56-7890",
      issuingState: "IN",
    };
    const salt = "0xdeadbeef";
    const commitmentInput = [
      data.firstName.toLowerCase(),
      data.lastName.toLowerCase(),
      data.dateOfBirth,
      data.idNumber,
      data.issuingState,
      salt,
    ].join("|");
    const hash1 = ethers.keccak256(ethers.toUtf8Bytes(commitmentInput));
    const hash2 = ethers.keccak256(ethers.toUtf8Bytes(commitmentInput));
    assert(hash1 === hash2, "Expected deterministic commitment hash");
    assert(hash1.startsWith("0x"), "Expected hash to start with 0x");
    assert(hash1.length === 66, `Expected hash length 66, got ${hash1.length}`);
  });

  await test("Unknown state falls back to GENERIC schema", async () => {
    const res = await handler({
      issuingState: "CA",
      firstName: "Bob",
      lastName: "Jones",
      dateOfBirth: "1992-03-10",
      idNumber: "CA-12345",
      expirationDate: futureDate,
      documentType: "driversLicense",
      holderDID: "did:nge:bob",
    });
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
    assert(res.valid === true, "Expected valid true with generic schema");
    assert(res.issuingAuthority === "State Motor Vehicle Agency", "Expected generic authority");
  });

  await test("Invalid document type for Indiana fails", async () => {
    const res = await handler({
      issuingState: "IN",
      firstName: "John",
      lastName: "Doe",
      dateOfBirth: "1990-01-15",
      idNumber: "1234-56-7890",
      expirationDate: futureDate,
      documentType: "passport",
      address: { street: "123 Main St", city: "Indianapolis", state: "IN", zip: "46201" },
      holderDID: "did:nge:john",
    });
    assert(res.statusCode === 400, `Expected 400, got ${res.statusCode}`);
    assert(res.valid === false, "Expected valid false");
    const hasDocTypeError = res.errors.some((e) => e.includes("documentType"));
    assert(hasDocTypeError, "Expected documentType error");
  });

  cleanup();
}

// ─────────────────────────────────────────────────────────
//  Main
// ─────────────────────────────────────────────────────────

async function main() {
  console.log("NGE Identity — Test Suite\n");

  await testIdentityApi();
  await testCredentialApi();
  await testMarketplaceApi();
  await testSensorApi();
  await testFhirApi();
  await testStateIdVerification();

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
