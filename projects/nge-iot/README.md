# NGE IoT — Blockchain-IoT Primitives

On-chain device identity (ERC-721) and tamper-proof sensor data anchoring for IoT systems. Part of the [NextGen Economy](https://github.com/tcooksey1972/nextgen-economy) platform by Cloud Creations LLC.

## What This Does

**DeviceRegistry** — Each IoT device is an NFT. Registering a device mints a token; transferring the token transfers ownership. Devices have a lifecycle (Active / Inactive / Suspended) and a firmware hash stored on-chain. Rich metadata (manufacturer, location, capabilities) lives off-chain via `tokenURI`.

**DataAnchor** — Devices (or their authorized relayers) submit keccak256 hashes of sensor readings on-chain. This proves data existed at a specific block and timestamp without storing raw data. Supports single and batch anchoring for gas efficiency.

Both contracts use virtual hooks for access control (same pattern as [nge-sentinel](../nge-sentinel/)), making them composable with Sentinel security modules (RateLimiter, WatchdogAlert, etc.).

## Project Structure

```
projects/nge-iot/
├── contracts/
│   ├── iot/
│   │   ├── DeviceRegistry.sol          # Abstract ERC-721 device identity
│   │   ├── DataAnchor.sol              # Abstract data hash anchoring
│   │   └── interfaces/
│   │       ├── IDeviceRegistry.sol     # Registry interface, events, errors
│   │       └── IDataAnchor.sol         # Anchor interface, events, errors
│   └── examples/
│       ├── SimpleDeviceRegistry.sol    # Registry + Ownable (standalone)
│       └── AnchoredDeviceRegistry.sol  # Registry + Anchor (combined)
├── test/
│   ├── DeviceRegistry.test.js          # Hardhat tests for registry
│   └── DataAnchor.test.js              # Hardhat tests for anchor + integration
├── scripts/
│   ├── compile.js                      # Offline compiler (no network needed)
│   └── test.js                         # Standalone test runner (43 tests)
├── aws/
│   ├── lambda/
│   │   ├── registerDevice.js           # IoT Thing → on-chain registration
│   │   ├── anchorData.js               # Sensor data → on-chain hash anchor
│   │   └── verifyAnchor.js             # API Gateway → anchor verification
│   ├── iot-rules/
│   │   ├── device-registration-rule.json
│   │   ├── data-anchor-rule.json
│   │   └── batch-anchor-rule.json
│   └── cloudformation/
│       └── iot-blockchain-bridge.yaml  # Full stack deployment template
├── hardhat.config.js
└── package.json
```

## Quick Start

### Prerequisites

- Node.js >= 18
- npm

### Install and Compile

```bash
cd projects/nge-iot
npm install
npm run compile:local    # Uses bundled solcjs (no network required)
```

### Run Tests

```bash
# Option 1: Standalone runner (requires a local node)
npx hardhat node &       # Start in background
npm run test:local       # 43 tests, 0 failing

# Option 2: Hardhat test runner (requires solc download)
npm test
```

## Smart Contracts

### DeviceRegistry

ERC-721 contract where each token represents a physical IoT device.

| Function | Access | Description |
|----------|--------|-------------|
| `registerDevice(owner, fwHash, uri)` | Admin | Mints device NFT, sets status to Active |
| `deactivateDevice(deviceId)` | Device owner | Sets status to Inactive |
| `reactivateDevice(deviceId)` | Admin | Restores Inactive/Suspended → Active |
| `suspendDevice(deviceId)` | Admin | Marks device as compromised |
| `updateFirmware(deviceId, newHash)` | Admin | Updates on-chain firmware hash |

**On-chain storage per device:** status (uint8) + firmware hash (bytes32). Everything else is in `tokenURI`.

**Device lifecycle:**

```
                ┌─── deactivateDevice() ───→ Inactive
                │                               │
Register ──→ Active ←── reactivateDevice() ─────┤
                │                               │
                └─── suspendDevice() ────→ Suspended
```

### DataAnchor

Stores keccak256 hashes as tamper-proof timestamps.

| Function | Access | Description |
|----------|--------|-------------|
| `anchorData(deviceId, dataHash)` | Authorized submitter | Anchors a single hash |
| `anchorBatch(deviceId, dataHashes[])` | Authorized submitter | Anchors array as one root |
| `isAnchored(dataHash)` | Public (view) | Check if a hash exists |
| `getAnchor(dataHash)` | Public (view) | Get deviceId, timestamp, blockNumber |
| `deviceAnchorCount(deviceId)` | Public (view) | Total anchors for a device |
| `deviceNonce(deviceId)` | Public (view) | Current nonce (replay protection) |

**Batch anchoring** computes `keccak256(abi.encodePacked(dataHashes))` as a single root, storing one record regardless of batch size. Individual hashes can be verified off-chain against the root.

### Composability — Virtual Hooks

Both contracts use the same pattern as nge-sentinel: virtual hooks instead of inheriting Ownable directly. This avoids diamond inheritance conflicts when combining modules.

| Contract | Hook | Purpose |
|----------|------|---------|
| DeviceRegistry | `_authorizeRegistryAdmin()` | Controls who can register/suspend/update |
| DeviceRegistry | `_beforeDeviceTransfer(deviceId)` | Pre-transfer hook (e.g., rate limiting) |
| DataAnchor | `_authorizeAnchorSubmitter(deviceId)` | Controls who can submit data |
| DataAnchor | `_onDataAnchored(deviceId, dataHash)` | Post-anchor hook (e.g., watchdog alerts) |

### Example: AnchoredDeviceRegistry

Combines both contracts with Ownable. Only active device NFT owners can submit data:

```solidity
contract AnchoredDeviceRegistry is Ownable, DeviceRegistry, DataAnchor {
    constructor() Ownable(msg.sender) DeviceRegistry() {}

    function _authorizeRegistryAdmin() internal view override {
        _checkOwner();
    }

    function _authorizeAnchorSubmitter(uint256 deviceId) internal view override {
        if (!_isDeviceActive(deviceId)) revert DeviceNotActive(deviceId);
        if (ownerOf(deviceId) != msg.sender) revert NotDeviceOwner(deviceId, msg.sender);
    }
}
```

## AWS IoT Integration

The `aws/` directory bridges AWS IoT Core with the on-chain contracts.

### Architecture

```
IoT Device
  │
  │  MQTT
  ▼
AWS IoT Core ──→ IoT Rules Engine
                    │
          ┌─────────┼─────────┐
          ▼         ▼         ▼
   registerDevice  anchorData  anchorBatch
     (Lambda)      (Lambda)    (Lambda)
          │         │         │
          ▼         ▼         ▼
   DeviceRegistry    DataAnchor
   (Blockchain)     (Blockchain)
          │         │
          ▼         ▼
       DynamoDB (off-chain index)
                    │
                    ▼
            API Gateway ──→ verifyAnchor (Lambda)
                              │
                              ▼
                         Client / App
```

### MQTT Topics

| Topic | Direction | Purpose |
|-------|-----------|---------|
| `nge/devices/register` | Device → Cloud | Trigger device registration |
| `nge/devices/{thingName}/data` | Device → Cloud | Single sensor reading |
| `nge/devices/{thingName}/data/batch` | Device → Cloud | Batch sensor readings |
| `nge/devices/{thingName}/commands` | Cloud → Device | Commands to device |

### Lambda Handlers

**registerDevice.js** — Creates an AWS IoT Thing and calls `DeviceRegistry.registerDevice()` on-chain. Stores the Thing-to-deviceId mapping in DynamoDB.

**anchorData.js** — Hashes incoming sensor payloads (canonical JSON → keccak256) and calls `anchorData()` or `anchorBatch()` on-chain. Stores anchor records in DynamoDB for fast off-chain queries.

**verifyAnchor.js** — API Gateway endpoint (`GET /verify?dataHash=0x...`). Checks DynamoDB first (fast path), then verifies on-chain (trustless path). Supports raw payload verification via `?payload={...}`.

### Deploy

The CloudFormation template (`aws/cloudformation/iot-blockchain-bridge.yaml`) deploys the full stack:

- DynamoDB tables (devices + anchors)
- Lambda functions (register, anchor, verify)
- IoT Rules (MQTT → Lambda routing)
- API Gateway (verification endpoint)
- JWT authorizer (Cognito, optional)
- IoT Thing Type and Policy
- IAM roles (least-privilege)
- SNS error notifications + SQS dead letter queue

**Without auth (standalone):**
```bash
aws cloudformation deploy \
  --template-file aws/cloudformation/iot-blockchain-bridge.yaml \
  --stack-name nge-iot-dev \
  --parameter-overrides \
    Environment=dev \
    SignerSecretArn=arn:aws:secretsmanager:us-east-1:123456789:secret:nge-iot-signer \
    NotificationEmail=alerts@example.com \
  --capabilities CAPABILITY_NAMED_IAM
```

**With Cognito auth (recommended for multi-tenant):**
```bash
aws cloudformation deploy \
  --template-file aws/cloudformation/iot-blockchain-bridge.yaml \
  --stack-name nge-iot-dev \
  --parameter-overrides \
    Environment=dev \
    SignerSecretArn=arn:aws:secretsmanager:us-east-1:123456789:secret:nge-iot-signer \
    NotificationEmail=alerts@example.com \
    CognitoUserPoolId=us-east-1_XXXXXXXXX \
    CognitoClientId=abc123def456 \
  --capabilities CAPABILITY_NAMED_IAM
```

When `CognitoUserPoolId` is provided, the stack creates a JWT authorizer on the API Gateway. The `/verify` endpoint remains public (shareable verification links). See [nge-auth](../nge-auth/) for the Cognito stack that provides these values.

### Authentication & Multi-Tenancy

All DynamoDB records (devices and anchors) include a `tenantId` field for multi-tenant isolation.

**How tenantId flows:**

| Path | Source of tenantId | Description |
|------|--------------------|-------------|
| MQTT → `registerDevice` | MQTT payload `tenantId` field | Device registration requires tenantId in the message |
| MQTT → `anchorData` | Device DynamoDB record | Resolved from the device's stored tenantId |
| API → `verifyAnchor` | JWT claims (optional) | Logged for audit; endpoint is public |

The `nge/devices/register` IoT Rule SQL includes `tenantId` in its SELECT, so devices must publish their tenant association in the registration message.

Lambda handlers use `authMiddleware.extractTenantContext(event)` from [nge-auth](../nge-auth/) to read JWT claims when requests come through API Gateway.

### Environment Variables

| Variable | Lambda | Source |
|----------|--------|--------|
| `ETH_RPC_URL` | All | SSM Parameter `/nge/iot/eth-rpc-url` |
| `CONTRACT_ADDRESS` | All | SSM Parameter `/nge/iot/contract-address` |
| `SIGNER_PRIVATE_KEY` | register, anchor | Secrets Manager `nge-iot-signer` |
| `DYNAMODB_TABLE` | register, anchor | CloudFormation output |
| `ANCHORS_TABLE` | anchor, verify | CloudFormation output |

## AWS Cost Estimation (Free Tier Target)

This stack is designed to run within the [AWS Free Tier](https://aws.amazon.com/free/). The estimates below assume a **dev/prototype workload**: ~50 IoT devices, each reporting sensor data every 5 minutes, with moderate verification traffic.

### Usage Assumptions (Monthly)

| Metric | Estimate |
|--------|----------|
| Registered devices | 50 |
| Sensor readings per device/day | 288 (every 5 min) |
| Total MQTT messages/month | ~432,000 (50 x 288 x 30) |
| Batch anchoring frequency | Every 30 min (48 batches/device/day) |
| Lambda invocations/month | ~75,000 (anchoring + registration + verification) |
| DynamoDB reads + writes/month | ~150,000 |
| API Gateway requests/month | ~10,000 (verification queries) |
| SQS messages (DLQ, error cases) | < 1,000 |
| SNS notifications (errors only) | < 100 |

### Free Tier Limits vs. Our Usage

| Service | Free Tier (Always Free unless noted) | Our Usage | Status |
|---------|--------------------------------------|-----------|--------|
| **Lambda** | 1M requests + 400K GB-sec/month | ~75K requests, ~19K GB-sec (256 MB x 5s avg) | **Well within free tier** |
| **DynamoDB** | 25 GB storage, 25 RCU/25 WCU (on-demand: 200M requests) | ~150K requests, < 1 GB storage | **Well within free tier** |
| **API Gateway** | 1M HTTP API calls/month *(12-month free)* | ~10K requests | **Well within free tier** |
| **IoT Core** | $200 credit *(new accounts, 12-month)* | ~432K messages ($0.43), ~13M connect-min ($1.04), ~432K rules ($0.06) | **~$1.53/mo — covered by credits** |
| **SQS** | 1M requests/month | < 1K requests | **Well within free tier** |
| **SNS** | 1M publishes + 100K HTTP deliveries/month | < 100 publishes | **Well within free tier** |
| **CloudWatch** | 10 custom metrics, 5 GB log ingestion | ~3 Lambda log groups, < 1 GB logs | **Well within free tier** |
| **Secrets Manager** | $0.40/secret/month *(not free tier)* | 1 secret | **~$0.40/mo** |

### Monthly Cost Summary

| Component | Estimated Cost |
|-----------|---------------|
| Lambda | $0.00 |
| DynamoDB | $0.00 |
| API Gateway (HTTP API) | $0.00 |
| IoT Core (messaging + connectivity + rules) | $0.00 *(covered by $200 credit)* |
| SQS | $0.00 |
| SNS | $0.00 |
| CloudWatch Logs | $0.00 |
| Secrets Manager | $0.40 |
| **Total** | **~$0.40/month** |

### Cost Optimization Notes

- **Batch anchoring is critical.** Single-anchor mode costs more gas and triggers more Lambda invocations. The default 30-min batch window keeps Lambda invocations under 75K/month for 50 devices.
- **DynamoDB on-demand mode** (PAY_PER_REQUEST) avoids paying for provisioned capacity you don't use. Suitable for dev/prototype traffic patterns.
- **API Gateway HTTP APIs** are ~71% cheaper than REST APIs ($1.00/M vs $3.50/M) and included in the 12-month free tier.
- **IoT Core Basic Ingest** (`$aws/rules/{rule}/topic`) bypasses the message broker and skips messaging charges. Consider this for high-frequency devices.
- **Secrets Manager** is the only service without a free tier. Alternative: store the signer key in SSM Parameter Store SecureString (free) if you don't need automatic rotation.
- **CloudWatch** log retention defaults to never-expire. Set retention to 7-30 days in dev to avoid long-term storage costs.
- **Ethereum gas costs** (Sepolia testnet = free; mainnet = variable) are separate from AWS costs and depend on network conditions.

### When You'll Exceed Free Tier

| Scale Milestone | Trigger |
|-----------------|---------|
| > 200 devices at 5-min intervals | IoT Core messages exceed $200 credit (~1.7M msg/mo) |
| > 1M Lambda invocations/month | Shift from free to ~$0.20/M requests |
| > 1M API Gateway calls/month | HTTP API costs begin (~$1.00/M after free tier) |
| > 25 GB DynamoDB storage | Storage costs begin (~$0.25/GB/mo) |
| 12 months after account creation | IoT Core credits and API Gateway free tier expire |

### AWS Pricing Sources

- [AWS Lambda Pricing](https://aws.amazon.com/lambda/pricing/)
- [Amazon DynamoDB Pricing](https://aws.amazon.com/dynamodb/pricing/)
- [Amazon API Gateway Pricing](https://aws.amazon.com/api-gateway/pricing/)
- [AWS IoT Core Pricing](https://aws.amazon.com/iot-core/pricing/)
- [Amazon SQS Pricing](https://aws.amazon.com/sqs/pricing/)
- [Amazon SNS Pricing](https://aws.amazon.com/sns/pricing/)
- [AWS Free Tier](https://aws.amazon.com/free/)

> **Note:** Prices are for US East (N. Virginia). Free tier terms may change — verify on the [AWS Free Tier page](https://aws.amazon.com/free/) before deploying.

## Testing

43 tests covering:

- **DeviceRegistry** (24 tests): registration, lifecycle (deactivate/reactivate/suspend), firmware updates, ERC-721 transfers, enumeration, edge cases
- **DataAnchor** (12 tests): single anchor, batch anchor, verification, duplicate prevention, nonce tracking
- **Integration** (7 tests): active device enforcement, cross-device anchoring, full end-to-end lifecycle

## Tech Stack

- **Solidity** 0.8.26 with OpenZeppelin v5.x (ERC721Enumerable, ERC721URIStorage, Ownable)
- **Hardhat** for compilation and testing
- **AWS** Lambda, IoT Core, DynamoDB, API Gateway, CloudFormation
- **ethers.js** v6 for blockchain interaction

## License

MIT — Cloud Creations LLC
