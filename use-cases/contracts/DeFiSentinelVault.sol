// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title DeFiSentinelVault
 * @author Cloud Creations LLC — NextGen Economy
 * @notice USE CASE: DeFi Vault Protection
 *
 * A self-defending ETH vault that protects treasury funds from key compromise.
 * Combines four security layers in a single contract:
 *
 *   1. Dead Man Switch — Auto-pauses if the admin goes inactive for 72 hours
 *   2. Rate Limiter    — Caps withdrawals to a maximum per 24-hour window
 *   3. Break Glass     — 3-of-5 guardian multi-sig for emergency recovery
 *   4. Watchdog        — Emits on-chain alerts for large or rapid withdrawals
 *
 * SCENARIO:
 *   Your organization holds $2M in a vault. If the admin key is compromised,
 *   the rate limiter caps losses at $50K per day. The watchdog alerts your
 *   monitoring system. If no one responds in 72 hours, the dead man switch
 *   auto-pauses everything. Guardians can recover via multi-sig.
 *
 * @dev This is a self-contained use case contract. In production, import the
 *      composable modules from nge-sentinel instead.
 */
contract DeFiSentinelVault is Ownable2Step, Pausable, ReentrancyGuard {

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    event Deposited(address indexed sender, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event HeartbeatReceived(address indexed owner, uint256 nextDeadline);
    event SwitchActivated(address indexed activator, uint256 timestamp);
    event OutflowRecorded(uint256 amount, uint256 windowUsed, uint256 remaining);
    event WatchdogAlert(string severity, string message, address indexed from, address indexed to, uint256 amount);
    event EmergencyProposed(uint256 indexed proposalId, address indexed proposer, string action);
    event EmergencyApproved(uint256 indexed proposalId, address indexed guardian, uint256 approvalCount);
    event EmergencyExecuted(uint256 indexed proposalId, string action);
    event GuardianAdded(address indexed guardian);

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    error InsufficientBalance();
    error RateLimitExceeded(uint256 requested, uint256 remaining);
    error DeadlineNotReached();
    error SwitchAlreadyActivated();
    error NotGuardian();
    error AlreadyApproved();
    error ThresholdNotMet();
    error DelayNotElapsed();
    error ProposalNotActive();

    // ──────────────────────────────────────────────
    //  Dead Man Switch
    // ──────────────────────────────────────────────

    uint256 public heartbeatInterval;
    uint256 public gracePeriod;
    uint256 public lastCheckIn;
    bool public switchActivated;
    address public recoveryAddress;

    // ──────────────────────────────────────────────
    //  Rate Limiter
    // ──────────────────────────────────────────────

    uint256 public rateLimitMax;
    uint256 public rateLimitWindow;
    uint256 public windowStart;
    uint256 public windowUsed;

    // ──────────────────────────────────────────────
    //  Watchdog
    // ──────────────────────────────────────────────

    uint256 public largeTransferThreshold;
    uint256 public rapidActivityThreshold;
    uint256 public rapidActivityWindow;
    mapping(address => uint256) private _activityCount;
    mapping(address => uint256) private _activityWindowStart;

    // ──────────────────────────────────────────────
    //  Break Glass
    // ──────────────────────────────────────────────

    struct Proposal {
        string action;        // "pause", "unpause", "transfer"
        address target;       // new owner for "transfer"
        address proposer;
        uint256 approvalCount;
        uint256 thresholdMetAt;
        bool executed;
    }

    mapping(address => bool) public isGuardian;
    uint256 public guardianCount;
    uint256 public guardianThreshold;
    uint256 public emergencyDelay;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasApproved;
    uint256 public proposalCount;

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    struct Config {
        uint256 heartbeatInterval;    // e.g., 3 days
        uint256 gracePeriod;          // e.g., 1 day (total 72+24 hours before switch)
        address recoveryAddress;
        uint256 rateLimitMax;         // e.g., 50 ether (max per window)
        uint256 rateLimitWindow;      // e.g., 1 days
        address[] guardians;
        uint256 guardianThreshold;    // e.g., 3
        uint256 emergencyDelay;       // e.g., 48 hours
        uint256 largeTransferThreshold; // e.g., 10 ether
        uint256 rapidActivityThreshold; // e.g., 5 transfers
        uint256 rapidActivityWindow;    // e.g., 1 hours
    }

    constructor(Config memory cfg) Ownable(msg.sender) {
        // Dead Man Switch
        heartbeatInterval = cfg.heartbeatInterval;
        gracePeriod = cfg.gracePeriod;
        recoveryAddress = cfg.recoveryAddress;
        lastCheckIn = block.timestamp;

        // Rate Limiter
        rateLimitMax = cfg.rateLimitMax;
        rateLimitWindow = cfg.rateLimitWindow;
        windowStart = block.timestamp;

        // Watchdog
        largeTransferThreshold = cfg.largeTransferThreshold;
        rapidActivityThreshold = cfg.rapidActivityThreshold;
        rapidActivityWindow = cfg.rapidActivityWindow;

        // Break Glass
        guardianThreshold = cfg.guardianThreshold;
        emergencyDelay = cfg.emergencyDelay;
        for (uint256 i = 0; i < cfg.guardians.length; i++) {
            if (!isGuardian[cfg.guardians[i]]) {
                isGuardian[cfg.guardians[i]] = true;
                guardianCount++;
                emit GuardianAdded(cfg.guardians[i]);
            }
        }
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

        // Rate limit enforcement
        _enforceRateLimit(amount);

        // Watchdog alerting (never reverts)
        _watchdogCheck(to, amount);

        (bool success, ) = to.call{value: amount}("");
        require(success, "Transfer failed");
        emit Withdrawn(to, amount);
    }

    // ──────────────────────────────────────────────
    //  Dead Man Switch
    // ──────────────────────────────────────────────

    function switchDeadline() public view returns (uint256) {
        return lastCheckIn + heartbeatInterval + gracePeriod;
    }

    function checkIn() external onlyOwner {
        if (switchActivated) revert SwitchAlreadyActivated();
        lastCheckIn = block.timestamp;
        emit HeartbeatReceived(msg.sender, switchDeadline());
    }

    function activateSwitch() external {
        if (switchActivated) revert SwitchAlreadyActivated();
        if (block.timestamp < switchDeadline()) revert DeadlineNotReached();

        switchActivated = true;
        if (!paused()) _pause();
        _transferOwnership(recoveryAddress);
        emit SwitchActivated(msg.sender, block.timestamp);
    }

    // ──────────────────────────────────────────────
    //  Rate Limiter (internal)
    // ──────────────────────────────────────────────

    function _enforceRateLimit(uint256 amount) internal {
        if (block.timestamp >= windowStart + rateLimitWindow) {
            windowStart = block.timestamp;
            windowUsed = 0;
        }
        uint256 remaining = rateLimitMax - windowUsed;
        if (amount > remaining) revert RateLimitExceeded(amount, remaining);
        windowUsed += amount;
        emit OutflowRecorded(amount, windowUsed, rateLimitMax - windowUsed);
    }

    function currentWindowRemaining() external view returns (uint256) {
        if (block.timestamp >= windowStart + rateLimitWindow) return rateLimitMax;
        if (windowUsed >= rateLimitMax) return 0;
        return rateLimitMax - windowUsed;
    }

    // ──────────────────────────────────────────────
    //  Watchdog (internal)
    // ──────────────────────────────────────────────

    function _watchdogCheck(address to, uint256 amount) internal {
        if (amount >= largeTransferThreshold) {
            emit WatchdogAlert("CRITICAL", "Large transfer detected", address(this), to, amount);
        }

        if (block.timestamp >= _activityWindowStart[msg.sender] + rapidActivityWindow) {
            _activityCount[msg.sender] = 1;
            _activityWindowStart[msg.sender] = block.timestamp;
        } else {
            _activityCount[msg.sender]++;
        }

        if (_activityCount[msg.sender] >= rapidActivityThreshold) {
            emit WatchdogAlert("WARNING", "Rapid activity detected", address(this), to, amount);
        }
    }

    // ──────────────────────────────────────────────
    //  Break Glass
    // ──────────────────────────────────────────────

    function proposeEmergency(string calldata action, address target) external returns (uint256) {
        if (!isGuardian[msg.sender]) revert NotGuardian();

        proposalCount++;
        Proposal storage p = proposals[proposalCount];
        p.action = action;
        p.target = target;
        p.proposer = msg.sender;
        p.approvalCount = 1;
        hasApproved[proposalCount][msg.sender] = true;

        if (p.approvalCount >= guardianThreshold) {
            p.thresholdMetAt = block.timestamp;
        }

        emit EmergencyProposed(proposalCount, msg.sender, action);
        return proposalCount;
    }

    function approveEmergency(uint256 proposalId) external {
        if (!isGuardian[msg.sender]) revert NotGuardian();
        Proposal storage p = proposals[proposalId];
        if (p.executed) revert ProposalNotActive();
        if (hasApproved[proposalId][msg.sender]) revert AlreadyApproved();

        hasApproved[proposalId][msg.sender] = true;
        p.approvalCount++;

        if (p.thresholdMetAt == 0 && p.approvalCount >= guardianThreshold) {
            p.thresholdMetAt = block.timestamp;
        }

        emit EmergencyApproved(proposalId, msg.sender, p.approvalCount);
    }

    function executeEmergency(uint256 proposalId) external {
        Proposal storage p = proposals[proposalId];
        if (p.executed) revert ProposalNotActive();
        if (p.approvalCount < guardianThreshold) revert ThresholdNotMet();
        if (block.timestamp < p.thresholdMetAt + emergencyDelay) revert DelayNotElapsed();

        p.executed = true;

        bytes32 actionHash = keccak256(bytes(p.action));
        if (actionHash == keccak256("pause")) {
            _pause();
        } else if (actionHash == keccak256("unpause")) {
            _unpause();
        } else if (actionHash == keccak256("transfer")) {
            _transferOwnership(p.target);
        }

        emit EmergencyExecuted(proposalId, p.action);
    }

    // ──────────────────────────────────────────────
    //  Admin
    // ──────────────────────────────────────────────

    function unpause() external onlyOwner {
        _unpause();
    }
}
