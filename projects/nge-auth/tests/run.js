/**
 * @file run.js
 * @description Unit tests for nge-auth: authMiddleware and tenantScope.
 *
 * Uses only Node.js built-ins (assert) — no external test framework needed.
 * Run: node tests/run.js
 */

const assert = require("assert");

// ─── authMiddleware tests ───────────────────────────────────

const {
  extractTenantContext,
  requireAuth,
  requireAdmin,
} = require("../src/authMiddleware");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err.message}`);
  }
}

console.log("\nauthMiddleware");
console.log("─".repeat(50));

test("extractTenantContext — returns all claims from JWT v2 path", () => {
  const event = {
    requestContext: {
      authorizer: {
        jwt: {
          claims: {
            "custom:tenantId": "tenant-abc",
            email: "user@example.com",
            "custom:role": "admin",
            sub: "user-uuid-123",
          },
        },
      },
    },
  };
  const ctx = extractTenantContext(event);
  assert.strictEqual(ctx.tenantId, "tenant-abc");
  assert.strictEqual(ctx.email, "user@example.com");
  assert.strictEqual(ctx.role, "admin");
  assert.strictEqual(ctx.sub, "user-uuid-123");
  assert.strictEqual(ctx.authenticated, true);
});

test("extractTenantContext — returns claims from fallback authorizer.claims path", () => {
  const event = {
    requestContext: {
      authorizer: {
        claims: {
          "custom:tenantId": "tenant-xyz",
          email: "alt@example.com",
          "custom:role": "viewer",
          sub: "user-456",
        },
      },
    },
  };
  const ctx = extractTenantContext(event);
  assert.strictEqual(ctx.tenantId, "tenant-xyz");
  assert.strictEqual(ctx.authenticated, true);
});

test("extractTenantContext — returns unauthenticated for empty event", () => {
  const ctx = extractTenantContext({});
  assert.strictEqual(ctx.tenantId, null);
  assert.strictEqual(ctx.email, null);
  assert.strictEqual(ctx.role, "viewer");
  assert.strictEqual(ctx.sub, null);
  assert.strictEqual(ctx.authenticated, false);
});

test("extractTenantContext — returns unauthenticated when tenantId missing", () => {
  const event = {
    requestContext: {
      authorizer: { jwt: { claims: { sub: "user-1" } } },
    },
  };
  const ctx = extractTenantContext(event);
  assert.strictEqual(ctx.authenticated, false);
});

test("extractTenantContext — defaults role to viewer", () => {
  const event = {
    requestContext: {
      authorizer: {
        jwt: {
          claims: {
            "custom:tenantId": "t1",
            sub: "u1",
          },
        },
      },
    },
  };
  const ctx = extractTenantContext(event);
  assert.strictEqual(ctx.role, "viewer");
});

test("requireAuth — returns context when authenticated", () => {
  const event = {
    requestContext: {
      authorizer: {
        jwt: {
          claims: {
            "custom:tenantId": "t1",
            email: "a@b.com",
            "custom:role": "admin",
            sub: "u1",
          },
        },
      },
    },
  };
  const result = requireAuth(event);
  assert.strictEqual(result.error, undefined);
  assert.strictEqual(result.tenantId, "t1");
});

test("requireAuth — returns 401 when unauthenticated", () => {
  const result = requireAuth({});
  assert.ok(result.error);
  assert.strictEqual(result.error.statusCode, 401);
  const body = JSON.parse(result.error.body);
  assert.ok(body.error.includes("Unauthorized"));
});

test("requireAdmin — returns context for admin role", () => {
  const event = {
    requestContext: {
      authorizer: {
        jwt: {
          claims: {
            "custom:tenantId": "t1",
            email: "admin@b.com",
            "custom:role": "admin",
            sub: "u1",
          },
        },
      },
    },
  };
  const result = requireAdmin(event);
  assert.strictEqual(result.error, undefined);
  assert.strictEqual(result.role, "admin");
});

test("requireAdmin — returns 403 for non-admin", () => {
  const event = {
    requestContext: {
      authorizer: {
        jwt: {
          claims: {
            "custom:tenantId": "t1",
            email: "user@b.com",
            "custom:role": "viewer",
            sub: "u1",
          },
        },
      },
    },
  };
  const result = requireAdmin(event);
  assert.ok(result.error);
  assert.strictEqual(result.error.statusCode, 403);
  const body = JSON.parse(result.error.body);
  assert.ok(body.error.includes("Admin"));
});

test("requireAdmin — returns 401 if not authenticated at all", () => {
  const result = requireAdmin({});
  assert.ok(result.error);
  assert.strictEqual(result.error.statusCode, 401);
});

// ─── tenantScope tests ──────────────────────────────────────

console.log("\ntenantScope");
console.log("─".repeat(50));

// Mock the DynamoDB client
class MockDynamoDBClient {
  constructor() {
    this.lastCommand = null;
    this.mockResponse = {};
  }

  async send(command) {
    this.lastCommand = command;
    return this.mockResponse;
  }
}

const { scopedPutItem, scopedGetItem, scopedQuery } = require("../src/tenantScope");

test("scopedPutItem — injects tenantId into item", async () => {
  const client = new MockDynamoDBClient();
  await scopedPutItem(client, "TestTable", "tenant-1", {
    pk: { S: "device#1" },
    name: { S: "Sensor" },
  });
  const params = client.lastCommand.input;
  assert.strictEqual(params.TableName, "TestTable");
  assert.strictEqual(params.Item.tenantId.S, "tenant-1");
  assert.strictEqual(params.Item.pk.S, "device#1");
  assert.strictEqual(params.Item.name.S, "Sensor");
});

test("scopedGetItem — returns item when tenant matches", async () => {
  const client = new MockDynamoDBClient();
  client.mockResponse = {
    Item: {
      pk: { S: "device#1" },
      tenantId: { S: "tenant-1" },
    },
  };
  const result = await scopedGetItem(client, "TestTable", { pk: { S: "device#1" } }, "tenant-1");
  assert.ok(result);
  assert.strictEqual(result.tenantId.S, "tenant-1");
});

test("scopedGetItem — returns null when tenant does not match", async () => {
  const client = new MockDynamoDBClient();
  client.mockResponse = {
    Item: {
      pk: { S: "device#1" },
      tenantId: { S: "tenant-OTHER" },
    },
  };
  const result = await scopedGetItem(client, "TestTable", { pk: { S: "device#1" } }, "tenant-1");
  assert.strictEqual(result, null);
});

test("scopedGetItem — returns null when item not found", async () => {
  const client = new MockDynamoDBClient();
  client.mockResponse = {};
  const result = await scopedGetItem(client, "TestTable", { pk: { S: "device#1" } }, "tenant-1");
  assert.strictEqual(result, null);
});

test("scopedQuery — adds tenantId filter to query", async () => {
  const client = new MockDynamoDBClient();
  client.mockResponse = {
    Items: [{ pk: { S: "d1" }, tenantId: { S: "t1" } }],
  };
  const params = {
    TableName: "TestTable",
    KeyConditionExpression: "pk = :pk",
    ExpressionAttributeValues: { ":pk": { S: "device#1" } },
  };
  const items = await scopedQuery(client, params, "t1");
  assert.ok(Array.isArray(items));
  assert.strictEqual(items.length, 1);

  const sent = client.lastCommand.input;
  assert.strictEqual(sent.FilterExpression, "tenantId = :_tenantId");
  assert.strictEqual(sent.ExpressionAttributeValues[":_tenantId"].S, "t1");
  // Original values preserved
  assert.strictEqual(sent.ExpressionAttributeValues[":pk"].S, "device#1");
});

test("scopedQuery — appends to existing filter expression", async () => {
  const client = new MockDynamoDBClient();
  client.mockResponse = { Items: [] };
  const params = {
    TableName: "TestTable",
    KeyConditionExpression: "pk = :pk",
    FilterExpression: "status = :s",
    ExpressionAttributeValues: {
      ":pk": { S: "device#1" },
      ":s": { S: "active" },
    },
  };
  await scopedQuery(client, params, "t2");

  const sent = client.lastCommand.input;
  assert.strictEqual(sent.FilterExpression, "(status = :s) AND tenantId = :_tenantId");
  assert.strictEqual(sent.ExpressionAttributeValues[":_tenantId"].S, "t2");
  assert.strictEqual(sent.ExpressionAttributeValues[":s"].S, "active");
});

test("scopedQuery — returns empty array when no items", async () => {
  const client = new MockDynamoDBClient();
  client.mockResponse = {};
  const items = await scopedQuery(client, { TableName: "T", KeyConditionExpression: "pk = :pk", ExpressionAttributeValues: {} }, "t1");
  assert.ok(Array.isArray(items));
  assert.strictEqual(items.length, 0);
});

// ─── Summary ────────────────────────────────────────────────

console.log("\n" + "─".repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);

if (failed > 0) {
  process.exit(1);
}
