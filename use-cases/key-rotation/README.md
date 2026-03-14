# Emergency Key Rotation

> Recovering a contract when the owner's key is lost, compromised, or held by a departing employee.

## The Problem

The sole owner of a production smart contract loses their hardware wallet. Or a departing employee refuses to hand over the key. The contract holds live funds with no recovery mechanism.

## The Solution

The `RecoverableVault` uses the Break Glass pattern: 5 pre-designated guardians (board members, legal counsel, cold-storage backup) can recover ownership through a timelocked multi-sig vote.

```
Guardian 1 proposes new owner → Guardian 2 approves → Guardian 3 approves
    ↓ (threshold met: 3 of 5)
    48-hour mandatory delay
    ↓
Anyone executes → ownership transfers on-chain
```

## Quick Start

```bash
npm install
npx hardhat node
npx hardhat run key-rotation/scripts/deploy.js --network localhost
```

## Recovery Flow

```javascript
// 1. Guardian proposes new owner
await vault.connect(guardian1).proposeRecovery(newOwnerAddress);

// 2. Two more guardians approve
await vault.connect(guardian2).approve(1);
await vault.connect(guardian3).approve(1);
// Threshold met — 48-hour timer starts

// 3. Wait 48 hours (on testnet, use time manipulation)
await ethers.provider.send("evm_increaseTime", [48 * 60 * 60]);
await ethers.provider.send("evm_mine");

// 4. Execute
await vault.execute(1);
// Ownership transferred to newOwnerAddress

// 5. New owner resumes operations
await vault.connect(newOwner).unpause();
```

## Key Functions

| Function | Who | Description |
|----------|-----|-------------|
| `proposeRecovery(newOwner)` | Guardian | Propose ownership transfer |
| `proposePause()` | Guardian | Propose emergency pause |
| `approve(proposalId)` | Guardian | Approve a proposal |
| `execute(proposalId)` | Anyone | Execute after threshold + delay |
| `cancel(proposalId)` | Proposer/Owner | Cancel a proposal |
| `addGuardian(address)` | Owner | Add a new guardian |
| `removeGuardian(address)` | Owner | Remove a guardian |

## Related

- [DeFi Vault](../defi-vault/) — Full Sentinel stack including Break Glass
- **Production module**: `projects/nge-sentinel/contracts/sentinel/BreakGlass.sol`
