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

## OpenZeppelin Usage Guide

OpenZeppelin provides battle-tested, audited smart contract libraries. Always prefer OpenZeppelin implementations over custom code.

### ERC20 Token (Fungible)
```solidity
import 'openzeppelin-solidity/contracts/token/ERC20/MintableToken.sol';

contract SampleToken is MintableToken {
    string public name = "SAMPLE TOKEN";
    string public symbol = "SAM";
    uint8 public decimals = 18;
}
```

### ERC721 Token (Non-Fungible / NFT)
Use OpenZeppelin's ERC721 for unique asset tokens. Each token has a unique ID and can represent ownership of distinct items.

### Crowdsale Patterns
```solidity
import 'openzeppelin-solidity/contracts/crowdsale/emission/MintedCrowdsale.sol';
import 'openzeppelin-solidity/contracts/crowdsale/distribution/PostDeliveryCrowdsale.sol';

contract SampleCrowdsale is PostDeliveryCrowdsale, MintedCrowdsale {
    constructor(
        uint256 _openingTime, uint256 _closingTime,
        uint256 _rate, address _wallet, MintableToken _token
    ) public
        Crowdsale(_rate, _wallet, _token)
        PostDeliveryCrowdsale(_openingTime, _closingTime)
    {}
}
```

### Key OpenZeppelin Utilities
- **SafeMath**: Prevents integer overflow/underflow (built into Solidity >=0.8.0)
- **Ownable**: Single-owner access control
- **AccessControl**: Role-based access control
- **Pausable**: Emergency stop mechanism (`whenNotPaused` modifier)
- **ReentrancyGuard**: Prevents reentrancy attacks (`nonReentrant` modifier)

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

### Eternal Storage
Decouple data storage from logic. Deploy a storage-only contract and point logic contracts to it:
- Storage contract holds all state in generic mappings (`mapping(bytes32 => uint)`, etc.)
- Logic contract reads/writes via the storage contract
- Upgrade by deploying new logic and transferring storage ownership
- **Pro**: Simple to implement
- **Con**: Contract address changes with each upgrade

### Proxy Pattern
Maintain the same contract address while changing logic:
- Uses `delegatecall` to forward calls to an implementation contract
- A dispatcher contract holds the address of the current implementation
- Upgrade by pointing the dispatcher to a new implementation
- **Pro**: Address stays the same
- **Con**: More complex, requires assembly, must maintain storage layout

### Important Caveats
- Upgradability introduces a central point of failure (owner key compromise)
- Mitigate with multisig wallets or DAO governance for upgrade authorization
- Increased complexity means increased attack surface

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
