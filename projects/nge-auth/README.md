# NGE Auth — Authentication & Multi-Tenancy

Cognito-based authentication with tenant isolation for the [NextGen Economy](https://github.com/tcooksey1972/nextgen-economy) platform. Designed for the IoT Compliance-as-a-Service product ("AnchorProof"). Part of Cloud Creations LLC.

## What This Does

**Cognito User Pool** — User sign-up and sign-in with email verification. Issues JWT tokens containing tenant claims (`custom:tenantId`, `custom:tenantName`, `custom:role`). Integrated as a JWT authorizer with the IoT and Token API Gateways.

**Tenant Auto-Provisioning** — A post-confirmation Lambda trigger creates a new tenant record in DynamoDB when a user signs up without an existing `tenantId`. The user becomes the tenant admin with a "starter" plan (10 devices, 10K anchors/month).

**Auth Middleware** — Lambda middleware that extracts tenant context from Cognito JWT claims in API Gateway events. Provides `requireAuth()`, `requireAdmin()`, and `extractTenantContext()` helpers for downstream handlers.

**Tenant Scope Helpers** — DynamoDB utility functions (`scopedPutItem`, `scopedGetItem`, `scopedQuery`) that automatically inject `tenantId` into writes and filter reads by tenant. Prevents cross-tenant data leakage.

## Project Structure

```
projects/nge-auth/
├── aws/
│   └── cloudformation/
│       └── cognito-auth.yaml           # Cognito User Pool, client, tenant table, post-confirm Lambda
└── src/
    ├── authMiddleware.js               # JWT claim extraction for Lambda handlers
    └── tenantScope.js                  # Tenant-scoped DynamoDB helpers
```

## Architecture

```
Frontend (React)
    │
    │  Sign up / Sign in
    ▼
Cognito User Pool
    │  JWT (id_token with custom:tenantId)
    ▼
API Gateway (HTTP API)
    │  JWT Authorizer validates token
    ▼
Lambda Handler
    │  authMiddleware.extractTenantContext(event)
    │  → { tenantId, email, role, sub }
    ▼
DynamoDB (tenant-scoped queries)
    │  tenantScope.scopedQuery(client, params, tenantId)
    ▼
Response (includes tenantId for traceability)
```

## Integration with Other Stacks

The Cognito authorizer is wired into the IoT and Token API CloudFormation templates via optional parameters:

| Stack | Template | Parameters |
|-------|----------|------------|
| IoT Bridge | `nge-iot/aws/cloudformation/iot-blockchain-bridge.yaml` | `CognitoUserPoolId`, `CognitoClientId` |
| Token API | `nge-token/aws/cloudformation/token-api.yaml` | `CognitoUserPoolId`, `CognitoClientId` |

When these parameters are provided, the stacks create a `AWS::ApiGatewayV2::Authorizer` (JWT type) and protect applicable routes. When omitted, stacks deploy without auth (backwards-compatible).

### Which Routes Are Authenticated?

| Stack | Route | Auth | Reason |
|-------|-------|------|--------|
| Token API | `GET /balance` | JWT (when enabled) | Tenant-scoped balance queries |
| Token API | `GET /transfers` | JWT (when enabled) | Tenant-scoped transfer history |
| Token API | `GET /token-info` | Public | Token metadata is public information |
| IoT Bridge | `GET /verify` | Public | Shareable verification links |

### How tenantId Flows Through the System

**API Gateway → Lambda (JWT path):**
Handlers call `extractTenantContext(event)` to get `{ tenantId, email, role }` from the JWT claims injected by the API Gateway authorizer.

**IoT Core → Lambda (MQTT path):**
IoT-Rule-triggered handlers receive `tenantId` from the MQTT payload (device registration) or resolve it from the device DynamoDB record (data anchoring). The tenantId is persisted alongside device and anchor records.

## Auth Middleware API

```javascript
const { extractTenantContext, requireAuth, requireAdmin } = require("nge-auth/authMiddleware");

// Extract context (does not reject unauthenticated requests)
const ctx = extractTenantContext(event);
// → { tenantId, email, role, sub, authenticated }

// Require authentication (returns 401 error response if not authenticated)
const auth = requireAuth(event);
if (auth.error) return auth.error;
// → { tenantId, email, role, sub }

// Require admin role (returns 403 if not admin)
const admin = requireAdmin(event);
if (admin.error) return admin.error;
```

## Tenant Scope API

```javascript
const { scopedPutItem, scopedGetItem, scopedQuery } = require("nge-auth/tenantScope");

// Write with automatic tenantId injection
await scopedPutItem(dynamodb, "MyTable", tenantId, {
  pk: { S: "device#123" },
  name: { S: "Sensor A" },
});

// Read with tenant validation (returns null if wrong tenant)
const item = await scopedGetItem(dynamodb, "MyTable", key, tenantId);

// Query with automatic tenantId filter
const items = await scopedQuery(dynamodb, {
  TableName: "MyTable",
  IndexName: "deviceId-index",
  KeyConditionExpression: "deviceId = :d",
  ExpressionAttributeValues: { ":d": { N: "123" } },
}, tenantId);
```

## Deploy

### Prerequisites

Deploy the Cognito auth stack first, then pass its outputs to the IoT and Token stacks.

### Step 1: Deploy Cognito Stack

```bash
aws cloudformation deploy \
  --template-file projects/nge-auth/aws/cloudformation/cognito-auth.yaml \
  --stack-name nge-auth-dev \
  --parameter-overrides \
    Environment=dev \
    CallbackUrl=http://localhost:3000 \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

### Step 2: Capture Outputs

```bash
USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name nge-auth-dev \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text)

CLIENT_ID=$(aws cloudformation describe-stacks --stack-name nge-auth-dev \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolClientId'].OutputValue" --output text)

echo "User Pool ID: $USER_POOL_ID"
echo "Client ID:    $CLIENT_ID"
```

### Step 3: Deploy Dependent Stacks with Auth

```bash
# IoT Bridge with auth
aws cloudformation deploy \
  --template-file projects/nge-iot/aws/cloudformation/iot-blockchain-bridge.yaml \
  --stack-name nge-iot-bridge-dev \
  --parameter-overrides \
    Environment=dev \
    SignerSecretArn=$SIGNER_ARN \
    NotificationEmail=ops@example.com \
    CognitoUserPoolId=$USER_POOL_ID \
    CognitoClientId=$CLIENT_ID \
  --capabilities CAPABILITY_NAMED_IAM

# Token API with auth
aws cloudformation deploy \
  --template-file projects/nge-token/aws/cloudformation/token-api.yaml \
  --stack-name nge-token-api-dev \
  --parameter-overrides \
    Environment=dev \
    NotificationEmail=ops@example.com \
    CognitoUserPoolId=$USER_POOL_ID \
    CognitoClientId=$CLIENT_ID \
  --capabilities CAPABILITY_NAMED_IAM
```

## Cognito User Attributes

| Attribute | Type | Description |
|-----------|------|-------------|
| `email` | Built-in | User's email (used as username) |
| `custom:tenantId` | Custom | Tenant identifier (auto-assigned on sign-up) |
| `custom:tenantName` | Custom | Organization name |
| `custom:role` | Custom | Role within tenant (`admin`, `viewer`) |

## Tenant Table Schema

| Attribute | Type | Description |
|-----------|------|-------------|
| `tenantId` | String (PK) | UUID prefix (8 chars) |
| `name` | String | Organization name |
| `plan` | String | `starter`, `pro`, `enterprise` |
| `deviceLimit` | Number | Max registered devices |
| `anchorsPerMonth` | Number | Max data anchors per month |
| `ownerEmail` | String | Tenant creator's email |
| `createdAt` | String | ISO timestamp |

## AWS Cost

| Service | Free Tier | Our Usage | Cost |
|---------|-----------|-----------|------|
| Cognito | 50K MAU (always free) | < 100 users | $0.00 |
| DynamoDB | 25 GB, 200M req/mo | < 1K req/mo | $0.00 |
| Lambda (post-confirm) | 1M req/mo | < 100/mo | $0.00 |
| **Total** | | | **$0.00/mo** |

## License

MIT — Cloud Creations LLC
