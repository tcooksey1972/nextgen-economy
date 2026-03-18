# NGE Token API

Serverless backend for NGE token operations and governance. Indexes on-chain events into DynamoDB and serves a REST API for the [nge-frontend](../nge-frontend/) dashboard.

## Architecture

```
[Sepolia Blockchain]
    ↓ (poll events)
[tokenEventPoller]  →  [TokenEvents DynamoDB]  →  [apiHandler]  →  [API Gateway]  →  [Frontend]
[governancePoller]  →  [GovernanceData DynamoDB] ↗                                      ↓
                                                                          (also reads on-chain
                                                                           as fallback / for writes)
```

### Lambda Functions

| Function | Schedule | Purpose |
|----------|----------|---------|
| `tokenEventPoller` | Every 1 minute | Indexes `Transfer`, `DelegateChanged`, `DelegateVotesChanged` events into DynamoDB |
| `governancePoller` | Every 2 minutes | Indexes `ProposalCreated`, `VoteCast`, `ProposalQueued/Executed/Canceled` events |
| `apiHandler` | On-demand (API Gateway) | Serves REST endpoints for the frontend |

### API Endpoints

| Endpoint | Method | Description | Params |
|----------|--------|-------------|--------|
| `/token-info` | GET | Token name, symbol, supply, cap, paused status | — |
| `/balance` | GET | Balance, voting power, delegate for an address | `address` (required) |
| `/transfers` | GET | Transfer history for an address (from DynamoDB index) | `address` (required), `limit` |
| `/proposals` | GET | Governance proposals | `limit` |
| `/votes` | GET | Votes for a specific proposal | `proposalId` (required), `limit` |
| `/health` | GET | System health and last polled block | — |

All endpoints return JSON with CORS headers enabled.

### DynamoDB Tables

**TokenEvents** — Transfer and delegation event index
- Partition key: `TRANSFER#{address}` or `EVENT#{eventName}`
- Sort key: `{blockNumber}#{txHash}#{logIndex}`
- TTL: 90 days

**GovernanceData** — Proposal and vote index
- Partition key: `PROPOSAL` or `VOTE#{proposalId}`
- Sort key: proposal ID or voter address
- TTL: 90 days

## Prerequisites

- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
- Node.js 22.x (Lambda runtime)
- An Ethereum RPC endpoint (Alchemy or Infura free tier for Sepolia)
- Deployed NGE Token contract on Sepolia

## Setup

```bash
# Install dependencies
npm install

# Run tests (no AWS credentials needed)
npm test
```

## Deploy to AWS

```bash
# First-time guided deploy (prompts for parameters)
npm run deploy

# Subsequent deploys (uses saved config)
npm run deploy:stack
```

### Required Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `EthRpcUrl` | Alchemy/Infura Sepolia endpoint | `https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY` |
| `TokenAddress` | Deployed NGE Token contract | `0x1234...abcd` |
| `GovernorAddress` | Deployed NGE Governor contract (optional) | `0xabcd...1234` |
| `AlertEmail` | Email for governance SNS alerts | `admin@example.com` |

### After Deploy

The `sam deploy` output includes:
- **ApiUrl** — Use this as `REACT_APP_TOKEN_API` in the frontend `.env`
- **TokenEventsTableName** / **GovernanceTableName** — DynamoDB table names
- **GovernanceAlertTopicArn** — Confirm the SNS email subscription

## Frontend Integration

Set the API URL in the frontend `.env`:

```bash
REACT_APP_TOKEN_API=https://xxx.execute-api.us-east-1.amazonaws.com/prod
```

The frontend uses a **try-API-first, fall-back-to-blockchain** strategy:
- **Dashboard** — reads token info and balance from `/token-info` and `/balance`
- **Governance** — loads proposals from `/proposals`, enriches with live on-chain vote state
- **Token** — shows transfer history from `/transfers`

If `REACT_APP_TOKEN_API` is not set, all pages fall back to direct blockchain reads.

## Local Development

```bash
# Start local API (requires Docker for SAM)
npm run local:api
```

## Tests

```bash
npm test
# Runs 13 tests covering all API endpoints, config defaults, and error handling
```

Tests mock DynamoDB and contract calls — no AWS credentials or blockchain access needed.
