// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title IBreakGlass
 * @notice Interface for an emergency recovery mechanism with multi-sig
 *         guardian approval and mandatory timelock delay.
 *
 * Guardians propose emergency actions. Once the approval threshold is met,
 * a mandatory delay must pass before execution. This prevents both panic
 * decisions and single-point-of-failure compromises.
 */
interface IBreakGlass {
    // ──────────────────────────────────────────────
    //  Enums
    // ──────────────────────────────────────────────

    /// @notice Types of emergency actions that can be proposed.
    enum EmergencyAction {
        PAUSE,              // Pause the contract (Pausable._pause)
        UNPAUSE,            // Unpause the contract
        TRANSFER_OWNERSHIP  // Transfer ownership to the action's target address
    }

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    /// @notice Emitted when a guardian proposes an emergency action.
    event EmergencyProposed(
        uint256 indexed proposalId,
        address indexed proposer,
        EmergencyAction action,
        address target,
        uint256 executeAfter
    );

    /// @notice Emitted when a guardian approves an existing proposal.
    event EmergencyApproved(uint256 indexed proposalId, address indexed approver, uint256 approvalCount);

    /// @notice Emitted when an emergency action is executed after reaching threshold + delay.
    event EmergencyExecuted(uint256 indexed proposalId, EmergencyAction action, address indexed executor);

    /// @notice Emitted when a proposal is cancelled by its proposer or the owner.
    event EmergencyCancelled(uint256 indexed proposalId, address indexed cancelledBy);

    /// @notice Emitted when a guardian is added.
    event GuardianAdded(address indexed guardian);

    /// @notice Emitted when a guardian is removed.
    event GuardianRemoved(address indexed guardian);

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    /// @notice Caller is not a registered guardian.
    error NotGuardian();

    /// @notice Guardian has already approved this proposal.
    error AlreadyApproved();

    /// @notice Proposal has not yet reached the required approval threshold.
    error ThresholdNotMet();

    /// @notice The mandatory delay has not elapsed since threshold was reached.
    error DelayNotElapsed();

    /// @notice The proposal has already been executed or cancelled.
    error ProposalNotActive();

    /// @notice The provided threshold is invalid (zero or exceeds guardian count).
    error InvalidThreshold();

    /// @notice The provided address is the zero address.
    error BreakGlassZeroAddress();

    /// @notice The provided delay is zero.
    error ZeroDelay();

    // ──────────────────────────────────────────────
    //  Views
    // ──────────────────────────────────────────────

    /// @notice Returns the number of approvals required to execute an action.
    function threshold() external view returns (uint256);

    /// @notice Returns the mandatory delay (in seconds) after threshold is met.
    function executionDelay() external view returns (uint256);

    /// @notice Returns true if the given address is a registered guardian.
    function isGuardian(address account) external view returns (bool);

    /// @notice Returns the total number of guardians.
    function guardianCount() external view returns (uint256);

    /// @notice Returns the total number of proposals created.
    function proposalCount() external view returns (uint256);
}
