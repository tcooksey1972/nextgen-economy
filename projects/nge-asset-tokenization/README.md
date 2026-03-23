# NGE Asset Tokenization

**Corporate asset tokenization with on-chain accounting, QR/UPN identifier resolution, and controlled-item chain-of-custody tracking.**

Built by Cloud Creations LLC — part of the [NextGen Economy](../../README.md) platform.

---

## Overview

This project tokenizes every corporate asset — from office furniture to ammunition stockpiles — as ERC-1155 tokens on Ethereum. Each asset gets an immutable on-chain record covering its full lifecycle: acquisition, depreciation, transfers, revaluations, and disposal.

Physical assets are linked to the blockchain via QR codes, UPNs, serial numbers, or barcodes. Scan a label, resolve to a token ID, and instantly view the asset's full financial history and chain of custody.

### Problem Statement

Organizations (especially government agencies like DFAS) struggle with:
- **Lost or untracked assets** — billions in equipment unaccounted for
- **No audit trail** — paper-based systems with gaps and inconsistencies
- **Physical-to-digital disconnect** — no reliable link between a physical item and its financial record
- **Controlled item accountability** — ammunition, narcotics, and hazardous materials require strict chain-of-custody that paper logs can't guarantee

### Solution

Blockchain-based asset management provides:
- **Immutable records** — every event is permanently recorded on-chain
- **Automated accounting** — straight-line depreciation, journal entries, and book value tracking
- **Physical scanning** — QR codes and barcodes resolve directly to on-chain records
- **Role-based access** — multi-party authorization for sensitive operations
- **Real-time auditability** — any auditor can verify the complete history of any asset

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   SimpleAssetManager                     │
│              (or ControlledAssetManager)                  │
│                                                          │
│  ┌──────────────┐  ┌─────────────┐  ┌────────────────┐  │
│  │ AssetRegistry │  │ AssetLedger │  │  Identifier    │  │
│  │  (ERC-1155)   │  │ (Accounting)│  │  Resolver      │  │
│  │               │  │             │  │  (QR/UPN/SN)   │  │
│  │ - Register    │  │ - Acquire   │  │                │  │
│  │ - Transfer    │  │ - Depreciate│  │ - Link         │  │
│  │ - Dispose     │  │ - Revalue   │  │ - Unlink       │  │
│  │ - Pause       │  │ - Impair    │  │ - Resolve      │  │
│  │               │  │ - Dispose   │  │ - Batch link   │  │
│  └──────────────┘  └─────────────┘  └────────────────┘  │
└─────────────────────────────────────────────────────────┘
         │                    │                  │
         ▼                    ▼                  ▼
   ERC-1155 Tokens    Journal Entries     QR/Barcode Scan
   (on-chain assets)  (audit trail)      (physical link)
```

### Core Modules

| Module | Contract | Purpose |
|--------|----------|---------|
| **Asset Registry** | `AssetRegistry.sol` | ERC-1155 token registry for all asset types. Unique assets (equipment, vehicles) get supply=1; fungible inventory (stock, parts) gets supply=N. Stores metadata: class, status, cost, department, location, depreciation schedule. |
| **Asset Ledger** | `AssetLedger.sol` | On-chain double-entry accounting. Records immutable journal entries for acquisitions, straight-line depreciation, revaluations, impairments, disposals, and inter-department transfers. |
| **Identifier Resolver** | `IdentifierResolver.sol` | Maps external identifiers (QR codes, UPNs, serial numbers, barcodes) to on-chain token IDs. Identifiers stored as keccak256 hashes for constant gas cost. |

### Example Implementations

| Contract | Access Control | Use Case |
|----------|---------------|----------|
| `SimpleAssetManager` | `Ownable` (single owner) | Small business, startup, or demo |
| `ControlledAssetManager` | `AccessControl` (role-based) | Government, military, regulated industries — ammunition, narcotics, hazmat |

---

## Asset Classifications

| Class | Enum Value | Supply | Example |
|-------|-----------|--------|---------|
| `UniqueEquipment` | 0 | 1 | Vehicles, machinery, buildings |
| `FungibleInventory` | 1 | N | Stock, parts, supplies, ammunition |
| `IntellectualProperty` | 2 | 1 or N | Patents, trademarks, licenses |
| `FinancialInstrument` | 3 | 1 or N | Bonds, notes, receivables |

---

## Controlled Items (Government / Military Use Case)

The `ControlledAssetManager` example demonstrates how regulated items are managed:

### Roles
| Role | Permissions |
|------|-------------|
| `PROPERTY_OFFICER` | Register assets, update metadata, link identifiers |
| `ACCOUNTANT` | Record journal entries, depreciation, revaluations |
| `CUSTODIAN` | Issue and return controlled items (quantity tracking) |
| `AUDITOR` | Read-only verification (no write permissions needed — all data is public on-chain) |
| `DEFAULT_ADMIN` | Grant/revoke roles, emergency pause |

### Workflow: Ammunition Accountability
```
1. PROPERTY_OFFICER registers ammunition lot → mints 10,000 ERC-1155 tokens
2. PROPERTY_OFFICER links QR code to the token ID
3. ACCOUNTANT records acquisition ($50,000 cost)
4. CUSTODIAN issues 500 rounds to a unit → transfers tokens
5. CUSTODIAN records return of 480 rounds → 20 expended
6. AUDITOR scans QR code → verifies on-chain balance matches physical count
7. Full chain of custody visible in event logs
```

### Workflow: Narcotics / Pharmaceutical Control
```
1. PROPERTY_OFFICER registers controlled substance lot
2. Link DEA number + lot number as identifiers
3. CUSTODIAN issues to authorized personnel only
4. Every issuance and return is an on-chain event
5. Discrepancies are immediately visible (token balance ≠ physical count)
```

---

## Identifier Resolution (QR / UPN / Barcode)

The system bridges physical assets to blockchain records:

```
Physical World                    Blockchain
─────────────                    ──────────

[QR Code Label]  ──scan──►  Raw string: "QR:ASSET-001-BLDGA"
                                 │
                            keccak256 hash
                                 │
                            resolve(hash)  ──►  Token ID: 0
                                                    │
                            assetMetadata(0) ──►  Full record
                            bookValue(0)    ──►  $8,500
                            identifierCount(0) ► 2 (QR + Serial)
```

### Supported Identifier Types
| Type | Enum | Example |
|------|------|---------|
| QR Code | 0 | `QR:ASSET-001-BLDGA` |
| UPN (Universal Product Number) | 1 | `UPN:123456789012` |
| Serial Number | 2 | `SN:XYZ-2026-00042` |
| Barcode | 3 | `BC:5901234123457` |
| Custom | 4 | Any organizational identifier |

---

## Accounting Features

### Straight-Line Depreciation
```
Monthly Amount = Acquisition Cost / Useful Life (months)
Final period absorbs rounding remainder for exact zero book value.
```

### Journal Entry Types
| Type | Debit | Credit | Description |
|------|-------|--------|-------------|
| Acquisition | Asset cost | — | New asset purchased |
| Depreciation | — | Monthly amount | Periodic value reduction |
| Revaluation | Surplus | Deficit | Fair value adjustment |
| Impairment | — | Write-down | Loss of value |
| Disposal | Sale proceeds | Book value | Asset sold or scrapped |
| Transfer | — | — | Department-to-department move |

---

## Quick Start

### Prerequisites
- Node.js 18+
- npm

### Install
```bash
cd projects/nge-asset-tokenization
npm install
```

### Compile
```bash
# With internet (downloads native solc)
npm run compile

# Without internet (uses bundled solcjs)
npm run compile:local
```

### Test
```bash
# With internet
npm test

# Without internet
npm run node          # Terminal 1: start local node
npm run test:local    # Terminal 2: run tests
```

### Deploy
```bash
# Set environment variables
export ETH_RPC_URL="https://sepolia.infura.io/v3/YOUR_KEY"
export DEPLOYER_PRIVATE_KEY="0x..."

# Deploy to Sepolia testnet
npx hardhat run scripts/deploy.js --network sepolia
```

---

## Project Structure

```
nge-asset-tokenization/
├── contracts/
│   ├── asset/
│   │   └── AssetRegistry.sol         # Abstract ERC-1155 asset registry
│   ├── accounting/
│   │   └── AssetLedger.sol           # Abstract on-chain accounting ledger
│   ├── resolver/
│   │   └── IdentifierResolver.sol    # Abstract QR/UPN/barcode resolver
│   ├── interfaces/
│   │   ├── IAssetRegistry.sol        # Registry interface + types
│   │   ├── IAssetLedger.sol          # Ledger interface + types
│   │   └── IIdentifierResolver.sol   # Resolver interface + types
│   └── examples/
│       ├── SimpleAssetManager.sol    # Ownable implementation (demo)
│       └── ControlledAssetManager.sol # AccessControl implementation (gov/mil)
├── test/
│   ├── asset/
│   │   └── AssetRegistry.test.js
│   ├── accounting/
│   │   └── AssetLedger.test.js
│   ├── resolver/
│   │   └── IdentifierResolver.test.js
│   └── examples/
│       └── ControlledAssetManager.test.js
├── scripts/
│   ├── compile.js                    # Offline solcjs compiler
│   ├── test.js                       # Offline test runner
│   └── deploy.js                     # Deployment script
├── hardhat.config.js
├── package.json
└── README.md
```

---

## Tech Stack

| Component | Version |
|-----------|---------|
| Solidity | ^0.8.26 |
| OpenZeppelin Contracts | ^5.6.1 |
| Hardhat | ^2.28.6 |
| EVM Target | Cancun |
| Token Standard | ERC-1155 (multi-token) |

---

## License

MIT — Cloud Creations LLC
