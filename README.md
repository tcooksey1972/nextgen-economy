# NextGen-Economy

A Web3 security platform by **Cloud Creations LLC**. Composable Solidity security modules built on OpenZeppelin v5, with an AWS serverless monitoring backend that watches your contracts in real time.

## Projects

This monorepo contains two projects that work together:

### [NGE Sentinel](projects/nge-sentinel/) — Smart Contract Security Toolkit

A library of composable, drop-in security modules for Solidity smart contracts.

| Module | What It Does |
|--------|-------------|
| **DeadManSwitch** | Heartbeat-based kill switch — auto-pauses the contract if the owner goes inactive |
| **RateLimiter** | Rolling-window withdrawal caps to limit damage from exploits |
| **BreakGlass** | Multi-signature emergency recovery with mandatory timelock delays |
| **WatchdogAlert** | On-chain anomaly detection for large transfers and rapid activity |

All four modules are designed to compose without diamond inheritance conflicts. Use one, some, or all of them together. The repo includes example vault contracts demonstrating each combination, plus a `FullSentinelVault` that integrates all four.

- **Solidity** ^0.8.26 on **Hardhat** 2.28
- **OpenZeppelin Contracts** v5.6.1
- **135 passing tests** across 5 test suites
- Offline compilation support (no internet required)

### [NGE Sentinel Monitor](projects/nge-sentinel-monitor/) — AWS Serverless Monitoring

A serverless backend that polls on-chain events, stores them in DynamoDB, sends email alerts via SNS, and serves a real-time dashboard.

```
FullSentinelVault (Sepolia)
    │ events
    ▼
EventBridge Schedules
    ├── Event Poller (every 1 min)  → DynamoDB + SNS alerts
    └── Heartbeat Monitor (every 1 hr) → DynamoDB + SNS alerts
    │
API Gateway (REST)
    ├── GET /status      vault state snapshot
    ├── GET /events      recent contract events
    ├── GET /proposals   BreakGlass proposal lifecycle
    └── GET /health      system health summary
    │
S3 + CloudFront
    └── Static dashboard (auto-refreshes every 30s)
```

- **Node.js 18** Lambda functions with **ethers.js v6**
- **AWS SAM** for infrastructure-as-code
- Vanilla HTML/CSS/JS dashboard — zero build step
- Runs entirely on **AWS Free Tier** (~$0/month for demo usage)
- 13 unit tests with mocked AWS/blockchain dependencies

## Quick Start

### Prerequisites

- Node.js >= 18.x
- npm >= 9.x

### Smart Contracts

```bash
cd projects/nge-sentinel
npm install
npm test              # Run all 135 tests
npm run compile       # Compile contracts
```

### Monitor Backend

```bash
cd projects/nge-sentinel-monitor
npm install
npm test              # Run unit tests

# Deploy (requires AWS CLI + SAM CLI configured)
npm run deploy
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Solidity ^0.8.26, OpenZeppelin v5, Hardhat |
| Backend | AWS Lambda, API Gateway, DynamoDB, SNS, EventBridge |
| Frontend | Vanilla HTML/CSS/JS (S3 + CloudFront) |
| Blockchain | Ethereum (Sepolia testnet), ethers.js v6 |
| Infrastructure | AWS SAM / CloudFormation |

## Repository Structure

```
nextgen-economy/
├── CLAUDE.md                           # Development guidelines & patterns
├── REFERENCE-INDEX.md                  # Ethereum reference material index
├── PROJECT-STRUCTURE.md                # Recommended layout template
├── README.md                           # ← You are here
└── projects/
    ├── nge-sentinel/                   # Smart contract security library
    │   ├── contracts/
    │   │   ├── sentinel/               # Core modules + interfaces
    │   │   └── examples/               # Example vault contracts
    │   ├── test/sentinel/              # Hardhat tests
    │   ├── scripts/                    # Compile & test scripts
    │   ├── hardhat.config.js
    │   └── package.json
    └── nge-sentinel-monitor/           # AWS serverless backend
        ├── src/
        │   ├── lambdas/                # Event poller, heartbeat monitor, API
        │   ├── lib/                    # Shared utilities
        │   └── abi/                    # Contract ABIs
        ├── frontend/                   # Static dashboard
        ├── tests/                      # Unit tests
        ├── template.yaml               # SAM/CloudFormation template
        └── package.json
```

## Design Principles

- **Composability** — Security modules work standalone or combined without inheritance conflicts
- **Minimal dependencies** — Frontend has zero deps; backend uses only ethers.js
- **Offline-first** — Contracts compile and test without internet via bundled solcjs
- **Event-driven** — Contracts emit rich events; Lambdas monitor them off-chain
- **Serverless** — No persistent servers; scales on AWS Free Tier
- **Security-first** — Multiple overlapping protection layers (heartbeat, rate limit, multi-sig, anomaly detection)
- **OpenZeppelin native** — Built entirely on battle-tested OZ v5 primitives

## Security

Smart contract security is taken seriously in this project. Before any mainnet deployment:

- All functions have correct access modifiers
- Reentrancy guards on value-transferring functions
- Comprehensive test coverage (unit + integration)
- Pull-over-push withdraw pattern used throughout
- Professional audit recommended

See [CLAUDE.md](CLAUDE.md) for the full security checklist and development guidelines.

## License

Cloud Creations LLC. All rights reserved.
