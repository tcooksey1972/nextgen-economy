# Device Certification Voting

> Community-approved IoT device manufacturers join the trusted registry.

## The Problem

An open IoT platform needs to vet device manufacturers. Centralized approval creates bottlenecks and conflicts of interest. But allowing unreviewed devices opens the door to malicious hardware.

## The Solution

New manufacturers submit certification proposals. Token holders review specs and audit results, then vote on-chain. Approved manufacturers receive the `CERTIFIED_MANUFACTURER` role, allowing their devices to register on the platform.

## Quick Start

```bash
npm install
npx hardhat node
npx hardhat run device-certification/scripts/deploy.js --network localhost
```

## Certification Flow

```javascript
// 1. Admin grants VOTER_ROLE to community members
await cert.grantRole(VOTER_ROLE, voterAddress);

// 2. Voter proposes a manufacturer
await cert.proposeCertification(
  manufacturerAddress,
  "Acme Sensors Inc.",
  "ipfs://QmSpecDocument"  // Link to specs + audit report
);

// 3. Voters vote during the voting period
await cert.connect(voter1).vote(1, true);   // For
await cert.connect(voter2).vote(1, true);   // For
await cert.connect(voter3).vote(1, false);  // Against

// 4. After voting period, anyone finalizes
await cert.finalize(1);
// If votesFor/(votesFor+votesAgainst) >= 50%: APPROVED
// Manufacturer receives CERTIFIED_MANUFACTURER role

// 5. Check certification status
await cert.isCertified(manufacturerAddress); // true

// 6. Revoke if quality degrades
await cert.revokeManufacturer(manufacturerAddress, "Failed quality audit Q3 2024");
```

## Key Functions

| Function | Who | Description |
|----------|-----|-------------|
| `proposeCertification(addr, name, uri)` | Voter | Propose new manufacturer |
| `vote(proposalId, inFavor)` | Voter | Cast vote |
| `finalize(proposalId)` | Anyone | Tally votes after deadline |
| `revokeManufacturer(addr, reason)` | Admin | Remove certification |
| `isCertified(addr)` | Anyone (free) | Check status |
| `certifiedCount()` | Anyone (free) | Total certified manufacturers |

## Related

- [Platform Governance](../platform-governance/) — Full Governor for protocol-level decisions
- [Cold Chain](../cold-chain/) — Devices that manufacturers produce
