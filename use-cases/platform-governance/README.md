# Platform Governance

> Token holders vote on protocol upgrades, fee structures, and treasury allocations.

## The Problem

Web3 platforms are often governed by a small team making unilateral decisions. Users have no voice, creating the same centralization problems blockchain was designed to solve.

## The Solution

Full OpenZeppelin Governor stack: token holders delegate voting power, create proposals, vote on-chain, and approved proposals execute through a TimelockController.

```
NGE Token (ERC20Votes) → Governor → TimelockController → Target Contracts
  (voting power)         (proposals    (1-day delay         (execute actions)
                          + voting)     before execution)
```

## Quick Start

```bash
npm install
npx hardhat node
npx hardhat run platform-governance/scripts/deploy.js --network localhost
```

## Deployed Contracts

| Contract | Purpose |
|----------|---------|
| `NGEGovernanceToken` | ERC-20 with voting power delegation (ERC20Votes + EIP-2612) |
| `TimelockController` | 1-day mandatory delay before execution |
| `NGEGovernor` | Proposal creation, voting, queuing, execution |

## Governance Configuration

| Parameter | Value | Purpose |
|-----------|-------|---------|
| Voting delay | 7,200 blocks (~1 day) | Time to acquire tokens before snapshot |
| Voting period | 50,400 blocks (~1 week) | Duration of voting |
| Quorum | 4% of total supply | Minimum participation |
| Proposal threshold | 0 | Anyone with tokens can propose |
| Timelock delay | 1 day | Cooling period before execution |

## Governance Flow

```javascript
// 1. Delegate voting power (required before voting)
await token.delegate(myAddress);

// 2. Create a proposal
const targets = [tokenAddress];
const values = [0];
const calldatas = [token.interface.encodeFunctionData("mint", [treasuryAddress, ethers.parseEther("1000000")])];
const tx = await governor.propose(targets, values, calldatas, "Mint 1M tokens to treasury");
const proposalId = (await tx.wait()).logs[0].args.proposalId;

// 3. Vote (after voting delay)
await governor.castVote(proposalId, 1); // 0=Against, 1=For, 2=Abstain

// 4. Queue (after voting period ends and proposal passes)
const descHash = ethers.keccak256(ethers.toUtf8Bytes("Mint 1M tokens to treasury"));
await governor.queue(targets, values, calldatas, descHash);

// 5. Execute (after timelock delay)
await governor.execute(targets, values, calldatas, descHash);
```

## Related

- [Device Certification](../device-certification/) — Community-voted manufacturer approval
- [Staking Rewards](../staking-rewards/) — Token utility beyond governance
- **Production module**: `projects/nge-token/` — NGE Token with sentinel hooks
