# NGE Sentinel Monitor

AWS serverless monitoring backend for [NGE Sentinel](../nge-sentinel/) smart contracts. Polls on-chain events, stores in DynamoDB, sends email alerts via SNS, and serves a real-time dashboard.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  On-Chain (Sepolia)                                     │
│  FullSentinelVault                                      │
│    ├── DeadManSwitch  → HeartbeatReceived                │
│    ├── RateLimiter    → OutflowRecorded                  │
│    ├── BreakGlass     → EmergencyProposed/Executed        │
│    └── WatchdogAlert  → WatchdogAlerted                  │
└──────────────────┬──────────────────────────────────────┘
                   │ events (via Alchemy/Infura free tier)
┌──────────────────▼──────────────────────────────────────┐
│  AWS Free Tier                                          │
│                                                         │
│  EventBridge (cron)                                     │
│    ├── Event Poller (every 1 min)                       │
│    │     └── Reads events → DynamoDB + SNS alerts       │
│    └── Heartbeat Monitor (every 1 hour)                 │
│          └── Reads vault state → DynamoDB + SNS alerts  │
│                                                         │
│  API Gateway (REST)                                     │
│    ├── GET /status     → vault state snapshot           │
│    ├── GET /events     → recent contract events         │
│    ├── GET /proposals  → BreakGlass proposals           │
│    └── GET /health     → system health summary          │
│                                                         │
│  S3 + public website hosting                            │
│    └── Static dashboard (HTML/CSS/JS)                   │
└─────────────────────────────────────────────────────────┘
```

## AWS Free Tier Usage

| Service | Free Tier | Our Usage |
|---------|-----------|-----------|
| Lambda | 1M requests/mo | ~44K (poller + monitor + API) |
| API Gateway | 1M calls/mo (12mo) | Dashboard traffic |
| DynamoDB | 25 GB + 25 RCU/WCU | Event logs, state snapshots |
| S3 | 5 GB | Static frontend (~50 KB) |
| SNS | 1M publishes + 1K emails/mo | Alert notifications |
| EventBridge | Free | Cron triggers |

**Estimated cost: $0/month** for demo/MVP usage.

## Prerequisites

- [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) configured with credentials
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
- Node.js >= 18.x
- An Ethereum RPC endpoint (free tier):
  - [Alchemy](https://www.alchemy.com/) — 300M compute units/mo free
  - [Infura](https://www.infura.io/) — 100K requests/day free
- A deployed FullSentinelVault contract on Sepolia testnet

## Quick Start

### 1. Install Dependencies

```bash
cd projects/nge-sentinel-monitor
npm install
```

### 2. Run Tests

```bash
npm test
```

### 3. Deploy the Stack

```bash
# First time — guided deploy (prompts for parameters)
sam build && sam deploy --guided
```

You'll be prompted for:
- **EthRpcUrl**: Your Alchemy/Infura Sepolia endpoint
- **ContractAddress**: Your deployed FullSentinelVault address (0x...)
- **AlertEmail**: Email to receive alert notifications

After deploy, confirm the SNS subscription email that AWS sends.

### 4. Deploy the Dashboard

```bash
./scripts/deploy-frontend.sh
```

This uploads the frontend to S3 and injects the API Gateway URL.

### 5. View the Dashboard

The deploy script prints the S3 website URL. Open it in a browser.

## Project Structure

```
nge-sentinel-monitor/
  src/
    lambdas/
      eventPoller.js       — Polls blockchain events (every 1 min)
      heartbeatMonitor.js  — Checks heartbeat status (every 1 hour)
      apiHandler.js        — REST API for the dashboard
    lib/
      config.js            — Environment variable configuration
      contract.js          — Ethereum contract client (ethers.js v6)
      dynamo.js            — DynamoDB read/write helpers
      alerts.js            — SNS alert publisher
    abi/
      FullSentinelVault.json — Contract ABI (extracted from nge-sentinel)
  frontend/
    index.html             — Dashboard page
    css/style.css          — Dark theme styles
    js/app.js              — Dashboard client logic
  tests/
    run.js                 — Test suite (13 tests)
  scripts/
    deploy-frontend.sh     — Uploads frontend to S3
  template.yaml            — SAM/CloudFormation infrastructure template
  samconfig.toml           — SAM deploy configuration
```

## Lambda Functions

### Event Poller (`eventPoller.js`)
- **Trigger**: EventBridge schedule (every 1 minute)
- **Flow**: Reads last polled block from DynamoDB → queries contract for new events → stores events in DynamoDB → sends SNS alerts for CRITICAL/WARNING events → updates poll cursor
- **Events monitored**: WatchdogAlerted, OutflowRecorded, HeartbeatReceived, SwitchActivated, EmergencyProposed/Approved/Executed/Cancelled, RateLimitChanged/Reset, Deposited, Withdrawn

### Heartbeat Monitor (`heartbeatMonitor.js`)
- **Trigger**: EventBridge schedule (every 1 hour)
- **Flow**: Reads vault state from blockchain → stores snapshot in DynamoDB → checks heartbeat deadline → sends alerts if approaching or passed
- **Alert levels**:
  - WARNING: Deadline within 48 hours (configurable)
  - CRITICAL: Deadline passed or switch already activated
  - INFO: Rate limiter at 80%+ utilization

### API Handler (`apiHandler.js`)
- **Trigger**: API Gateway REST requests
- **Reads from DynamoDB only** (never hits blockchain — fast and cheap)
- **Endpoints**:
  - `GET /status` — Full vault state snapshot
  - `GET /events?type=X&limit=N` — Recent events (optional filter)
  - `GET /proposals` — BreakGlass proposal lifecycle events
  - `GET /health` — System health (HEALTHY / WARNING / CRITICAL / STALE)

## API Endpoints

### GET /health
```json
{
  "status": "HEALTHY",
  "issues": [],
  "lastStateUpdate": 1710000000,
  "lastPolledBlock": 12345678,
  "vaultBalance": "10000000000000000000",
  "paused": false,
  "switchActivated": false
}
```

### GET /status
```json
{
  "data": {
    "owner": "0x...",
    "balance": "10000000000000000000",
    "paused": false,
    "deadManSwitch": { "secondsRemaining": 2505600, ... },
    "rateLimiter": { "remaining": "7000000000000000000", ... },
    "breakGlass": { "threshold": 2, "guardianCount": 3, ... },
    "watchdog": { "largeTransferThreshold": "5000000000000000000", ... }
  }
}
```

### GET /events
```json
{
  "count": 5,
  "events": [
    {
      "eventName": "WatchdogAlerted",
      "blockNumber": 12345,
      "timestamp": 1710000000,
      "args": { "severity": "2", "reason": "Large transfer detected", ... }
    }
  ]
}
```

## Dashboard

The frontend is a static HTML/CSS/JS app (no build step, no framework). It auto-refreshes every 30 seconds and displays:

- **Health badge** — overall system status
- **Vault status** — balance, owner, paused state
- **Dead man switch** — heartbeat countdown with progress bar
- **Rate limiter** — usage/capacity with progress bar
- **Break glass** — guardian count, threshold, delay
- **Watchdog config** — alert thresholds
- **Recent events** — filterable event feed with severity indicators

## Configuration

All configuration is via environment variables (set in the SAM template):

| Variable | Default | Description |
|----------|---------|-------------|
| `ETH_RPC_URL` | — | Ethereum JSON-RPC endpoint |
| `CONTRACT_ADDRESS` | — | Deployed vault contract address |
| `CHAIN_ID` | 11155111 | Ethereum chain ID (Sepolia) |
| `POLL_BLOCK_RANGE` | 100 | Blocks to look back on first poll |
| `HEARTBEAT_WARNING_HOURS` | 48 | Hours before deadline to warn |
| `EVENTS_TABLE` | SentinelEvents | DynamoDB table for events |
| `STATE_TABLE` | SentinelState | DynamoDB table for state |
| `ALERT_TOPIC_ARN` | — | SNS topic for email alerts |

## Local Development

### Test with SAM Local

```bash
# Start a local API Gateway
sam local start-api

# Invoke a specific Lambda
sam local invoke EventPollerFunction
```

### Test the Dashboard Locally

Set the API URL in `frontend/js/app.js`:
```javascript
const API_BASE = "http://localhost:3000";
```

Open `frontend/index.html` in a browser.

## Deployment Checklist

- [ ] Create an Alchemy or Infura account (free tier)
- [ ] Deploy FullSentinelVault to Sepolia (from nge-sentinel project)
- [ ] Run `sam build && sam deploy --guided` with your parameters
- [ ] Confirm the SNS subscription email
- [ ] Run `./scripts/deploy-frontend.sh` to deploy the dashboard
- [ ] Visit the dashboard URL and verify data is flowing

## Dependencies

- **Runtime**: ethers.js v6 (Ethereum client)
- **AWS SDK**: v3 (provided by Lambda runtime, not installed locally)
- **Frontend**: Vanilla HTML/CSS/JS (no build step, no framework)
- **Infrastructure**: AWS SAM / CloudFormation

## License

MIT
