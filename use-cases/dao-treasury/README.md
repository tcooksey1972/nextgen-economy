# DAO Treasury Governance

> Protecting community funds from insider threats and flash loan governance attacks.

## The Problem

A DAO treasury holds community funds managed by elected multi-sig holders. Multi-sig signers can collude, go rogue, or get socially engineered. Flash loan attacks can pass malicious proposals in a single block.

## The Solution

Wrap the treasury in rate limiting and monitoring:

- **Percentage-based rate limit**: Max 5% of balance per 24-hour window
- **Spending proposals**: Mandatory delay between approval and execution
- **Heartbeat monitoring**: Auto-pause if all signers go inactive
- **Watchdog alerts**: Large withdrawal notifications

## Quick Start

```bash
npm install
npx hardhat node
npx hardhat run dao-treasury/scripts/deploy.js --network localhost
```

## Key Functions

| Function | Who | Description |
|----------|-----|-------------|
| `proposeSpending(to, amount, description)` | Owner | Create a spending proposal |
| `approveSpending(proposalId)` | Owner | Approve a proposal |
| `executeSpending(proposalId)` | Owner | Execute after delay (rate-limited) |
| `checkIn()` | Owner | Reset heartbeat timer |
| `activateSwitch()` | Anyone | Auto-pause after missed heartbeat |
| `currentWindowRemaining()` | Anyone | Check spending limit (free) |

## Why Percentage-Based Limits?

Fixed rate limits (e.g., "50 ETH/day") don't scale. If the treasury grows from 100 ETH to 10,000 ETH, the limit is too restrictive. If it shrinks to 10 ETH, the limit is too loose.

This contract uses basis-point limits (500 bps = 5%), so the cap automatically scales with the treasury balance.

## Related

- [DeFi Vault](../defi-vault/) — Fixed rate limiting with full Sentinel stack
- [Platform Governance](../platform-governance/) — On-chain voting for proposals
