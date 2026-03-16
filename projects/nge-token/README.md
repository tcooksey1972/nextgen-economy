# NGE Token — ERC-20 Platform Token

The NGE platform token powering governance, payments, and staking across the [NextGen Economy](https://github.com/tcooksey1972/nextgen-economy) ecosystem. Built on OpenZeppelin v5.x with sentinel security hooks. Part of Cloud Creations LLC.

## What This Does

**NGEToken** — Abstract ERC-20 token with burn, pause, gasless approvals (EIP-2612), and governance voting (ERC20Votes). Uses virtual hooks for access control — same composable pattern as [nge-sentinel](../nge-sentinel/) and [nge-iot](../nge-iot/).

**SimpleNGEToken** — Standalone deployment with Ownable access control. Owner can mint, pause, and manage the supply cap. No sentinel dependency.

**SentinelNGEToken** — Demonstrates sentinel security hook integration with a configurable transfer limit (rate limiter pattern) and large transfer detection (watchdog pattern). In production, swap for actual nge-sentinel modules.

## Project Structure

```
projects/nge-token/
├── contracts/
│   ├── token/
│   │   └── NGEToken.sol              # Abstract ERC-20 with sentinel hooks
│   ├── interfaces/
│   │   └── INGEToken.sol             # Token interface, events, errors
│   └── examples/
│       ├── SimpleNGEToken.sol        # Token + Ownable (standalone)
│       └── SentinelNGEToken.sol      # Token + transfer limits (sentinel demo)
├── test/
│   └── NGEToken.test.js              # Hardhat tests (50+ tests)
├── scripts/
│   ├── compile.js                    # Offline compiler (no network needed)
│   └── test.js                       # Standalone test runner
├── aws/
│   ├── lambda/
│   │   ├── getBalance.js             # Balance + voting power query
│   │   ├── getTransfers.js           # Transfer history query
│   │   ├── getTokenInfo.js           # Token metadata + supply info
│   │   └── processTransferEvent.js   # Event poller → DynamoDB cache
│   └── cloudformation/
│       └── token-api.yaml            # Full stack deployment template
├── hardhat.config.js
└── package.json
```

## Quick Start

### Prerequisites

- Node.js >= 18
- npm

### Install and Compile

```bash
cd projects/nge-token
npm install
npm run compile:local    # Uses bundled solcjs (no network required)
```

### Run Tests

```bash
# Option 1: Standalone runner (requires a local node)
npx hardhat node &       # Start in background
npm run test:local       # 30+ tests, 0 failing

# Option 2: Hardhat test runner (requires solc download)
npm test
```

## Smart Contracts

### NGEToken (Abstract)

ERC-20 token with OpenZeppelin extensions and sentinel-compatible hooks.

| Feature | Implementation |
|---------|---------------|
| Fungible token | ERC20 ("NextGen Economy", "NGE") |
| Burn | ERC20Burnable — holders burn their own tokens |
| Pause | ERC20Pausable — emergency stop on all transfers |
| Gasless approvals | ERC20Permit (EIP-2612) — approve via signature |
| Governance voting | ERC20Votes — delegation + checkpoints |
| Supply cap | Configurable max supply (0 = unlimited) |

### Token Functions

| Function | Access | Description |
|----------|--------|-------------|
| `mint(to, amount)` | Minter hook | Mints tokens up to supply cap |
| `burn(amount)` | Token holder | Burns caller's tokens |
| `burnFrom(account, amount)` | Approved spender | Burns with allowance |
| `pause()` | Pauser hook | Pauses all transfers |
| `unpause()` | Pauser hook | Unpauses |
| `setSupplyCap(newCap)` | Admin hook | Updates max supply (cannot go below totalSupply) |
| `delegate(delegatee)` | Token holder | Delegates voting power |
| `permit(owner, spender, value, deadline, v, r, s)` | Anyone | Gasless EIP-2612 approval |

### View Functions

| Function | Description |
|----------|-------------|
| `supplyCap()` | Maximum token supply (0 = unlimited) |
| `mintableSupply()` | Remaining tokens that can be minted |
| `getVotes(account)` | Current voting power |
| `delegates(account)` | Who the account delegates to |
| `nonces(owner)` | EIP-2612 nonce for permit |

### Composability — Virtual Hooks

Same pattern as nge-sentinel and nge-iot: virtual hooks instead of inheriting Ownable directly.

| Hook | Purpose |
|------|---------|
| `_authorizeMinter()` | Controls who can call `mint()` |
| `_authorizePauser()` | Controls who can call `pause()`/`unpause()` |
| `_authorizeAdmin()` | Controls who can call `setSupplyCap()` |
| `_beforeTokenTransfer(from, to, amount)` | Pre-transfer hook for sentinel modules |

### Example: SentinelNGEToken

Demonstrates sentinel hook wiring with a transfer limit and large transfer detection:

```solidity
contract SentinelNGEToken is Ownable, NGEToken {
    uint256 public transferLimit;
    uint256 public largeTransferThreshold;

    function _authorizeMinter() internal view override { _checkOwner(); }
    function _authorizePauser() internal view override { _checkOwner(); }
    function _authorizeAdmin() internal view override { _checkOwner(); }

    function _beforeTokenTransfer(address from, address to, uint256 amount)
        internal override
    {
        if (transferLimit > 0 && amount > transferLimit)
            revert TransferExceedsLimit(amount, transferLimit);
        if (largeTransferThreshold > 0 && amount >= largeTransferThreshold)
            emit LargeTransferDetected(from, to, amount);
    }
}
```

In production, replace the inline checks with actual nge-sentinel modules:

```solidity
contract ProductionNGEToken is Ownable, NGEToken, RateLimiter, WatchdogAlert {
    function _beforeTokenTransfer(address from, address to, uint256 amount)
        internal override
    {
        _enforceRateLimit(amount);
        _watchdogCheck(from, to, amount);
    }
}
```

## AWS Serverless API

The `aws/` directory provides a read-only API for querying token state.

### Architecture

```
Ethereum (Sepolia/Mainnet)
    │ Transfer events
    ▼
EventBridge (every 1 min)
    │
    ▼
processTransferEvent (Lambda)
    │
    ├──→ DynamoDB: Balances cache
    └──→ DynamoDB: Transfer history
                │
                ▼
        API Gateway (HTTP API)
            ├── GET /balance?address=0x...
            ├── GET /transfers?address=0x...
            └── GET /token-info
```

### API Endpoints

| Endpoint | Lambda | Description |
|----------|--------|-------------|
| `GET /balance?address=0x...` | getBalance | Token balance, voting power, delegate |
| `GET /transfers?address=0x...&limit=20` | getTransfers | Transfer history (paginated) |
| `GET /token-info` | getTokenInfo | Name, symbol, supply, cap, paused state |

### Deploy

**Without auth (standalone):**
```bash
aws cloudformation deploy \
  --template-file aws/cloudformation/token-api.yaml \
  --stack-name nge-token-dev \
  --parameter-overrides \
    Environment=dev \
    NotificationEmail=alerts@example.com \
  --capabilities CAPABILITY_NAMED_IAM
```

**With Cognito auth (recommended for multi-tenant):**
```bash
aws cloudformation deploy \
  --template-file aws/cloudformation/token-api.yaml \
  --stack-name nge-token-dev \
  --parameter-overrides \
    Environment=dev \
    NotificationEmail=alerts@example.com \
    CognitoUserPoolId=us-east-1_XXXXXXXXX \
    CognitoClientId=abc123def456 \
  --capabilities CAPABILITY_NAMED_IAM
```

When `CognitoUserPoolId` is provided, the stack creates a JWT authorizer and protects `/balance` and `/transfers` routes. `/token-info` remains public. See [nge-auth](../nge-auth/) for the Cognito stack.

### Authentication & Multi-Tenancy

When the JWT authorizer is enabled, `getBalance` and `getTransfers` handlers extract tenant context from JWT claims via `authMiddleware.extractTenantContext(event)` from [nge-auth](../nge-auth/). The `tenantId` is logged for audit and included in API responses.

| Endpoint | Auth (when enabled) | Reason |
|----------|---------------------|--------|
| `GET /balance` | JWT required | Tenant-scoped balance queries |
| `GET /transfers` | JWT required | Tenant-scoped transfer history |
| `GET /token-info` | Public | Token metadata is public information |

The `processTransferEvent` Lambda runs on a schedule (not via API Gateway) and is unaffected by auth.

### Environment Variables

| Variable | Lambda | Source |
|----------|--------|--------|
| `ETH_RPC_URL` | All | SSM Parameter `/nge/token/eth-rpc-url` |
| `CONTRACT_ADDRESS` | All | SSM Parameter `/nge/token/contract-address` |
| `BALANCES_TABLE` | getBalance, processEvents | CloudFormation output |
| `TRANSFERS_TABLE` | getTransfers, processEvents | CloudFormation output |
| `METADATA_TABLE` | processEvents | CloudFormation output |

## AWS Cost Estimation (Free Tier Target)

This stack is designed to run within the [AWS Free Tier](https://aws.amazon.com/free/). Estimates assume a **dev/prototype workload**: moderate transfer activity with dashboard queries.

### Usage Assumptions (Monthly)

| Metric | Estimate |
|--------|----------|
| Token transfers/day | ~100 |
| Event poller invocations | 43,200 (1/min) |
| API queries/month | ~10,000 |
| DynamoDB reads + writes | ~100,000 |

### Free Tier Limits vs. Our Usage

| Service | Free Tier | Our Usage | Status |
|---------|-----------|-----------|--------|
| **Lambda** | 1M requests + 400K GB-sec/mo | ~53K requests, ~7K GB-sec | **Well within free tier** |
| **DynamoDB** | 25 GB storage, 200M requests/mo | ~100K requests, < 100 MB | **Well within free tier** |
| **API Gateway** | 1M HTTP API calls/mo *(12-month)* | ~10K requests | **Well within free tier** |
| **EventBridge** | Free (schedules) | 1 schedule | **Free** |
| **SNS** | 1M publishes/mo | < 100 (errors only) | **Well within free tier** |
| **CloudWatch** | 5 GB logs/mo | < 500 MB | **Well within free tier** |

### Monthly Cost Summary

| Component | Estimated Cost |
|-----------|---------------|
| Lambda | $0.00 |
| DynamoDB | $0.00 |
| API Gateway (HTTP API) | $0.00 |
| EventBridge | $0.00 |
| SNS | $0.00 |
| CloudWatch | $0.00 |
| **Total** | **$0.00/month** |

> No Secrets Manager needed — this stack is read-only (no signing keys).

### Cost Optimization Notes

- **Event poller batches** up to 1000 blocks per invocation. At Sepolia's ~12s block time, this catches up quickly after cold starts.
- **DynamoDB on-demand** (PAY_PER_REQUEST) avoids paying for idle provisioned capacity.
- **API Gateway HTTP API** (not REST) — 71% cheaper and free tier eligible.
- **Read-only Lambdas use 128 MB** (minimum practical). Only the event processor uses 256 MB.
- **Ethereum gas costs**: Zero for this stack — all operations are read-only view calls. Gas is only needed when deploying the token contract or calling write functions (mint, transfer, etc.) directly.

### AWS Pricing Sources

- [AWS Lambda Pricing](https://aws.amazon.com/lambda/pricing/)
- [Amazon DynamoDB Pricing](https://aws.amazon.com/dynamodb/pricing/)
- [Amazon API Gateway Pricing](https://aws.amazon.com/api-gateway/pricing/)
- [AWS Free Tier](https://aws.amazon.com/free/)

## Testing

50+ tests across two contracts:

- **SimpleNGEToken** (40 tests): deployment, minting, burning, pause/unpause, supply cap management, ERC-20 transfers, governance voting (delegation, checkpoints), EIP-2612 permit
- **SentinelNGEToken** (14 tests): transfer limit enforcement, large transfer detection, limit updates, integration with core token features

## Tech Stack

- **Solidity** 0.8.26 with OpenZeppelin v5.x (ERC20, ERC20Burnable, ERC20Pausable, ERC20Permit, ERC20Votes, Ownable)
- **Hardhat** for compilation and testing
- **AWS** Lambda, API Gateway, DynamoDB, EventBridge, CloudFormation
- **ethers.js** v6 for blockchain interaction

## License

MIT — Cloud Creations LLC
