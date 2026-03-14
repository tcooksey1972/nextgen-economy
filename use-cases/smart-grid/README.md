# Smart Grid Energy Metering

> Tamper-proof energy production records for community solar programs.

## The Problem

A community solar program compensates homeowners for excess energy fed to the grid. Utility companies and homeowners dispute meter readings. Legacy meters can be tampered with, and centralized data is controlled by one party.

## The Solution

Each smart meter is an ERC-721 NFT on the blockchain. Hourly energy readings (production + consumption) are hashed and anchored on-chain. Both parties verify the same immutable record.

## Quick Start

```bash
npm install
npx hardhat node
npx hardhat run smart-grid/scripts/deploy.js --network localhost
```

## Workflow

### 1. Utility registers a meter
```javascript
const fwHash = ethers.keccak256(ethers.toUtf8Bytes("smartmeter-fw-2.0"));
await registry.registerMeter(homeownerAddress, fwHash);
// Mints meter NFT #0 to homeowner
```

### 2. Meter anchors hourly readings
```javascript
const raw = "2024-01-15T12:00:00Z|prod:5200|cons:3100";
const hash = ethers.keccak256(ethers.toUtf8Bytes(raw));
await registry.connect(homeowner).anchorReading(0, 5200, 3100, hash);
// Net: +2100 Wh (homeowner produced more than consumed)
```

### 3. Monthly settlement
```javascript
await registry.recordSettlement(
  0,                // meterId
  1705276800,       // periodStart (Jan 15)
  1707955200,       // periodEnd (Feb 15)
  156000,           // totalProductionWh
  93000,            // totalConsumptionWh
  720               // readingCount (hourly for 30 days)
);
// Net: +63,000 Wh → homeowner is credited
```

### 4. Dispute resolution (free)
```javascript
const [meterId, ts, prod, cons] = await registry.getReading(hash);
// Both parties see the same immutable data
```

## Key Functions

| Function | Who | Description |
|----------|-----|-------------|
| `registerMeter(owner, fwHash)` | Utility (admin) | Mint meter NFT |
| `anchorReading(meterId, prodWh, consWh, hash)` | Meter owner | Record reading |
| `recordSettlement(meterId, start, end, prod, cons, count)` | Utility | Monthly summary |
| `isAnchored(hash)` | Anyone (free) | Verify reading exists |
| `getReading(hash)` | Anyone (free) | Get reading details |
| `getSettlement(meterId, periodStart)` | Anyone (free) | Get settlement data |

## Related

- [Cold Chain](../cold-chain/) — Temperature monitoring
- [Environmental](../environmental/) — Air quality + carbon credits
