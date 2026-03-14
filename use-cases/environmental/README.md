# Environmental Monitoring & Carbon Credits

> Verifiable air quality data that backs tradeable carbon credits.

## The Problem

Carbon credit markets are plagued by fraud. Companies claim emissions reductions based on self-reported data. There's no independent, tamper-proof verification layer.

## The Solution

Deploy air quality sensors as ERC-721 devices. Readings (PM2.5, CO2, NOx) are anchored on-chain. Carbon credits are only mintable when sensor data proves actual reductions vs. a verified baseline.

## Quick Start

```bash
npm install
npx hardhat node
npx hardhat run environmental/scripts/deploy.js --network localhost
```

## Workflow

### 1. Register sensors and set baselines
```javascript
await monitor.registerSensor(operatorAddress, "Industrial Zone A");
await monitor.setBaseline("Industrial Zone A", 3500, 450, 80);
// Baseline: PM2.5=35.00 µg/m³, CO2=450 ppm, NOx=80 ppb
```

### 2. Anchor air quality readings
```javascript
const hash = ethers.keccak256(ethers.toUtf8Bytes("2024-01-15|pm25:2800|co2:380|nox:60"));
await monitor.connect(operator).anchorReading(0, 2800, 380, 60, hash);
// PM2.5 down 20%, CO2 down 15.5%, NOx down 25% vs baseline
```

### 3. Issue carbon credits based on verified data
```javascript
await monitor.issueCarbonCredit(0, 380, 10);
// Issues 10 credits — CO2 reduced from 450 to 380 ppm (15.5% reduction)
// REVERTS if measuredCo2 >= baseline (no reduction = no credits)
```

### 4. Auditor verification (free)
```javascript
const [sensorId, ts, pm25, co2, nox] = await monitor.getReading(hash);
// Auditor verifies on-chain without site visit
```

## Key Functions

| Function | Who | Description |
|----------|-----|-------------|
| `registerSensor(owner, zone)` | Admin | Create sensor NFT |
| `setBaseline(zone, pm25, co2, nox)` | Admin | Set emissions baseline |
| `anchorReading(sensorId, pm25, co2, nox, hash)` | Sensor operator | Record reading |
| `issueCarbonCredit(sensorId, measuredCo2, amount)` | Admin | Issue credits (requires reduction) |
| `isAnchored(hash)` | Anyone (free) | Verify reading |
| `totalCreditsIssued()` | Anyone (free) | Total credits minted |

## Related

- [Cold Chain](../cold-chain/) — Temperature monitoring
- [Smart Grid](../smart-grid/) — Energy metering
- [Staking Rewards](../staking-rewards/) — Validators cross-check sensor data
