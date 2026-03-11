# NGE Sentinel — Smart Contract Security Toolkit

A library of composable, reusable security modules for Solidity smart contracts. Built on OpenZeppelin v5.x.

## Getting Started

### Prerequisites
- Node.js >= 18.x
- npm >= 9.x

### Installation
```bash
cd projects/nge-sentinel
npm install
```

### Compile Contracts
```bash
# Standard Hardhat compilation (requires internet to download solc)
npm run compile

# Offline compilation using bundled solcjs (no internet required)
npm run compile:local
```

### Run Tests
```bash
# Standard Hardhat tests (requires internet for solc download)
npm test

# Standalone tests using pre-compiled artifacts + local node:
# Terminal 1 — start a local Hardhat node:
npm run node

# Terminal 2 — compile and run tests:
npm run compile:local
npm run test:local
```

### Project Status

| Module | Status | Tests |
|--------|--------|-------|
| DeadManSwitch | Implemented | 23 passing |
| RateLimiter | Planned (Phase 2) | — |
| BreakGlass | Planned (Phase 3) | — |
| WatchdogAlert | Planned (Phase 4) | — |

---

## Why This Exists

OpenZeppelin gives you building blocks (`Pausable`, `ReentrancyGuard`, `AccessControl`). NGE Sentinel gives you **opinionated security patterns** — higher-level modules that solve real operational problems smart contract teams face after deployment.

Every module is designed to be inherited into your own contracts, just like OpenZeppelin mixins.

## Modules

### 1. DeadManSwitch

An auto-executing kill switch that activates when the contract owner goes inactive.

**Problem it solves:** If a contract owner loses their keys, gets compromised, or disappears, the contract is stuck forever — funds trapped, no upgrades possible.

**How it works:**
- Owner must call `checkIn()` within a configurable heartbeat interval (e.g., every 30 days)
- If the heartbeat is missed, anyone can trigger `activateSwitch()` which:
  - Pauses the contract (stops all user-facing operations)
  - Emits a `DeadManSwitchActivated` event
  - Optionally transfers ownership to a pre-configured recovery address
- Owner can extend the interval or designate a backup operator

**Key design decisions:**
- Uses block timestamps, not block numbers (more predictable for users)
- Grace period after missed heartbeat before activation (prevents accidental triggers)
- Recovery address is set at deployment and requires 2-step change (prevents hijacking)

```solidity
contract MyVault is DeadManSwitch, ERC20 {
    constructor(address recovery)
        DeadManSwitch(30 days, 7 days, recovery) // heartbeat, grace period, recovery
    {}
}
```

---

### 2. RateLimiter

Caps the amount of value that can leave a contract within a rolling time window.

**Problem it solves:** If a contract is exploited or a privileged key is compromised, the attacker can drain everything in a single transaction. Rate limiting buys time to detect and respond.

**How it works:**
- Configurable max withdrawal amount per time window (e.g., 100 ETH per 24 hours)
- Tracks cumulative outflows in the current window
- Reverts if a withdrawal would exceed the limit
- Owner can adjust limits (with timelock for increases)

**Key design decisions:**
- Sliding window using checkpoint-based accounting (not fixed epochs)
- Separate limits configurable per token / asset type
- Emergency override requires multi-sig (ties into BreakGlass)

```solidity
contract MyTreasury is RateLimiter {
    constructor()
        RateLimiter(100 ether, 24 hours) // max amount, window
    {}

    function withdraw(uint256 amount) external onlyOwner {
        _enforceRateLimit(amount);
        // ... transfer logic
    }
}
```

---

### 3. BreakGlass

Emergency recovery mechanism with multi-sig approval and mandatory timelock.

**Problem it solves:** When something goes catastrophically wrong (exploit in progress, critical bug discovered), you need a well-defined emergency procedure — not panic. BreakGlass is a pre-planned "fire alarm" for your contracts.

**How it works:**
- A set of guardians (2-of-3, 3-of-5, etc.) can propose emergency actions
- Emergency actions execute after a short mandatory delay (e.g., 1 hour)
- Action types: pause all operations, migrate funds to safe address, change ownership
- All actions emit detailed events for monitoring
- Cool-down period between emergency actions (prevents abuse)

**Key design decisions:**
- Guardians are separate from contract owner (separation of concerns)
- Cannot bypass the timelock — even in emergencies, there's a minimum delay
- Actions are predefined at deployment (not arbitrary calls — limits blast radius)
- Integrates with OpenZeppelin's `Pausable`

```solidity
contract MyProtocol is BreakGlass, Pausable {
    constructor(address[] memory guardians)
        BreakGlass(guardians, 2, 1 hours) // guardians, threshold, delay
    {}
}
```

---

### 4. WatchdogAlert

On-chain anomaly detection that emits events when suspicious patterns occur.

**Problem it solves:** Most exploits are detected by off-chain monitoring AFTER significant damage. WatchdogAlert pushes detection closer to the source — the contract itself flags suspicious behavior as it happens.

**How it works:**
- Configurable alert thresholds per metric:
  - Single transfer exceeds X% of total supply
  - More than N transfers in M blocks from same address
  - Balance change exceeds threshold
- Emits `WatchdogAlert` events with severity levels (INFO, WARNING, CRITICAL)
- Does NOT block transactions (monitoring only — use RateLimiter to enforce)
- Designed to feed into off-chain monitoring (AWS Lambda listeners)

**Key design decisions:**
- Alert-only by default (no reverts) — avoids false positive DoS
- Thresholds updatable by owner with timelock
- Gas-efficient: uses bitmaps and minimal storage writes
- Pairs with the serverless event listener architecture in our AWS stack

```solidity
contract MyToken is ERC20, WatchdogAlert {
    function _update(address from, address to, uint256 value) internal override {
        _watchdogCheck(from, to, value);
        super._update(from, to, value);
    }
}
```

---

## Architecture

```
contracts/
  sentinel/
    DeadManSwitch.sol       — Heartbeat-based auto kill switch
    RateLimiter.sol         — Rolling window withdrawal caps
    BreakGlass.sol          — Multi-sig emergency recovery
    WatchdogAlert.sol       — On-chain anomaly detection events
    interfaces/
      IDeadManSwitch.sol
      IRateLimiter.sol
      IBreakGlass.sol
      IWatchdogAlert.sol

test/
  sentinel/
    DeadManSwitch.test.js
    RateLimiter.test.js
    BreakGlass.test.js
    WatchdogAlert.test.js
    integration/
      SentinelVault.test.js — Full integration test with all modules combined

scripts/
  deploy-sentinel-demo.js  — Deploy a demo vault using all modules
```

## Design Principles

1. **Composable** — Each module works standalone or combined with others
2. **Inherit, don't wrap** — Modules are abstract contracts you inherit, not external dependencies you call
3. **OpenZeppelin-native** — Built on OZ primitives, follows OZ patterns and conventions
4. **Gas-conscious** — Security shouldn't cost a fortune per transaction
5. **Event-driven** — Every module emits rich events for off-chain monitoring (feeds into our AWS Lambda architecture)

## Roadmap

- [x] Phase 1: DeadManSwitch — core heartbeat + auto-pause + recovery
- [ ] Phase 2: RateLimiter — sliding window rate limiting
- [ ] Phase 3: BreakGlass — multi-sig emergency actions
- [ ] Phase 4: WatchdogAlert — on-chain anomaly events
- [ ] Phase 5: Integration — demo vault combining all modules
- [ ] Phase 6: AWS Lambda listeners — off-chain monitoring for Watchdog events

## Dependencies

- Solidity ^0.8.26
- OpenZeppelin Contracts v5.x
- Hardhat 2.x development framework
- ethers.js v6

## License

MIT
