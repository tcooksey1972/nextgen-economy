# NGE Identity Platform

**Decentralized Identity, Credentials, and Skills Economy** — Part of the NextGen Economy platform by Cloud Creations LLC.

## Overview

The NGE Identity Platform enables individuals to own their identity via W3C DIDs, accumulate verifiable credentials, trade skills on a marketplace, and anchor IoT sensor data for provenance — all backed by Ethereum smart contracts and AWS serverless infrastructure.

## Modules

| Module | Contract | Purpose |
|--------|----------|---------|
| **Identity** | `DIDRegistry.sol` | W3C DID anchoring, biometric binding, controller management |
| **Credentials** | `CredentialRegistry.sol` | Verifiable Credential issuance, verification, revocation |
| **Marketplace** | `SkillsMarketplace.sol` | Skill listings, escrow engagement, pull-pattern withdrawals |
| **Sensor Data** | `SensorDataAnchor.sol` | IoT device registration, Merkle-root batch anchoring, proof verification |
| **FHIR Health** | Lambda only | Healthcare credential verification via HL7 FHIR R4 |
| **State ID** | Lambda only | Indiana BMV reference adapter for state ID validation |

## Quick Start

```bash
# Install dependencies
npm install

# Compile contracts (offline — no internet required)
node scripts/compile.js

# Start local node
npx hardhat node &

# Run tests (22 tests covering all modules + integration)
node scripts/test.js

# Deploy to testnet
npx hardhat run scripts/deploy.js --network baseSepolia
```

## Smart Contracts

- **DIDRegistry** — Abstract contract with virtual hooks for composability. `SimpleDIDRegistry` provides Ownable access control.
- **CredentialRegistry** — Uses OpenZeppelin AccessControl with `ISSUER_MANAGER_ROLE` for trusted issuer management.
- **SensorDataAnchor** — Uses AccessControl with `DEVICE_MANAGER_ROLE` and `ANCHOR_SUBMITTER_ROLE`. Merkle proof verification via OpenZeppelin `MerkleProof`.
- **SkillsMarketplace** — Pull-over-push pattern for escrow. ReentrancyGuard on all ETH-handling functions. Credential-backed verification tiers.

## AWS Serverless Backend

Deploy via SAM: `sam deploy --guided --template-file template.yaml`

| Lambda | Endpoints |
|--------|-----------|
| `identityApi` | `POST/GET/PUT/DELETE /identity/did/*`, `POST /identity/biometric/bind` |
| `credentialApi` | `POST /credentials/issue`, `GET /credentials/{id}/verify`, `POST /credentials/{id}/revoke` |
| `marketplaceApi` | `POST/GET /marketplace/listings`, `GET /marketplace/worker/{did}/reputation` |
| `sensorApi` | `POST /sensors/register`, `POST /sensors/anchor`, `GET /sensors/verify/{batchId}` |
| `fhirApi` | `POST /fhir/credentials/verify`, `POST /fhir/records/anchor` |
| `stateIdVerification` | Step Function integration — Indiana BMV reference adapter |

## Standards

- W3C DID v1.1, W3C Verifiable Credentials v2.0
- HL7 FHIR R4, ERC-5192 (Soulbound), ERC-1155, OpenID4VC
- OpenZeppelin v5.x (AccessControl, ReentrancyGuard, MerkleProof, Ownable)

## Security

- No PII on-chain — only hashes and Merkle roots
- Pull-over-push pattern for all fund disbursements
- ReentrancyGuard on all payable functions
- AccessControl for admin operations
- S3 SSE-KMS encryption for credential storage
