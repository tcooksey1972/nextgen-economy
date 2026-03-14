// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title RecoverableVault
 * @author Cloud Creations LLC — NextGen Economy
 * @notice USE CASE: Emergency Key Rotation
 *
 * Demonstrates the BreakGlass pattern — a multi-sig guardian system
 * that can recover a contract when the owner's key is lost, compromised,
 * or held by a departing employee.
 *
 * SCENARIO:
 *   The sole owner of a production vault loses their hardware wallet.
 *   Five pre-designated guardians (board members, legal counsel, backup)
 *   propose a new owner. If 3 of 5 approve, the proposal enters a 48-hour
 *   timelock. After the delay, ownership transfers on-chain.
 *
 * Features:
 *   - N-of-M guardian multi-sig (configurable threshold)
 *   - Mandatory timelock delay between approval and execution
 *   - Full proposal lifecycle: propose, approve, execute, cancel
 *   - Emergency pause capability
 *   - Complete on-chain audit trail
 */
contract RecoverableVault is Ownable, Pausable, ReentrancyGuard {

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    event Deposited(address indexed sender, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event RecoveryProposed(uint256 indexed proposalId, address indexed proposer, address indexed newOwner);
    event RecoveryApproved(uint256 indexed proposalId, address indexed guardian, uint256 approvalCount);
    event RecoveryExecuted(uint256 indexed proposalId, address indexed newOwner);
    event RecoveryCancelled(uint256 indexed proposalId);
    event PauseProposed(uint256 indexed proposalId, address indexed proposer);
    event GuardianAdded(address indexed guardian);
    event GuardianRemoved(address indexed guardian);

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    error NotGuardian();
    error AlreadyApproved();
    error ThresholdNotMet();
    error DelayNotElapsed();
    error ProposalNotActive();
    error InsufficientBalance();
    error InvalidThreshold();

    // ──────────────────────────────────────────────
    //  Types
    // ──────────────────────────────────────────────

    enum ProposalType { TRANSFER_OWNERSHIP, PAUSE, UNPAUSE }

    struct Proposal {
        ProposalType action;
        address target;       // New owner for TRANSFER_OWNERSHIP
        address proposer;
        uint256 approvalCount;
        uint256 thresholdMetAt;
        bool executed;
        bool cancelled;
    }

    // ──────────────────────────────────────────────
    //  Storage
    // ──────────────────────────────────────────────

    mapping(address => bool) public isGuardian;
    uint256 public guardianCount;
    uint256 public threshold;
    uint256 public executionDelay;

    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasApproved;
    uint256 public proposalCount;

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    constructor(
        address[] memory guardians_,
        uint256 threshold_,
        uint256 executionDelay_
    ) Ownable(msg.sender) {
        for (uint256 i = 0; i < guardians_.length; i++) {
            if (!isGuardian[guardians_[i]]) {
                isGuardian[guardians_[i]] = true;
                guardianCount++;
                emit GuardianAdded(guardians_[i]);
            }
        }
        if (threshold_ == 0 || threshold_ > guardianCount) revert InvalidThreshold();
        threshold = threshold_;
        executionDelay = executionDelay_;
    }

    // ──────────────────────────────────────────────
    //  Deposit / Withdraw
    // ──────────────────────────────────────────────

    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    function withdraw(address payable to, uint256 amount)
        external
        onlyOwner
        whenNotPaused
        nonReentrant
    {
        if (amount > address(this).balance) revert InsufficientBalance();
        (bool success, ) = to.call{value: amount}("");
        require(success, "Transfer failed");
        emit Withdrawn(to, amount);
    }

    // ──────────────────────────────────────────────
    //  Guardian Proposal Workflow
    // ──────────────────────────────────────────────

    modifier onlyGuardian() {
        if (!isGuardian[msg.sender]) revert NotGuardian();
        _;
    }

    function proposeRecovery(address newOwner) external onlyGuardian returns (uint256) {
        proposalCount++;
        Proposal storage p = proposals[proposalCount];
        p.action = ProposalType.TRANSFER_OWNERSHIP;
        p.target = newOwner;
        p.proposer = msg.sender;
        p.approvalCount = 1;
        hasApproved[proposalCount][msg.sender] = true;

        if (p.approvalCount >= threshold) {
            p.thresholdMetAt = block.timestamp;
        }

        emit RecoveryProposed(proposalCount, msg.sender, newOwner);
        return proposalCount;
    }

    function proposePause() external onlyGuardian returns (uint256) {
        proposalCount++;
        Proposal storage p = proposals[proposalCount];
        p.action = ProposalType.PAUSE;
        p.proposer = msg.sender;
        p.approvalCount = 1;
        hasApproved[proposalCount][msg.sender] = true;

        if (p.approvalCount >= threshold) {
            p.thresholdMetAt = block.timestamp;
        }

        emit PauseProposed(proposalCount, msg.sender);
        return proposalCount;
    }

    function approve(uint256 proposalId) external onlyGuardian {
        Proposal storage p = proposals[proposalId];
        if (p.executed || p.cancelled) revert ProposalNotActive();
        if (hasApproved[proposalId][msg.sender]) revert AlreadyApproved();

        hasApproved[proposalId][msg.sender] = true;
        p.approvalCount++;

        if (p.thresholdMetAt == 0 && p.approvalCount >= threshold) {
            p.thresholdMetAt = block.timestamp;
        }

        emit RecoveryApproved(proposalId, msg.sender, p.approvalCount);
    }

    function execute(uint256 proposalId) external {
        Proposal storage p = proposals[proposalId];
        if (p.executed || p.cancelled) revert ProposalNotActive();
        if (p.approvalCount < threshold) revert ThresholdNotMet();
        if (block.timestamp < p.thresholdMetAt + executionDelay) revert DelayNotElapsed();

        p.executed = true;

        if (p.action == ProposalType.TRANSFER_OWNERSHIP) {
            _transferOwnership(p.target);
            emit RecoveryExecuted(proposalId, p.target);
        } else if (p.action == ProposalType.PAUSE) {
            _pause();
        } else if (p.action == ProposalType.UNPAUSE) {
            _unpause();
        }
    }

    function cancel(uint256 proposalId) external {
        Proposal storage p = proposals[proposalId];
        if (p.executed || p.cancelled) revert ProposalNotActive();
        // Proposer or owner can cancel
        require(msg.sender == p.proposer || msg.sender == owner(), "Not authorized");
        p.cancelled = true;
        emit RecoveryCancelled(proposalId);
    }

    // ──────────────────────────────────────────────
    //  Admin
    // ──────────────────────────────────────────────

    function addGuardian(address guardian) external onlyOwner {
        if (!isGuardian[guardian]) {
            isGuardian[guardian] = true;
            guardianCount++;
            emit GuardianAdded(guardian);
        }
    }

    function removeGuardian(address guardian) external onlyOwner {
        if (isGuardian[guardian]) {
            if (guardianCount - 1 < threshold) revert InvalidThreshold();
            isGuardian[guardian] = false;
            guardianCount--;
            emit GuardianRemoved(guardian);
        }
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
