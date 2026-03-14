# NextGen Economy — Use Cases

Real-world scenarios with working smart contracts, deploy scripts, and step-by-step instructions. Clone the repo, pick a use case, and deploy in under 5 minutes.

## Quick Start

```bash
cd use-cases
npm install
npx hardhat node                                                # Terminal 1
npx hardhat run <scenario>/scripts/deploy.js --network localhost # Terminal 2
```

## Scenarios

### Security (Sentinel)

| # | Scenario | Contract | Description |
|---|----------|----------|-------------|
| 1 | [DeFi Vault Protection](./defi-vault/) | `DeFiSentinelVault` | Self-defending vault with 4 security layers. Rate-limited withdrawals cap losses from key compromise. |
| 2 | [DAO Treasury](./dao-treasury/) | `DAOTreasury` | Percentage-based rate limiting for community funds. Spending proposals with mandatory delay. |
| 3 | [Emergency Key Rotation](./key-rotation/) | `RecoverableVault` | 3-of-5 guardian multi-sig recovers ownership when keys are lost or compromised. |

### IoT (Device Registry + Data Anchoring)

| # | Scenario | Contract | Description |
|---|----------|----------|-------------|
| 4 | [Cold Chain Compliance](./cold-chain/) | `ColdChainRegistry` | Pharmaceutical temperature sensors with tamper-proof blockchain records. Automatic compliance violation detection. |
| 5 | [Smart Grid Metering](./smart-grid/) | `EnergyMeterRegistry` | Solar energy production/consumption metering. Dispute-free billing with immutable readings. |
| 6 | [Environmental Monitoring](./environmental/) | `EnvironmentalMonitor` | Air quality sensors (PM2.5, CO2, NOx) backing verifiable carbon credits. Credits require proven reductions. |

### Governance (NGE Token)

| # | Scenario | Contract(s) | Description |
|---|----------|-------------|-------------|
| 7 | [Platform Governance](./platform-governance/) | `NGEGovernanceToken` + `NGEGovernor` + `TimelockController` | Full on-chain governance. Token holders vote on protocol upgrades and treasury allocations. |
| 8 | [Device Certification](./device-certification/) | `DeviceCertification` | Community-voted IoT manufacturer approval. Transparent, on-chain certification registry. |
| 9 | [Staking & Validation](./staking-rewards/) | `DataValidatorStaking` | Stake tokens to validate IoT data quality. Earn rewards for correct validations; lose stake for false flags. |

## Architecture

Each scenario is self-contained:

```
use-cases/
├── hardhat.config.js          # Shared Hardhat config (compiles all scenarios)
├── package.json               # Shared dependencies
├── README.md                  # This file
│
├── defi-vault/
│   ├── contracts/             # Solidity contract(s)
│   │   └── DeFiSentinelVault.sol
│   ├── scripts/               # Deploy + demo script
│   │   └── deploy.js
│   └── README.md              # Problem → Solution → Walkthrough
│
├── cold-chain/
│   ├── contracts/
│   │   └── ColdChainRegistry.sol
│   ├── scripts/
│   │   └── deploy.js
│   └── README.md
│
└── ... (7 more scenarios, same structure)
```

## Deploying to Testnet

```bash
export DEPLOYER_PRIVATE_KEY=0x...
export ETH_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
npx hardhat run <scenario>/scripts/deploy.js --network sepolia
```

## How These Relate to the Core Platform

These use cases compose the building blocks from the core projects:

| Use Case | Core Project | Building Blocks Used |
|----------|-------------|---------------------|
| DeFi Vault, DAO Treasury, Key Rotation | `nge-sentinel` | DeadManSwitch, RateLimiter, BreakGlass, WatchdogAlert |
| Cold Chain, Smart Grid, Environmental | `nge-iot` | DeviceRegistry (ERC-721), DataAnchor |
| Platform Governance, Staking | `nge-token` | NGEToken (ERC-20, ERC20Votes, ERC20Permit) |
| Device Certification | `nge-iot` + `nge-token` | AccessControl roles + governance voting |

The use case contracts are **self-contained** (no cross-project imports) for easy cloning and experimentation. In production, import the composable modules from the core projects instead.

## Requirements

- Node.js 18+
- npm 9+
- MetaMask (for testnet deployment)
- Sepolia ETH from a faucet (for testnet)
