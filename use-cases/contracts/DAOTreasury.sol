// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title DAOTreasury
 * @author Cloud Creations LLC — NextGen Economy
 * @notice USE CASE: DAO Treasury Governance
 *
 * A community treasury protected by rate limiting and monitoring.
 * Even if a governance attack passes a malicious proposal, the rate
 * limiter caps how much can be drained per period.
 *
 * SCENARIO:
 *   A DAO holds community funds managed by elected multi-sig holders.
 *   A flash loan governance attack tries to drain the treasury in one block.
 *   The rate limiter ensures only a small percentage can exit per period.
 *   Watchdog alerts notify community leaders who can pause the contract.
 *
 * Features:
 *   - Percentage-based rate limiting (max % of balance per window)
 *   - Heartbeat monitoring with auto-pause
 *   - Watchdog alerts for suspicious patterns
 *   - Emergency pause by owner (the DAO multi-sig)
 */
contract DAOTreasury is Ownable, Pausable, ReentrancyGuard {

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    event Deposited(address indexed sender, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount, string reason);
    event HeartbeatReceived(uint256 nextDeadline);
    event SwitchActivated(uint256 timestamp);
    event WatchdogAlert(string severity, string message, uint256 amount);
    event SpendingProposed(uint256 indexed proposalId, address indexed to, uint256 amount, string description);
    event SpendingApproved(uint256 indexed proposalId);
    event SpendingExecuted(uint256 indexed proposalId);

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    error InsufficientBalance();
    error RateLimitExceeded(uint256 requested, uint256 remaining);
    error DeadlineNotReached();
    error AlreadyActivated();
    error ProposalNotReady();

    // ──────────────────────────────────────────────
    //  Rate Limiter (percentage-based)
    // ──────────────────────────────────────────────

    uint256 public maxWithdrawBps;     // Max % of balance per window (basis points, 500 = 5%)
    uint256 public rateLimitWindow;    // Window duration in seconds
    uint256 public windowStart;
    uint256 public windowUsed;

    // ──────────────────────────────────────────────
    //  Dead Man Switch
    // ──────────────────────────────────────────────

    uint256 public heartbeatInterval;
    uint256 public lastCheckIn;
    bool public switchActivated;

    // ──────────────────────────────────────────────
    //  Watchdog
    // ──────────────────────────────────────────────

    uint256 public largeTransferThreshold;

    // ──────────────────────────────────────────────
    //  Spending Proposals
    // ──────────────────────────────────────────────

    struct SpendingProposal {
        address payable to;
        uint256 amount;
        string description;
        bool approved;
        bool executed;
        uint256 proposedAt;
    }

    mapping(uint256 => SpendingProposal) public proposals;
    uint256 public proposalCount;
    uint256 public proposalDelay;  // Time before an approved proposal can execute

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    constructor(
        uint256 _maxWithdrawBps,
        uint256 _rateLimitWindow,
        uint256 _heartbeatInterval,
        uint256 _largeTransferThreshold,
        uint256 _proposalDelay
    ) Ownable(msg.sender) {
        maxWithdrawBps = _maxWithdrawBps;
        rateLimitWindow = _rateLimitWindow;
        windowStart = block.timestamp;
        heartbeatInterval = _heartbeatInterval;
        lastCheckIn = block.timestamp;
        largeTransferThreshold = _largeTransferThreshold;
        proposalDelay = _proposalDelay;
    }

    // ──────────────────────────────────────────────
    //  Deposit
    // ──────────────────────────────────────────────

    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    // ──────────────────────────────────────────────
    //  Spending Proposal Workflow
    // ──────────────────────────────────────────────

    function proposeSpending(address payable to, uint256 amount, string calldata description)
        external
        onlyOwner
        returns (uint256)
    {
        proposalCount++;
        proposals[proposalCount] = SpendingProposal({
            to: to,
            amount: amount,
            description: description,
            approved: false,
            executed: false,
            proposedAt: block.timestamp
        });
        emit SpendingProposed(proposalCount, to, amount, description);
        return proposalCount;
    }

    function approveSpending(uint256 proposalId) external onlyOwner {
        proposals[proposalId].approved = true;
        emit SpendingApproved(proposalId);
    }

    function executeSpending(uint256 proposalId) external onlyOwner whenNotPaused nonReentrant {
        SpendingProposal storage p = proposals[proposalId];
        if (!p.approved || p.executed) revert ProposalNotReady();
        if (block.timestamp < p.proposedAt + proposalDelay) revert ProposalNotReady();
        if (p.amount > address(this).balance) revert InsufficientBalance();

        _enforceRateLimit(p.amount);
        _watchdogCheck(p.amount);

        p.executed = true;
        (bool success, ) = p.to.call{value: p.amount}("");
        require(success, "Transfer failed");
        emit SpendingExecuted(proposalId);
        emit Withdrawn(p.to, p.amount, p.description);
    }

    // ──────────────────────────────────────────────
    //  Rate Limiter
    // ──────────────────────────────────────────────

    function _enforceRateLimit(uint256 amount) internal {
        if (block.timestamp >= windowStart + rateLimitWindow) {
            windowStart = block.timestamp;
            windowUsed = 0;
        }
        uint256 maxAmount = (address(this).balance * maxWithdrawBps) / 10000;
        uint256 remaining = maxAmount > windowUsed ? maxAmount - windowUsed : 0;
        if (amount > remaining) revert RateLimitExceeded(amount, remaining);
        windowUsed += amount;
    }

    function currentWindowRemaining() external view returns (uint256) {
        if (block.timestamp >= windowStart + rateLimitWindow) {
            return (address(this).balance * maxWithdrawBps) / 10000;
        }
        uint256 maxAmount = (address(this).balance * maxWithdrawBps) / 10000;
        return maxAmount > windowUsed ? maxAmount - windowUsed : 0;
    }

    // ──────────────────────────────────────────────
    //  Dead Man Switch
    // ──────────────────────────────────────────────

    function checkIn() external onlyOwner {
        if (switchActivated) revert AlreadyActivated();
        lastCheckIn = block.timestamp;
        emit HeartbeatReceived(lastCheckIn + heartbeatInterval);
    }

    function activateSwitch() external {
        if (switchActivated) revert AlreadyActivated();
        if (block.timestamp < lastCheckIn + heartbeatInterval) revert DeadlineNotReached();
        switchActivated = true;
        if (!paused()) _pause();
        emit SwitchActivated(block.timestamp);
    }

    // ──────────────────────────────────────────────
    //  Watchdog
    // ──────────────────────────────────────────────

    function _watchdogCheck(uint256 amount) internal {
        if (amount >= largeTransferThreshold) {
            emit WatchdogAlert("CRITICAL", "Large treasury withdrawal", amount);
        }
    }

    // ──────────────────────────────────────────────
    //  Admin
    // ──────────────────────────────────────────────

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
