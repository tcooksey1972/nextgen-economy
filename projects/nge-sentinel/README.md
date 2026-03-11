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
| DeadManSwitch | Implemented | 39 passing |
| RateLimiter | Implemented | 23 passing |
| BreakGlass | Implemented | 37 passing |
| WatchdogAlert | Implemented | 19 passing |
| FullSentinelVault | Implemented | 17 passing |
| **Total** | **All phases complete** | **135 passing** |

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
  - Transfers ownership to a pre-configured recovery address
  - Emits a `SwitchActivated` event
- Owner can extend the interval or designate a backup operator
- Recovery address uses 2-step propose/accept pattern (like Ownable2Step)

**Key design decisions:**
- Inherits `Ownable2Step` + `Pausable` — provides the ownership and pause foundation
- Uses block timestamps, not block numbers (more predictable for users)
- Grace period after missed heartbeat before activation (prevents accidental triggers)
- Recovery address is set at deployment and requires 2-step change (prevents hijacking)

```solidity
contract MyVault is DeadManSwitch {
    constructor(address recovery)
        Ownable(msg.sender)
        DeadManSwitch(30 days, 7 days, recovery) // heartbeat, grace period, recovery
    {}
}
```

---

### 2. RateLimiter

Caps the amount of value that can leave a contract within a tumbling time window.

**Problem it solves:** If a contract is exploited or a privileged key is compromised, the attacker can drain everything in a single transaction. Rate limiting buys time to detect and respond.

**How it works:**
- Configurable max withdrawal amount per time window (e.g., 10 ETH per 24 hours)
- Tracks cumulative outflows in the current window
- Reverts with `RateLimitExceeded` if a withdrawal would exceed the limit
- Window resets automatically when expired (tumbling window design)
- Owner can adjust limits or reset usage after emergencies

**Key design decisions:**
- Does NOT inherit Ownable — uses virtual `_authorizeRateLimitAdmin()` hook instead
- Avoids diamond inheritance conflicts when composing with other modules
- Tumbling window (not sliding) for gas efficiency — no per-transaction tracking

```solidity
contract MyTreasury is Ownable, RateLimiter {
    constructor()
        Ownable(msg.sender)
        RateLimiter(100 ether, 24 hours) // max amount, window
    {}

    function _authorizeRateLimitAdmin() internal view override {
        _checkOwner();
    }

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
- Emergency actions: PAUSE, UNPAUSE, TRANSFER_OWNERSHIP
- Once threshold approvals are met, a mandatory delay must pass before execution
- Actions are predefined (not arbitrary calls — limits blast radius)
- All actions emit detailed events for monitoring

**Key design decisions:**
- Does NOT inherit Ownable or Pausable — uses virtual hooks instead:
  - `_authorizeBreakGlassAdmin()` — access control
  - `_breakGlassPause()` / `_breakGlassUnpause()` — pause control
  - `_breakGlassTransferOwnership()` — ownership transfer
- Guardians are separate from contract owner (separation of concerns)
- Cannot bypass the timelock — even in emergencies, there's a minimum delay

```solidity
contract MyProtocol is Ownable, Pausable, BreakGlass {
    constructor(address[] memory guardians)
        Ownable(msg.sender)
        BreakGlass(guardians, 2, 1 hours) // guardians, threshold, delay
    {}

    function _authorizeBreakGlassAdmin() internal view override { _checkOwner(); }
    function _breakGlassPause() internal override { _pause(); }
    function _breakGlassUnpause() internal override { _unpause(); }
    function _breakGlassTransferOwnership(address t) internal override { _transferOwnership(t); }
}
```

---

### 4. WatchdogAlert

On-chain anomaly detection that emits events when suspicious patterns occur.

**Problem it solves:** Most exploits are detected by off-chain monitoring AFTER significant damage. WatchdogAlert pushes detection closer to the source — the contract itself flags suspicious behavior as it happens.

**How it works:**
- Configurable alert thresholds:
  - Single transfer exceeds a configurable amount → CRITICAL alert
  - More than N transfers from same address within M seconds → WARNING alert
- Emits `WatchdogAlerted` events with severity levels (INFO, WARNING, CRITICAL)
- Does NOT block transactions (monitoring only — use RateLimiter to enforce)
- Per-address activity tracking with tumbling windows

**Key design decisions:**
- Does NOT inherit Ownable — uses virtual `_authorizeWatchdogAdmin()` hook
- Alert-only by default (no reverts) — avoids false positive DoS
- Gas-efficient: simple counter + timestamp per address (2 storage reads/writes max)
- Pairs with the serverless event listener architecture in our AWS stack

```solidity
contract MyToken is Ownable, ERC20, WatchdogAlert {
    constructor()
        Ownable(msg.sender)
        ERC20("Token", "TKN")
        WatchdogAlert(1000 ether, 10, 1 hours)
    {}

    function _authorizeWatchdogAdmin() internal view override { _checkOwner(); }

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
    DeadManSwitch.sol       — Heartbeat-based auto kill switch (inherits Ownable2Step + Pausable)
    RateLimiter.sol         — Rolling window withdrawal caps (virtual hook pattern)
    BreakGlass.sol          — Multi-sig emergency recovery (virtual hook pattern)
    WatchdogAlert.sol       — On-chain anomaly detection events (virtual hook pattern)
    interfaces/
      IDeadManSwitch.sol
      IRateLimiter.sol
      IBreakGlass.sol
      IWatchdogAlert.sol
  examples/
    SentinelVault.sol       — Simple vault with DeadManSwitch
    RateLimitedVault.sol    — Simple vault with RateLimiter
    BreakGlassVault.sol     — Simple vault with BreakGlass
    WatchdogVault.sol       — Simple vault with WatchdogAlert
    FullSentinelVault.sol   — All four modules combined

test/
  sentinel/
    DeadManSwitch.test.js   — 39 tests
    RateLimiter.test.js     — 23 tests
    BreakGlass.test.js      — 37 tests
    WatchdogAlert.test.js   — 19 tests
    FullSentinelVault.test.js — 17 integration tests

scripts/
  compile.js               — Offline solcjs compiler (no internet required)
  test.js                  — Standalone test runner against local node
```

## Design Principles

1. **Composable** — Each module works standalone or combined with others. Virtual hooks prevent diamond inheritance.
2. **Inherit, don't wrap** — Modules are abstract contracts you inherit, not external dependencies you call
3. **OpenZeppelin-native** — Built on OZ primitives, follows OZ patterns and conventions
4. **Gas-conscious** — Security shouldn't cost a fortune per transaction
5. **Event-driven** — Every module emits rich events for off-chain monitoring (feeds into our AWS Lambda architecture)

## Composability Pattern

Only `DeadManSwitch` inherits `Ownable2Step` and `Pausable`. The other three modules (`RateLimiter`, `BreakGlass`, `WatchdogAlert`) use virtual hook functions for access control and actions. This means you can mix and match any combination without diamond inheritance conflicts:

```solidity
// All four modules, zero inheritance conflicts
contract MyVault is DeadManSwitch, RateLimiter, BreakGlass, WatchdogAlert {
    // Implement the virtual hooks — each module stays independent
    function _authorizeRateLimitAdmin() internal view override { _checkOwner(); }
    function _authorizeBreakGlassAdmin() internal view override { _checkOwner(); }
    function _authorizeWatchdogAdmin() internal view override { _checkOwner(); }
    function _breakGlassPause() internal override { _pause(); }
    function _breakGlassUnpause() internal override { _unpause(); }
    function _breakGlassTransferOwnership(address t) internal override { _transferOwnership(t); }
}
```

## Roadmap

- [x] Phase 1: DeadManSwitch — core heartbeat + auto-pause + recovery
- [x] Phase 2: RateLimiter — tumbling window rate limiting
- [x] Phase 3: BreakGlass — multi-sig emergency actions with timelock
- [x] Phase 4: WatchdogAlert — on-chain anomaly detection events
- [x] Phase 5: Integration — FullSentinelVault combining all four modules
- [ ] Phase 6: AWS Lambda listeners — off-chain monitoring for Watchdog events

## Dependencies

- Solidity ^0.8.26
- OpenZeppelin Contracts v5.x
- Hardhat 2.x development framework
- ethers.js v6

## License

MIT
