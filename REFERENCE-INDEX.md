# NextGen-Economy - Reference Index

This document maps NextGen-Economy development topics to their source material in the **ethereumbook** repository ("Mastering Ethereum" by Andreas M. Antonopoulos and Gavin Wood).

## Core Chapters

| Topic | Source File | Key Content |
|-------|-----------|-------------|
| Ethereum fundamentals | `01what-is.asciidoc` | Blockchain components, development stages, DApp intro |
| Keys & addresses | `04keys-addresses.asciidoc` | Public/private key pairs, address derivation |
| Transactions | `06transactions.asciidoc` | Transaction structure, signing, gas |
| Solidity & smart contracts | `07smart-contracts-solidity.asciidoc` | Solidity language, contract lifecycle, data types, functions, events |
| Vyper contracts | `08smart-contracts-vyper.asciidoc` | Alternative contract language reference |
| **Security** | `09smart-contracts-security.asciidoc` | Reentrancy, overflow, access control, defensive programming (2,574 lines) |
| **Tokens (ERC20/ERC721)** | `10tokens.asciidoc` | Token standards, fungibility, ERC20 interface, token workflows |
| Oracles | `11oracles.asciidoc` | External data feeds, oracle patterns |
| **DApp architecture** | `12dapps.asciidoc` | Frontend/backend separation, data storage, IPFS, auction DApp example |
| EVM internals | `13evm.asciidoc` | Opcodes, gas costs, bytecode |
| Consensus | `14consensus.asciidoc` | Proof of Work, Proof of Stake |

## Design Patterns & Architecture

| Topic | Source File | Key Content |
|-------|-----------|-------------|
| **Smart contract design patterns** | `contrib/design-patterns.asciidoc` | Access control, state flow, fund disbursement, withdraw pattern |
| **Upgradability patterns** | `contrib/upgradability-patterns.asciidoc` | Eternal Storage, Proxy libraries, delegatecall |
| Scaling solutions | `contrib/scaling.asciidoc` | Layer 2, state channels |
| Governance | `contrib/governance.asciidoc` | On-chain governance mechanisms |

## AWS & Cloud Deployment

| Topic | Source File | Key Content |
|-------|-----------|-------------|
| AWS introduction | `contrib/aws-setup.asciidoc` | Prerequisites, high-level steps |
| **AWS network setup** | `contrib/aws-network-setup.asciidoc` | EC2 instances, security groups, ports, genesis config, peering |
| **AWS network operation** | `contrib/aws-network-operation.asciidoc` | Account setup, Truffle deployment, contract interaction |
| Google Cloud testnet | `contrib/google-cloud-testnet.asciidoc` | GCP alternative deployment reference |

## Code Examples

| Topic | Source Path | Key Content |
|-------|-----------|-------------|
| **OpenZeppelin token** | `code/OpenZeppelin/contracts/SampleToken.sol` | ERC20 MintableToken implementation |
| OpenZeppelin crowdsale | `code/OpenZeppelin/contracts/SampleCrowdsale.sol` | Crowdsale with PostDelivery + Minted |
| Basic Solidity | `code/Solidity/Faucet.sol` through `Faucet8.sol` | Progressive contract examples |
| **Truffle projects** | `code/truffle/` | METoken, FaucetEvents, CallExamples, ReentryAttack |
| **Auction DApp** | `code/auction_dapp/` | Full DApp: ERC721 backend (Truffle) + Vue.js frontend |
| AWS Truffle config | `code/aws/truffle.js` | Network config for private AWS network |
| Genesis block | `code/aws/genesis.json` | Private network genesis configuration |
| Web3.js examples | `code/web3js/` | Contract interaction (sync + async patterns) |
| JSON-RPC examples | `code/jsonrpc/` | HTTP, WebSocket, IPC client examples |

## OpenZeppelin Contracts Modules (v5.x)

| Module | Key Contracts | Purpose |
|--------|--------------|---------|
| `access/` | Ownable, Ownable2Step, AccessControl, AccessManager | Permission management |
| `token/ERC20/` | ERC20, ERC20Burnable, ERC20Pausable, ERC20Permit, ERC20Votes, ERC20Capped, ERC20FlashMint | Fungible tokens |
| `token/ERC20/utils/` | SafeERC20 | Safe external token interactions |
| `token/ERC721/` | ERC721, ERC721Enumerable, ERC721URIStorage, ERC721Burnable, ERC721Royalty, ERC721Votes | NFTs |
| `token/ERC1155/` | ERC1155, ERC1155Supply, ERC1155Burnable, ERC1155Pausable | Multi-token standard |
| `governance/` | Governor, GovernorCountingSimple, GovernorVotes, GovernorTimelockControl, TimelockController | On-chain DAO governance |
| `proxy/` | ERC1967Proxy, TransparentUpgradeableProxy, BeaconProxy, UUPSUpgradeable | Upgradeable contracts |
| `utils/` | ReentrancyGuard, Pausable, Address, Math | Security & math utilities |
| `utils/cryptography/` | MerkleProof, EIP712, SignatureChecker, MessageHashUtils, ECDSA | Cryptographic operations |
| `utils/structs/` | EnumerableSet, EnumerableMap, BitMaps, Checkpoints | Gas-efficient data structures |
| `metatx/` | ERC2771Context, ERC2771Forwarder | Gasless meta-transactions |
| `interfaces/` | IERC20, IERC721, IERC1155, IERC2981, IERC3156 | Standard interfaces |

## Standards & Tools

| Topic | Source File | Key Content |
|-------|-----------|-------------|
| EIP/ERC standards | `appdx-standards-eip-erc.asciidoc` | Standards reference |
| **Development tools** | `appdx-dev-tools.asciidoc` | Truffle, frameworks, testing tools (762 lines) |
| EVM opcodes & gas | `appdx-evm-opcodes-gas.asciidoc` | Opcode reference, gas costs |
| Web3.js tutorial | `appdx-web3js-tutorial.asciidoc` | Web3.js integration guide |
| Ethereum forks | `appdx-forks-history.asciidoc` | Network fork history |
| Glossary | `glossary.asciidoc` | Ethereum terminology definitions |

## Priority Reading Order for NextGen-Economy

For developers onboarding to this project, read in this order:

1. `10tokens.asciidoc` — Token standards (ERC20/ERC721) are core to the platform
2. `09smart-contracts-security.asciidoc` — Security is non-negotiable
3. `07smart-contracts-solidity.asciidoc` — Solidity fundamentals
4. `contrib/design-patterns.asciidoc` — Access control, state flow patterns
5. `contrib/upgradability-patterns.asciidoc` — Contract upgrade strategies
6. `12dapps.asciidoc` — DApp architecture patterns
7. `contrib/aws-network-setup.asciidoc` — AWS infrastructure reference
8. `code/OpenZeppelin/` — OpenZeppelin implementation examples
9. `code/auction_dapp/` — Full-stack DApp reference implementation
