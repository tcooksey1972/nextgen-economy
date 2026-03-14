# Cold Chain Compliance

> Proving pharmaceutical shipments stayed within temperature range — tamper-proof.

## The Problem

A pharmaceutical distributor ships vaccines that must stay between 2-8°C. Regulators require continuous cold chain compliance proof. Current centralized databases can be edited after the fact. A single falsification can cost $10M+ in fines.

## The Solution

Each temperature sensor gets an ERC-721 NFT as its on-chain identity. Every reading is hashed and anchored to the blockchain. Anyone can verify the complete history without accessing any database.

```
Physical Sensor → MQTT → AWS IoT Core → Lambda → anchorTemperature() → Ethereum
                                                                          ↓
Receiving Dock → Scan device ID → isAnchored(hash) → Verified ✓        (immutable)
```

## Quick Start

```bash
npm install
npx hardhat node
npx hardhat run cold-chain/scripts/deploy.js --network localhost
```

## Workflow

### 1. Register a sensor
```javascript
const fwHash = ethers.keccak256(ethers.toUtf8Bytes("firmware-v1.2.3"));
await registry.registerSensor(sensorOwner, fwHash, "https://api.example.com/sensors/0");
// Mints ERC-721 token #0 to sensorOwner
```

### 2. Anchor temperature readings
```javascript
// Sensor reads 4.50°C → encode as 450 (Celsius × 100)
const raw = "2024-01-15T10:00:00Z|sensor-0|4.50C";
const dataHash = ethers.keccak256(ethers.toUtf8Bytes(raw));
await registry.connect(sensorOwner).anchorTemperature(0, 450, dataHash);
// Emits: TemperatureAnchored(0, dataHash, 450, timestamp)
```

### 3. Compliance violations auto-detected
```javascript
await registry.connect(sensorOwner).anchorTemperature(0, 950, outOfRangeHash);
// Emits: ComplianceViolation(0, 950, "Above maximum temperature")
// The reading is STILL anchored — transparency over suppression
```

### 4. Verify at receiving dock (FREE — no gas)
```javascript
const anchored = await registry.isAnchored(dataHash);          // true
const [sensorId, timestamp, block, temp] = await registry.getAnchor(dataHash);
// sensorId=0, timestamp=..., temp=450 (4.50°C) ✓
```

## Key Functions

| Function | Who | Gas? | Description |
|----------|-----|------|-------------|
| `registerSensor(owner, fwHash, uri)` | Admin | Yes | Mint sensor NFT |
| `anchorTemperature(sensorId, temp, hash)` | Sensor owner | Yes | Record reading |
| `anchorBatch(sensorId, hashes)` | Sensor owner | Yes | Batch record |
| `isAnchored(hash)` | Anyone | **Free** | Check if reading exists |
| `getAnchor(hash)` | Anyone | **Free** | Get full details |
| `setComplianceRange(min, max)` | Admin | Yes | Update valid range |

## Related

- [Smart Grid](../smart-grid/) — Energy production/consumption metering
- [Environmental](../environmental/) — Air quality monitoring with carbon credits
- **Production module**: `projects/nge-iot/` — DeviceRegistry + DataAnchor
