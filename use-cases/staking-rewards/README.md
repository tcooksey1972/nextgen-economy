# Staking & Data Validation Rewards

> Token holders earn rewards for validating IoT data quality.

## The Problem

Anchoring data on-chain proves it hasn't been modified, but it doesn't prove the original reading was accurate. A faulty or miscalibrated sensor can anchor garbage data that looks legitimate.

## The Solution

NGE token holders stake tokens to become data validators. Validators cross-check IoT readings against reference data and historical baselines. Correct validations earn rewards; false flags lose stake (slashing).

```
Sensor anchors data → Task created → Validators review → Resolve → Reward/Slash
                                         ↓
                              Device confidence score updated
```

## Quick Start

```bash
npm install
npx hardhat node
npx hardhat run staking-rewards/scripts/deploy.js --network localhost
```

## Staking Flow

```javascript
// 1. Approve and stake tokens
await token.approve(stakingAddress, ethers.parseEther("5000"));
await staking.stake(ethers.parseEther("5000"));

// 2. Admin creates a validation task for suspicious data
await staking.createTask(deviceId, dataHash);

// 3. Validators submit their assessment
await staking.connect(validator1).submitValidation(1, true);   // Flag anomaly
await staking.connect(validator2).submitValidation(1, false);  // Clear it

// 4. Admin resolves (based on ground truth)
await staking.resolveTask(1, true); // It WAS an anomaly

// 5. Distribute rewards/slashing
await staking.distributeReward(1, validator1.address); // Correct → +10 NGE reward
await staking.distributeReward(1, validator2.address); // Wrong → -50 NGE slashed

// 6. Check device confidence
const score = await staking.deviceConfidenceScore(deviceId);
// 0-100 (lower = more anomalies flagged)
```

## Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `minStake` | 1,000 NGE | Minimum to become a validator |
| `unstakeCooldown` | 7 days | Wait period before withdrawing stake |
| `rewardPerValidation` | 10 NGE | Earned for correct validation |
| `slashAmount` | 50 NGE | Lost for incorrect validation |

## Key Functions

| Function | Who | Description |
|----------|-----|-------------|
| `stake(amount)` | Anyone | Stake tokens to become validator |
| `requestUnstake()` | Validator | Start cooldown to withdraw |
| `unstake()` | Validator | Withdraw after cooldown |
| `createTask(deviceId, hash)` | Admin | Create validation task |
| `submitValidation(taskId, flag)` | Validator | Submit assessment |
| `resolveTask(taskId, wasAnomaly)` | Admin | Resolve with ground truth |
| `distributeReward(taskId, validator)` | Admin | Reward or slash |
| `deviceConfidenceScore(deviceId)` | Anyone (free) | 0-100 score |

## Related

- [Environmental](../environmental/) — Sensors that need validation
- [Platform Governance](../platform-governance/) — NGE token governance
