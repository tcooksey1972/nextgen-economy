# NextGen-Economy

A Web3 platform by **Cloud Creations LLC**. Composable Solidity smart contracts built on OpenZeppelin v5, with AWS serverless backends — spanning security, IoT, and tokenomics.

## Projects

This monorepo contains the following projects:

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

### [NGE Token](projects/nge-token/) — ERC-20 Platform Token

The NGE platform token powering governance, payments, and staking across the ecosystem.

| Feature | Description |
|---------|-------------|
| **ERC-20** | Fungible token ("NextGen Economy" / NGE) with 18 decimals |
| **Burnable** | Token holders can burn their own tokens |
| **Pausable** | Emergency stop on all transfers, minting, and burning |
| **Permit (EIP-2612)** | Gasless approvals via off-chain signatures |
| **Votes (ERC20Votes)** | Governance voting power with delegation and checkpoints |
| **Supply Cap** | Configurable maximum supply (0 = unlimited) |
| **Sentinel Hooks** | Virtual hooks for composing with nge-sentinel security modules |

Two example deployments: `SimpleNGEToken` (Ownable) and `SentinelNGEToken` (transfer limits + large transfer detection). AWS serverless API for balance queries, transfer history, and token info.

- **Solidity** ^0.8.26 on **Hardhat** 2.28
- **OpenZeppelin Contracts** v5.6.1
- **50+ passing tests** across 2 test suites
- AWS Free Tier optimized ($0.00/month for dev usage)

### [NGE Frontend](projects/nge-frontend/) — Platform UI

React single-page application with MetaMask wallet integration.

| Page | Description |
|------|-------------|
| **Dashboard** | Platform overview — wallet balance, token supply, device count |
| **Token** | Transfer tokens, delegate voting power, burn |
| **Devices** | Browse IoT device registry, verify data anchors on-chain |
| **Governance** | Voting power delegation and governance stats |

- **React 18** with React Router v6
- **ethers.js v6** + MetaMask for wallet connection
- **S3 + CloudFront** hosting (Free Tier)
- Dark theme, responsive layout

## CI/CD

GitHub Actions workflows automate the entire pipeline:

- **CI** (`ci.yml`): Compiles and tests all 4 projects in parallel on every PR
- **Deploy** (`deploy.yml`): Manual dispatch — deploys contracts to Sepolia, stores addresses in SSM, deploys AWS stacks, deploys frontend to S3/CloudFront

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

### Token

```bash
cd projects/nge-token
npm install
npm test              # Run all 50+ tests
npm run compile       # Compile contracts
```

### Frontend

```bash
cd projects/nge-frontend
cp .env.example .env  # Edit with deployed contract addresses
npm install
npm start             # Opens at http://localhost:3000
```

### Deploy Everything

```bash
# 1. Deploy contracts to Sepolia
cd projects/nge-token && npx hardhat run scripts/deploy.js --network sepolia
cd projects/nge-iot && npx hardhat run scripts/deploy.js --network sepolia
cd projects/nge-sentinel && npx hardhat run scripts/deploy.js --network sepolia

# 2. Store addresses in SSM
node scripts/ssm-store.js --project token --address 0x...
node scripts/ssm-store.js --project iot --address 0x...
node scripts/ssm-store.js --project sentinel --address 0x...

# 3. Deploy AWS infrastructure (each project)
# Or use the GitHub Actions deploy workflow for automated deployment
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Solidity ^0.8.26, OpenZeppelin v5, Hardhat |
| Backend | AWS Lambda, API Gateway, DynamoDB, SNS, EventBridge |
| Frontend | React 18, ethers.js v6, MetaMask (S3 + CloudFront) |
| Blockchain | Ethereum (Sepolia testnet), ethers.js v6 |
| Infrastructure | AWS SAM / CloudFormation |
| CI/CD | GitHub Actions (test + deploy) |

## Repository Structure

```
nextgen-economy/
├── .github/workflows/
│   ├── ci.yml                          # Test all projects on PR
│   └── deploy.yml                      # Deploy contracts + infra + frontend
├── scripts/
│   └── ssm-store.js                    # Store contract addresses in SSM
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
    │   ├── scripts/                    # Compile, test & deploy scripts
    │   └── package.json
    ├── nge-sentinel-monitor/           # AWS serverless monitoring
    │   ├── src/lambdas/                # Event poller, heartbeat, API
    │   ├── frontend/                   # Static dashboard
    │   ├── template.yaml               # SAM/CloudFormation template
    │   └── package.json
    ├── nge-iot/                        # Blockchain-IoT primitives
    │   ├── contracts/iot/              # DeviceRegistry (ERC-721) + DataAnchor
    │   ├── scripts/                    # Compile, test & deploy scripts
    │   ├── aws/                        # Lambda + IoT Rules + CloudFormation
    │   └── package.json
    ├── nge-token/                      # ERC-20 platform token
    │   ├── contracts/token/            # NGEToken (abstract) + examples
    │   ├── scripts/                    # Compile, test & deploy scripts
    │   ├── aws/                        # Lambda + API Gateway + CloudFormation
    │   └── package.json
    └── nge-frontend/                   # React platform UI
        ├── src/
        │   ├── pages/                  # Dashboard, Token, Devices, Governance
        │   ├── hooks/                  # useWallet, useTokenContract
        │   └── abi/                    # Contract ABIs
        ├── aws/cloudformation/         # S3 + CloudFront hosting
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
