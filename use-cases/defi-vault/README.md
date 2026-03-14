# DeFi Vault Protection

> A self-defending ETH vault that protects treasury funds — even from a compromised admin key.

## The Problem

Your organization holds $2M in a smart contract treasury. If the admin's private key is compromised through phishing or a laptop breach, an attacker could drain the entire vault in a single transaction.

## The Solution

Deploy a `DeFiSentinelVault` with four security layers:

| Layer | Protection | What It Does |
|-------|-----------|--------------|
| **Rate Limiter** | Caps losses | Max 50 ETH per 24-hour window — even the owner can't exceed it |
| **Watchdog** | Early warning | Alerts on transfers > 10 ETH and rapid successive withdrawals |
| **Dead Man Switch** | Auto-defense | Pauses the vault after 72 hours of missed heartbeats |
| **Break Glass** | Recovery | 3-of-5 guardians can recover ownership via timelocked multi-sig |

**Maximum loss in a worst-case key compromise: 50 ETH (one rate-limit window) instead of the entire balance.**

## Quick Start

```bash
# From the use-cases/ directory
npm install
npx hardhat node                                        # Terminal 1: start local node
npx hardhat run defi-vault/scripts/deploy.js --network localhost  # Terminal 2: deploy
```

## Contract: `DeFiSentinelVault`

### Constructor

Accepts a `Config` struct:

```solidity
struct Config {
    uint256 heartbeatInterval;       // e.g., 3 days
    uint256 gracePeriod;             // e.g., 1 day
    address recoveryAddress;
    uint256 rateLimitMax;            // e.g., 50 ether
    uint256 rateLimitWindow;         // e.g., 1 days
    address[] guardians;             // e.g., 5 addresses
    uint256 guardianThreshold;       // e.g., 3 (of 5)
    uint256 emergencyDelay;          // e.g., 48 hours
    uint256 largeTransferThreshold;  // e.g., 10 ether
    uint256 rapidActivityThreshold;  // e.g., 5 transfers
    uint256 rapidActivityWindow;     // e.g., 1 hour
}
```

### Key Functions

| Function | Who | Description |
|----------|-----|-------------|
| `withdraw(to, amount)` | Owner | Withdraw ETH (rate-limited, watchdog-monitored) |
| `checkIn()` | Owner | Reset the dead man switch timer |
| `activateSwitch()` | Anyone | Trigger auto-pause after missed heartbeat deadline |
| `proposeEmergency(action, target)` | Guardian | Propose emergency action ("pause", "transfer") |
| `approveEmergency(proposalId)` | Guardian | Approve a pending proposal |
| `executeEmergency(proposalId)` | Anyone | Execute after threshold + delay |
| `currentWindowRemaining()` | Anyone | Check remaining rate limit (view, free) |

### Events (for monitoring)

- `WatchdogAlert(severity, message, from, to, amount)` — Hook this to AWS SNS for email/SMS alerts
- `HeartbeatReceived(owner, nextDeadline)` — Track heartbeat health
- `SwitchActivated(activator, timestamp)` — Critical: vault auto-paused
- `EmergencyProposed/Approved/Executed` — Guardian activity

## End-to-End Walkthrough

### 1. Deploy and fund the vault
```bash
npx hardhat run defi-vault/scripts/deploy.js --network localhost
# Vault deployed and funded with 100 ETH
```

### 2. Owner checks in (heartbeat)
```javascript
await vault.checkIn();
// Resets the dead man switch timer
```

### 3. Owner withdraws (rate-limited)
```javascript
await vault.withdraw(recipientAddress, ethers.parseEther("20"));
// Success — 20 ETH within 50 ETH limit
// Watchdog emits alert for 20 ETH (exceeds 10 ETH threshold)

await vault.withdraw(recipientAddress, ethers.parseEther("40"));
// REVERTS — RateLimitExceeded(40 ETH requested, 30 ETH remaining)
```

### 4. Key compromise scenario
```
Hour 0:  Attacker drains 50 ETH (hits rate limit)
Hour 1:  Watchdog alerts fire → AWS Lambda → SNS email
Hour 24: Rate limit window resets → attacker drains another 50 ETH
Hour 72: Owner hasn't checked in → anyone calls activateSwitch()
         Vault pauses. No more withdrawals possible.
Hour 73: Guardians propose new owner → 3 of 5 approve
Hour 121: 48-hour delay passes → execute recovery
         New owner calls unpause() → operations resume
```

**Total loss: 100 ETH (2 rate-limit windows) instead of entire balance.**

## Testnet Deployment

```bash
export DEPLOYER_PRIVATE_KEY=0x...
export ETH_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
npx hardhat run defi-vault/scripts/deploy.js --network sepolia
```

## Related

- [DAO Treasury](../dao-treasury/) — Percentage-based rate limiting for community funds
- [Emergency Key Rotation](../key-rotation/) — Focused break glass pattern
- **Production module**: `projects/nge-sentinel/` — Composable security modules
