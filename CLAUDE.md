# NextGen-Economy - Claude Code Context

## Project Overview

**NextGen-Economy** is a general-purpose Web3 platform built by Cloud Creations LLC. It uses OpenZeppelin-based Solidity smart contracts deployed on AWS serverless infrastructure.

### Tech Stack
- **Smart Contracts**: Solidity with OpenZeppelin libraries
- **Development Framework**: Hardhat (preferred over Truffle for modern development)
- **Cloud**: AWS (Lambda, API Gateway, DynamoDB, S3, CloudFormation)
- **Architecture**: Serverless — no persistent servers for the backend API layer
- **Frontend**: Web-based (React or Vue.js) connecting via ethers.js/web3.js
- **Testing**: Hardhat test runner with Chai assertions, Solidity coverage

### Reference Material
This project's domain knowledge is derived from the **ethereumbook** repository ("Mastering Ethereum" by Andreas M. Antonopoulos and Gavin Wood). Key source chapters and files are indexed in `REFERENCE-INDEX.md`.

---

## Solidity & Smart Contract Patterns

### Access Control
Use OpenZeppelin's `AccessControl` or `Ownable` for permission management. The standard patterns are:

- **onlyOwner**: Restricts function calls to the contract deployer/owner
- **Role-based access**: Use `AccessControl` for multiple roles (admin, minter, pauser)
- **Function modifiers**: Solidity modifiers enforce access checks before function execution

```solidity
modifier onlyOwner() {
    require(msg.sender == owner);
    _;
}

modifier onlyVoter() {
    require(voters[msg.sender] != false);
    _;
}
```

### State Machine Pattern
Contracts that progress through phases (e.g., Registration -> Active -> Completed) should use enum-based state management:

```solidity
enum States { REGISTER, VOTE, DISPERSE, WITHDRAW }
States state;

modifier isCurrentState(States _stage) {
    require(state == _stage);
    _;
}

function goToNextState() internal {
    state = States(uint(state) + 1);
}
```

### Withdraw Pattern (Pull over Push)
Never push funds to users in loops. Instead, use a withdraw pattern where users pull their own funds. This prevents a single failing recipient from blocking all disbursements:

```solidity
// BAD: Push pattern - one failure blocks all
for (uint j = 0; j < winners.length; j++) {
    winners[j].transfer(amount);
}

// GOOD: Pull pattern - users withdraw individually
function withdraw() public {
    uint amount = pendingWithdrawals[msg.sender];
    pendingWithdrawals[msg.sender] = 0;
    msg.sender.transfer(amount);
}
```

---

## OpenZeppelin Contracts Library (v5.x)

OpenZeppelin provides battle-tested, audited smart contract libraries. **Always prefer OpenZeppelin implementations over custom code.** Install via `npm install @openzeppelin/contracts`. All imports use the `@openzeppelin/contracts/` prefix.

### Contract Modules Overview

| Module | Purpose |
|--------|---------|
| `access/` | Permission management (Ownable, AccessControl, AccessManager) |
| `token/ERC20/` | Fungible tokens and extensions |
| `token/ERC721/` | Non-fungible tokens (NFTs) and extensions |
| `token/ERC1155/` | Multi-token standard |
| `governance/` | On-chain governance (Governor, TimelockController) |
| `proxy/` | Upgradeable contract patterns (UUPS, Transparent, Beacon) |
| `utils/` | Cryptography, data structures, math, introspection |
| `interfaces/` | Standard interface definitions (IERC20, IERC721, etc.) |
| `metatx/` | Meta-transaction support (ERC2771) |

---

### Access Control

#### Ownable — Single-owner pattern
```solidity
import "@openzeppelin/contracts/access/Ownable.sol";

contract MyContract is Ownable {
    constructor() Ownable(msg.sender) {}

    function sensitiveAction() external onlyOwner {
        // only owner can call
    }
}
```
- `Ownable2Step`: Requires the new owner to explicitly accept ownership (prevents transfers to wrong address)

#### AccessControl — Role-based permissions
```solidity
import "@openzeppelin/contracts/access/AccessControl.sol";

contract MyContract is AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        // role-gated
    }
}
```
- Roles are `bytes32` identifiers. `DEFAULT_ADMIN_ROLE` (0x00) can grant/revoke all roles.
- Each role has an admin role that controls it.
- Use `AccessControlEnumerable` if you need to enumerate role members on-chain.

#### AccessManager — Centralized permission hub (v5)
For complex systems, `AccessManager` provides a single contract that manages permissions across multiple target contracts. Preferred for multi-contract deployments where roles need unified management.

---

### ERC20 Token (Fungible)

#### Basic ERC20
```solidity
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract NGEToken is ERC20 {
    constructor(uint256 initialSupply) ERC20("NextGen Economy", "NGE") {
        _mint(msg.sender, initialSupply);
    }
}
```

#### Key Extensions
| Extension | Import | Purpose |
|-----------|--------|---------|
| `ERC20Burnable` | `token/ERC20/extensions/ERC20Burnable.sol` | Allows holders to burn their tokens |
| `ERC20Pausable` | `token/ERC20/extensions/ERC20Pausable.sol` | Emergency pause on all transfers |
| `ERC20Permit` | `token/ERC20/extensions/ERC20Permit.sol` | Gasless approvals via EIP-2612 signatures |
| `ERC20Votes` | `token/ERC20/extensions/ERC20Votes.sol` | Voting power tracking with delegation and checkpoints |
| `ERC20Capped` | `token/ERC20/extensions/ERC20Capped.sol` | Hard cap on total supply |
| `ERC20FlashMint` | `token/ERC20/extensions/ERC20FlashMint.sol` | ERC-3156 flash loan support |
| `ERC20Wrapper` | `token/ERC20/extensions/ERC20Wrapper.sol` | Wrap another ERC20 (for governance tokens) |

#### Full-featured token example
```solidity
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract NGEToken is ERC20, ERC20Burnable, ERC20Pausable, ERC20Permit, ERC20Votes, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    constructor() ERC20("NextGen Economy", "NGE") ERC20Permit("NextGen Economy") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
    }

    function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    function pause() public onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() public onlyRole(PAUSER_ROLE) { _unpause(); }

    // Required overrides for multiple inheritance
    function _update(address from, address to, uint256 value)
        internal override(ERC20, ERC20Pausable, ERC20Votes)
    {
        super._update(from, to, value);
    }

    function nonces(address owner) public view override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner);
    }
}
```

#### SafeERC20 — Safe interactions with arbitrary ERC20 tokens
```solidity
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

using SafeERC20 for IERC20;
token.safeTransfer(recipient, amount);      // reverts on failure
token.safeTransferFrom(sender, recipient, amount);
token.safeIncreaseAllowance(spender, addedValue);
```
Always use `SafeERC20` when interacting with external ERC20 tokens (handles non-standard return values).

---

### ERC721 Token (Non-Fungible / NFT)

#### Basic ERC721
```solidity
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract NGECollectible is ERC721, Ownable {
    uint256 private _nextTokenId;

    constructor() ERC721("NGE Collectible", "NGEC") Ownable(msg.sender) {}

    function mint(address to) public onlyOwner returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        return tokenId;
    }
}
```

#### Key Extensions
| Extension | Purpose |
|-----------|---------|
| `ERC721Enumerable` | On-chain enumeration of tokens (tokenOfOwnerByIndex, totalSupply) |
| `ERC721URIStorage` | Per-token metadata URI storage |
| `ERC721Burnable` | Allows token owners/approved to burn tokens |
| `ERC721Pausable` | Emergency pause on all transfers |
| `ERC721Royalty` | ERC-2981 royalty standard for marketplace payments |
| `ERC721Votes` | Voting power from NFT ownership with delegation |
| `ERC721Wrapper` | Wrap another ERC721 |
| `ERC721Consecutive` | Batch minting via ERC-2309 (gas-efficient large drops) |

#### NFT with metadata and royalties
```solidity
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Royalty.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract NGECollectible is ERC721URIStorage, ERC721Royalty, Ownable {
    uint256 private _nextTokenId;

    constructor() ERC721("NGE Collectible", "NGEC") Ownable(msg.sender) {
        _setDefaultRoyalty(msg.sender, 500); // 5% royalty (basis points)
    }

    function mint(address to, string memory uri) public onlyOwner returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
        return tokenId;
    }

    // Required overrides
    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public view override(ERC721URIStorage, ERC721Royalty) returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
```

---

### ERC1155 (Multi-Token Standard)

ERC1155 supports both fungible and non-fungible tokens in a single contract. Ideal for gaming assets, mixed-use platforms, or batch operations.

```solidity
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

contract NGEItems is ERC1155 {
    uint256 public constant GOLD = 0;    // fungible
    uint256 public constant SWORD = 1;   // non-fungible (mint 1)

    constructor() ERC1155("https://api.nextgen.economy/items/{id}.json") {
        _mint(msg.sender, GOLD, 1000000, "");
        _mint(msg.sender, SWORD, 1, "");
    }
}
```
- `ERC1155Supply`: Tracks total supply per token ID
- `ERC1155Pausable`: Emergency pause
- `ERC1155Burnable`: Burn support
- Batch operations: `balanceOfBatch`, `safeBatchTransferFrom` for gas efficiency

---

### Governance (Governor)

OpenZeppelin's Governor framework enables on-chain DAO governance. It mirrors Compound's Governor Bravo design.

#### Architecture
```
[ERC20Votes Token] --> [Governor] --> [TimelockController] --> [Target Contracts]
     (voting power)      (proposals,     (enforces delay        (execute actions)
                          voting)         before execution)
```

#### Governor Setup
```solidity
import "@openzeppelin/contracts/governance/Governor.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";

contract NGEGovernor is
    Governor,
    GovernorCountingSimple,
    GovernorVotes,
    GovernorVotesQuorumFraction,
    GovernorTimelockControl
{
    constructor(IVotes token, TimelockController timelock)
        Governor("NGE Governor")
        GovernorVotes(token)
        GovernorVotesQuorumFraction(4)           // 4% quorum
        GovernorTimelockControl(timelock)
    {}

    function votingDelay() public pure override returns (uint256) { return 7200; }    // ~1 day
    function votingPeriod() public pure override returns (uint256) { return 50400; }   // ~1 week
    function proposalThreshold() public pure override returns (uint256) { return 0; }
}
```

#### Governor Extensions
| Extension | Purpose |
|-----------|---------|
| `GovernorCountingSimple` | For/Against/Abstain voting |
| `GovernorVotes` | Extracts voting weight from an ERC20Votes or ERC721Votes token |
| `GovernorVotesQuorumFraction` | Quorum as percentage of total supply |
| `GovernorTimelockControl` | Delays execution via TimelockController |
| `GovernorSettings` | Configurable voting delay, period, and proposal threshold |
| `GovernorStorage` | Store proposal details on-chain |
| `GovernorPreventLateQuorum` | Extends voting if quorum is reached near deadline |

#### TimelockController
```solidity
import "@openzeppelin/contracts/governance/TimelockController.sol";

// Deploy with: minDelay, proposers (Governor), executors (anyone or Governor)
address[] memory proposers = new address[](1);
proposers[0] = address(governor);
address[] memory executors = new address[](1);
executors[0] = address(0); // anyone can execute after delay
TimelockController timelock = new TimelockController(1 days, proposers, executors, address(0));
```

---

### Proxy & Upgradeable Contracts (Modern OZ Patterns)

OpenZeppelin provides three proxy patterns. All use `delegatecall` so the proxy holds storage while the implementation holds logic.

**Important**: Use `@openzeppelin/contracts-upgradeable` for implementation contracts (uses `initializer` instead of `constructor`).

#### UUPS Proxy (Recommended)
The upgrade logic lives in the implementation contract. Lighter-weight and cheaper to deploy.
```solidity
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract NGETokenV1 is UUPSUpgradeable, OwnableUpgradeable {
    function initialize() public initializer {
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
```

#### Transparent Proxy
Upgrade logic lives in the proxy itself (via a `ProxyAdmin` contract). The admin cannot call implementation functions (prevents selector clashing).

#### Beacon Proxy
Multiple proxies share a single beacon that points to the implementation. Upgrade the beacon to upgrade all proxies at once. Ideal for factory patterns (e.g., many identical NFT collections).

#### Upgrade Safety Rules
1. **No constructors** — Use `initializer` functions instead
2. **Storage layout must be preserved** — Never reorder, remove, or change types of existing storage variables. Only append new ones.
3. **Use storage gaps** for future-proofing base contracts: `uint256[50] private __gap;`
4. **Use the Hardhat upgrades plugin**: `@openzeppelin/hardhat-upgrades` validates storage compatibility

```bash
npm install @openzeppelin/hardhat-upgrades
```
```javascript
// In deployment script
const { ethers, upgrades } = require("hardhat");
const proxy = await upgrades.deployProxy(NGETokenV1, [], { kind: "uups" });
// Later:
await upgrades.upgradeProxy(proxy.address, NGETokenV2);
```

---

### Security Utilities

| Utility | Import | Purpose |
|---------|--------|---------|
| `ReentrancyGuard` | `utils/ReentrancyGuard.sol` | `nonReentrant` modifier prevents reentrancy attacks |
| `Pausable` | `utils/Pausable.sol` | `whenNotPaused`/`whenPaused` modifiers for emergency stop |
| `Address` | `utils/Address.sol` | Safe low-level calls (`sendValue`, `functionCall`) |
| `Math` | `utils/math/Math.sol` | Safe math operations (max, min, average, ceilDiv, sqrt) |
| `SignatureChecker` | `utils/cryptography/SignatureChecker.sol` | Verifies ECDSA + ERC-1271 (smart contract) signatures |
| `MerkleProof` | `utils/cryptography/MerkleProof.sol` | Verify Merkle tree proofs (allowlists, airdrops) |
| `EIP712` | `utils/cryptography/EIP712.sol` | Structured data hashing and signing (EIP-712) |
| `MessageHashUtils` | `utils/cryptography/MessageHashUtils.sol` | `toEthSignedMessageHash` for ECDSA recovery |
| `Nonces` | `utils/Nonces.sol` | Nonce management for replay protection |

#### ReentrancyGuard Pattern
```solidity
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract NGEMarketplace is ReentrancyGuard {
    function purchase(uint256 itemId) external payable nonReentrant {
        // Safe from reentrancy
    }
}
```

#### Merkle Proof for Allowlists
```solidity
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

bytes32 public merkleRoot;

function claim(bytes32[] calldata proof) external {
    bytes32 leaf = keccak256(abi.encodePacked(msg.sender));
    require(MerkleProof.verify(proof, merkleRoot, leaf), "Invalid proof");
    // process claim
}
```

---

### Data Structures

| Structure | Import | Purpose |
|-----------|--------|---------|
| `EnumerableSet` | `utils/structs/EnumerableSet.sol` | O(1) add/remove/contains for sets of `bytes32`, `address`, `uint256` |
| `EnumerableMap` | `utils/structs/EnumerableMap.sol` | Enumerable key-value mappings |
| `BitMaps` | `utils/structs/BitMaps.sol` | Gas-efficient bitmap storage (256 bools per slot) |
| `Checkpoints` | `utils/structs/Checkpoints.sol` | Historical value tracking (used by ERC20Votes) |
| `DoubleEndedQueue` | `utils/structs/DoubleEndedQueue.sol` | Push/pop from both ends |

---

### Meta-Transactions (Gasless UX)

`ERC2771Context` enables gasless transactions where a relayer pays gas on behalf of users:
```solidity
import "@openzeppelin/contracts/metatx/ERC2771Context.sol";

contract MyContract is ERC2771Context {
    constructor(address trustedForwarder) ERC2771Context(trustedForwarder) {}

    // Use _msgSender() instead of msg.sender — returns the original sender
    function doSomething() external {
        address user = _msgSender(); // works with both direct and relayed calls
    }
}
```

---

### OpenZeppelin Contracts Wizard

Use the **OpenZeppelin Contracts Wizard** (https://wizard.openzeppelin.com) to generate starter contracts with your desired extensions. It produces production-ready code for ERC20, ERC721, ERC1155, Governor, and custom contracts.

### Version Compatibility

| OZ Contracts Version | Solidity Version | Key Changes |
|----------------------|-----------------|-------------|
| v5.x (current) | >=0.8.20 | Namespaced storage, AccessManager, removed SafeMath |
| v4.x | >=0.8.0 | Introduced Governor, ERC20Permit, UUPS |
| v3.x | >=0.6.0 | Last version with SafeMath, Crowdsale contracts |

**Note**: Crowdsale contracts were removed in OZ v4. For token sales, build custom sale contracts using ERC20 + access control + time-based logic.

### Key OpenZeppelin Utilities (Quick Reference)
- **Ownable / Ownable2Step**: Single-owner access control
- **AccessControl**: Role-based access control with admin hierarchy
- **ReentrancyGuard**: Prevents reentrancy attacks (`nonReentrant` modifier)
- **Pausable**: Emergency stop mechanism (`whenNotPaused` modifier)
- **SafeERC20**: Safe wrappers for ERC20 token interactions
- **MerkleProof**: Allowlist verification via Merkle trees
- **EIP712 + ECDSA**: Typed structured data signing and verification
- **Governor**: Full on-chain governance framework

---

## Token Standards Reference

### ERC20 (Fungible Tokens)
Required functions:
- `totalSupply()` — Total units of token in existence
- `balanceOf(address)` — Token balance of an address
- `transfer(address, uint256)` — Transfer tokens to an address
- `transferFrom(address, address, uint256)` — Transfer on behalf of another (requires approval)
- `approve(address, uint256)` — Authorize an address to spend tokens
- `allowance(address, address)` — Remaining approved amount

Required events:
- `Transfer(address indexed from, address indexed to, uint256 value)`
- `Approval(address indexed owner, address indexed spender, uint256 value)`

Optional: `name()`, `symbol()`, `decimals()`

**Key data structures:**
```solidity
mapping(address => uint256) balances;                      // token balances
mapping(address => mapping(address => uint256)) allowed;   // approved allowances
```

### ERC721 (Non-Fungible Tokens)
Each token is unique and identified by a `tokenId`. Used for collectibles, real estate, unique digital assets.

### Token Use Cases
Tokens can represent: currency, resources, assets, access rights, equity, voting rights, collectibles, identity, attestations, or utility. Design tokens based on actual need — avoid adding tokens purely for fundraising.

---

## Upgradability Patterns

Smart contracts are immutable once deployed. Use these patterns to enable upgrades:

### Legacy Patterns (Reference)

#### Eternal Storage
Decouple data storage from logic. Deploy a storage-only contract and point logic contracts to it:
- Storage contract holds all state in generic mappings (`mapping(bytes32 => uint)`, etc.)
- Logic contract reads/writes via the storage contract
- Upgrade by deploying new logic and transferring storage ownership
- **Pro**: Simple to implement
- **Con**: Contract address changes with each upgrade

### Modern OpenZeppelin Proxy Patterns (Preferred)

For production use, prefer OpenZeppelin's proxy implementations. See the **"Proxy & Upgradeable Contracts"** section under **OpenZeppelin Contracts Library** above for UUPS, Transparent, and Beacon proxy patterns with code examples.

**Summary of options:**
- **UUPS Proxy** (Recommended): Upgrade logic in implementation contract. Cheapest to deploy.
- **Transparent Proxy**: Upgrade logic in proxy via ProxyAdmin. Admin can't call implementation.
- **Beacon Proxy**: Shared upgrade point for multiple proxy instances (factory pattern).

### Important Caveats
- Upgradability introduces a central point of failure (owner key compromise)
- Mitigate with multisig wallets or DAO governance for upgrade authorization
- Increased complexity means increased attack surface
- Always use `@openzeppelin/hardhat-upgrades` plugin to validate storage layout compatibility

---

## AWS Serverless Architecture Guide

### Architecture Overview
NextGen-Economy uses a serverless architecture on AWS to interact with Ethereum smart contracts:

```
[Frontend (S3/CloudFront)]
    |
[API Gateway]
    |
[Lambda Functions] --> [Ethereum RPC Provider (Infura/Alchemy)]
    |                        |
[DynamoDB]              [Smart Contracts on Ethereum]
    |
[S3 (asset storage)]
```

### AWS Services Used
| Service | Purpose |
|---------|---------|
| Lambda | Contract interaction logic, event processing, API handlers |
| API Gateway | REST/WebSocket API endpoints for frontend |
| DynamoDB | Off-chain state, user profiles, transaction history, caching |
| S3 | Frontend hosting, NFT metadata/assets, static files |
| CloudFront | CDN for frontend delivery |
| CloudFormation/SAM | Infrastructure as Code |
| SQS/SNS | Async event processing, notifications |
| Secrets Manager | Private key management, API keys |
| CloudWatch | Monitoring, logging, alerting |

### Lambda Functions for Contract Interaction
Lambda functions connect to Ethereum via JSON-RPC (using Infura, Alchemy, or a managed node). Key operations:
- **Read operations**: Call view/pure functions (no gas cost)
- **Write operations**: Build, sign, and send transactions (requires gas)
- **Event listening**: Process contract events for off-chain indexing

### Security Groups & Network (reference from ethereumbook AWS setup)
If running your own nodes:
| Port | Protocol | Description |
|------|----------|-------------|
| 30303 | UDP/TCP | Node discovery |
| 30301 | UDP | Boot node discovery |
| 8545 | TCP | RPC port |
| 22 | TCP | SSH |

### Serverless Framework Configuration
Use Serverless Framework or AWS SAM for deployment:
```yaml
# serverless.yml
service: nextgen-economy
provider:
  name: aws
  runtime: nodejs18.x
  region: us-east-1
  environment:
    ETH_RPC_URL: ${ssm:/nextgen/eth-rpc-url}
    CONTRACT_ADDRESS: ${ssm:/nextgen/contract-address}
```

---

## Security Checklist

Based on the ethereumbook security chapter (Ch. 9), these are critical security considerations:

### Defensive Programming Principles
1. **Minimalism/simplicity** — Less code = fewer bugs. Keep contracts minimal.
2. **Code reuse** — Use OpenZeppelin. Don't reinvent the wheel.
3. **Code quality** — Treat smart contract dev like aerospace engineering.
4. **Readability/auditability** — All contracts are public. Write clear code.
5. **Test coverage** — Test all inputs. Never assume benign input.

### Critical Vulnerabilities to Prevent

#### Reentrancy
- **Risk**: External calls can re-enter your contract before state updates
- **Prevention**: Use checks-effects-interactions pattern. Update state BEFORE external calls. Use OpenZeppelin's `ReentrancyGuard`.
```solidity
// BAD: state update after external call
require(msg.sender.call.value(amount)());
balances[msg.sender] -= amount;

// GOOD: state update before external call
balances[msg.sender] -= amount;
msg.sender.transfer(amount);
```

#### Integer Overflow/Underflow
- **Risk**: Arithmetic overflow wraps around (in Solidity <0.8.0)
- **Prevention**: Use Solidity >=0.8.0 (built-in overflow checks) or OpenZeppelin SafeMath

#### Access Control
- **Risk**: Missing or incorrect access restrictions on sensitive functions
- **Prevention**: Use `onlyOwner`, role-based modifiers, OpenZeppelin AccessControl

#### Unchecked External Calls
- **Risk**: Silent failures on `send()` or `call()`
- **Prevention**: Always check return values, prefer `transfer()` (reverts on failure)

#### Front-Running
- **Risk**: Miners/bots can see pending transactions and front-run them
- **Prevention**: Commit-reveal schemes, use private mempools where appropriate

### Pre-Deployment Checklist
- [ ] All functions have correct access modifiers
- [ ] Reentrancy guards on functions that transfer value
- [ ] No integer overflow/underflow vulnerabilities
- [ ] Events emitted for all state changes
- [ ] Emergency pause mechanism (Pausable)
- [ ] Upgrade path defined if needed
- [ ] Comprehensive test coverage (unit + integration)
- [ ] Professional audit completed
- [ ] Gas optimization reviewed

---

## DApp Architecture Patterns

### Frontend-Backend Separation
- **Backend**: Smart contracts on Ethereum handle business logic and value transfer
- **Frontend**: Web application (served from S3/CloudFront) connects to contracts via ethers.js
- **Off-chain data**: DynamoDB for data that doesn't need to be on-chain (user profiles, search indexes, transaction history)

### Data Storage Strategy
- **On-chain**: Only data that requires trustless verification (balances, ownership, approvals)
- **Off-chain (DynamoDB)**: User metadata, search indexes, cached contract state
- **Decentralized storage (IPFS/S3)**: Large files, NFT metadata, media assets

### Event-Driven Architecture
Smart contract events should drive off-chain state updates:
1. Contract emits event (Transfer, Approval, etc.)
2. Lambda function listens for events via WebSocket or polling
3. DynamoDB updated with indexed event data
4. Frontend queries DynamoDB for fast reads, blockchain for verification

---

## Development Workflow

1. Write contracts in `contracts/` using Solidity + OpenZeppelin
2. Write tests in `test/` using Hardhat
3. Run `npx hardhat test` for unit tests
4. Run `npx hardhat coverage` for coverage report
5. Deploy to testnet first (Sepolia/Goerli) via Hardhat scripts
6. Deploy serverless backend via `serverless deploy`
7. Deploy frontend to S3 + CloudFront
8. Verify contracts on Etherscan
9. Professional security audit before mainnet
10. Deploy to mainnet
