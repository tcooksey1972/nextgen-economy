// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./interfaces/IBreakGlass.sol";

/**
 * @title BreakGlass
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Abstract contract providing multi-sig emergency recovery with
 *         mandatory timelock delay.
 *
 * Guardians (separate from the contract owner) can propose emergency actions.
 * Once enough guardians approve (meeting the threshold), a mandatory delay
 * must pass before anyone can execute the action. This ensures:
 *   - No single compromised guardian can trigger an emergency
 *   - Even in emergencies, there's a minimum cooling period
 *   - All actions are transparent and emit events for monitoring
 *
 * @dev Supported emergency actions:
 *   - PAUSE: Calls the virtual `_breakGlassPause()` hook
 *   - UNPAUSE: Calls the virtual `_breakGlassUnpause()` hook
 *   - TRANSFER_OWNERSHIP: Calls the virtual `_breakGlassTransferOwnership(target)` hook
 *
 * Composability:
 *   This contract does NOT inherit Ownable or Pausable — it uses virtual hooks
 *   that the inheriting contract implements. This avoids diamond inheritance
 *   conflicts when composing with other Sentinel modules.
 *
 * Usage:
 *   contract MyProtocol is Ownable, Pausable, BreakGlass {
 *       constructor(address[] memory guardians)
 *           Ownable(msg.sender)
 *           BreakGlass(guardians, 2, 1 hours)
 *       {}
 *
 *       function _authorizeBreakGlassAdmin() internal view override { _checkOwner(); }
 *       function _breakGlassPause() internal override { _pause(); }
 *       function _breakGlassUnpause() internal override { _unpause(); }
 *       function _breakGlassTransferOwnership(address t) internal override { _transferOwnership(t); }
 *   }
 */
abstract contract BreakGlass is IBreakGlass {
    // ──────────────────────────────────────────────
    //  Types
    // ──────────────────────────────────────────────

    /// @dev Internal representation of a proposal.
    struct Proposal {
        EmergencyAction action;
        address target;
        address proposer;
        uint256 approvalCount;
        uint256 thresholdMetAt;
        bool executed;
        bool cancelled;
    }

    // ──────────────────────────────────────────────
    //  Storage
    // ──────────────────────────────────────────────

    /// @dev Number of guardian approvals required to execute a proposal.
    uint256 private _threshold;

    /// @dev Mandatory seconds to wait after threshold is met before execution.
    uint256 private _executionDelay;

    /// @dev Set of guardian addresses. Uses mapping for O(1) lookup.
    mapping(address => bool) private _guardians;

    /// @dev Total number of registered guardians.
    uint256 private _guardianCount;

    /// @dev All proposals, indexed by proposal ID (starting at 1).
    mapping(uint256 => Proposal) private _proposals;

    /// @dev Tracks which guardians have approved which proposals.
    mapping(uint256 => mapping(address => bool)) private _approvals;

    /// @dev Counter for proposal IDs. Starts at 1.
    uint256 private _proposalCount;

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    /**
     * @param guardians_ Initial set of guardian addresses.
     * @param threshold_ Number of approvals required (must be <= guardians_.length).
     * @param executionDelay_ Mandatory delay in seconds after threshold is met.
     */
    constructor(
        address[] memory guardians_,
        uint256 threshold_,
        uint256 executionDelay_
    ) {
        if (executionDelay_ == 0) revert ZeroDelay();

        for (uint256 i = 0; i < guardians_.length; i++) {
            if (guardians_[i] == address(0)) revert BreakGlassZeroAddress();
            if (!_guardians[guardians_[i]]) {
                _guardians[guardians_[i]] = true;
                _guardianCount++;
                emit GuardianAdded(guardians_[i]);
            }
        }

        if (threshold_ == 0 || threshold_ > _guardianCount) revert InvalidThreshold();

        _threshold = threshold_;
        _executionDelay = executionDelay_;
    }

    // ──────────────────────────────────────────────
    //  Modifiers
    // ──────────────────────────────────────────────

    modifier onlyGuardian() {
        if (!_guardians[msg.sender]) revert NotGuardian();
        _;
    }

    // ──────────────────────────────────────────────
    //  View functions
    // ──────────────────────────────────────────────

    /// @inheritdoc IBreakGlass
    function threshold() external view returns (uint256) {
        return _threshold;
    }

    /// @inheritdoc IBreakGlass
    function executionDelay() external view returns (uint256) {
        return _executionDelay;
    }

    /// @inheritdoc IBreakGlass
    function isGuardian(address account) external view returns (bool) {
        return _guardians[account];
    }

    /// @inheritdoc IBreakGlass
    function guardianCount() external view returns (uint256) {
        return _guardianCount;
    }

    /// @inheritdoc IBreakGlass
    function proposalCount() external view returns (uint256) {
        return _proposalCount;
    }

    /// @notice Returns the details of a proposal.
    function getProposal(uint256 proposalId) external view returns (
        EmergencyAction action,
        address target,
        address proposer,
        uint256 approvalCount,
        uint256 thresholdMetAt,
        bool executed,
        bool cancelled
    ) {
        Proposal storage p = _proposals[proposalId];
        return (p.action, p.target, p.proposer, p.approvalCount, p.thresholdMetAt, p.executed, p.cancelled);
    }

    /// @notice Returns true if the given guardian has approved the given proposal.
    function hasApproved(uint256 proposalId, address guardian) external view returns (bool) {
        return _approvals[proposalId][guardian];
    }

    // ──────────────────────────────────────────────
    //  Guardian actions
    // ──────────────────────────────────────────────

    /// @notice Proposes an emergency action. Proposer's approval is counted automatically.
    function proposeEmergency(EmergencyAction action, address target)
        external
        onlyGuardian
        returns (uint256 proposalId)
    {
        if (action == EmergencyAction.TRANSFER_OWNERSHIP && target == address(0)) {
            revert BreakGlassZeroAddress();
        }

        _proposalCount++;
        proposalId = _proposalCount;

        Proposal storage p = _proposals[proposalId];
        p.action = action;
        p.target = target;
        p.proposer = msg.sender;
        p.approvalCount = 1;
        _approvals[proposalId][msg.sender] = true;

        if (p.approvalCount >= _threshold) {
            p.thresholdMetAt = block.timestamp;
        }

        uint256 executeAfter = p.thresholdMetAt > 0
            ? p.thresholdMetAt + _executionDelay
            : 0;

        emit EmergencyProposed(proposalId, msg.sender, action, target, executeAfter);
    }

    /// @notice Approves an existing emergency proposal.
    function approveEmergency(uint256 proposalId) external onlyGuardian {
        Proposal storage p = _proposals[proposalId];
        if (p.executed || p.cancelled) revert ProposalNotActive();
        if (_approvals[proposalId][msg.sender]) revert AlreadyApproved();

        _approvals[proposalId][msg.sender] = true;
        p.approvalCount++;

        if (p.thresholdMetAt == 0 && p.approvalCount >= _threshold) {
            p.thresholdMetAt = block.timestamp;
        }

        emit EmergencyApproved(proposalId, msg.sender, p.approvalCount);
    }

    /// @notice Executes an approved emergency action after the delay has elapsed.
    function executeEmergency(uint256 proposalId) external {
        Proposal storage p = _proposals[proposalId];
        if (p.executed || p.cancelled) revert ProposalNotActive();
        if (p.approvalCount < _threshold) revert ThresholdNotMet();
        if (block.timestamp < p.thresholdMetAt + _executionDelay) revert DelayNotElapsed();

        p.executed = true;

        if (p.action == EmergencyAction.PAUSE) {
            _breakGlassPause();
        } else if (p.action == EmergencyAction.UNPAUSE) {
            _breakGlassUnpause();
        } else if (p.action == EmergencyAction.TRANSFER_OWNERSHIP) {
            _breakGlassTransferOwnership(p.target);
        }

        emit EmergencyExecuted(proposalId, p.action, msg.sender);
    }

    /// @notice Cancels a proposal. Callable by the original proposer or an admin.
    function cancelEmergency(uint256 proposalId) external {
        Proposal storage p = _proposals[proposalId];
        if (p.executed || p.cancelled) revert ProposalNotActive();

        // Allow proposer or admin to cancel
        if (msg.sender != p.proposer) {
            _authorizeBreakGlassAdmin();
        }

        p.cancelled = true;
        emit EmergencyCancelled(proposalId, msg.sender);
    }

    // ──────────────────────────────────────────────
    //  Admin actions — Guardian management
    // ──────────────────────────────────────────────

    /// @notice Adds a new guardian.
    function addGuardian(address guardian) external {
        _authorizeBreakGlassAdmin();
        if (guardian == address(0)) revert BreakGlassZeroAddress();
        if (!_guardians[guardian]) {
            _guardians[guardian] = true;
            _guardianCount++;
            emit GuardianAdded(guardian);
        }
    }

    /// @notice Removes a guardian. Reverts if it would make threshold impossible.
    function removeGuardian(address guardian) external {
        _authorizeBreakGlassAdmin();
        if (_guardians[guardian]) {
            if (_guardianCount - 1 < _threshold) revert InvalidThreshold();
            _guardians[guardian] = false;
            _guardianCount--;
            emit GuardianRemoved(guardian);
        }
    }

    /// @notice Updates the approval threshold.
    function setThreshold(uint256 newThreshold) external {
        _authorizeBreakGlassAdmin();
        if (newThreshold == 0 || newThreshold > _guardianCount) revert InvalidThreshold();
        _threshold = newThreshold;
    }

    // ──────────────────────────────────────────────
    //  Virtual hooks — implement in inheriting contract
    // ──────────────────────────────────────────────

    /// @dev Override to provide access control for admin functions.
    function _authorizeBreakGlassAdmin() internal virtual;

    /// @dev Override to pause the contract (e.g., call Pausable._pause()).
    function _breakGlassPause() internal virtual;

    /// @dev Override to unpause the contract (e.g., call Pausable._unpause()).
    function _breakGlassUnpause() internal virtual;

    /// @dev Override to transfer ownership (e.g., call Ownable._transferOwnership()).
    function _breakGlassTransferOwnership(address newOwner) internal virtual;
}
