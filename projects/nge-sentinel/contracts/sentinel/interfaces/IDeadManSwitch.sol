// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title IDeadManSwitch
 * @notice Interface for a heartbeat-based dead man's switch.
 *
 * The owner must call `checkIn()` within a recurring heartbeat interval.
 * If the heartbeat is missed and a grace period elapses, anyone can
 * call `activateSwitch()` to trigger the emergency response.
 */
interface IDeadManSwitch {
    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    /// @notice Emitted when the owner checks in, resetting the heartbeat timer.
    event HeartbeatReceived(address indexed owner, uint256 nextDeadline);

    /// @notice Emitted when the dead man's switch is activated.
    event SwitchActivated(address indexed activatedBy, uint256 timestamp);

    /// @notice Emitted when the recovery address is updated (step 1: proposed).
    event RecoveryAddressProposed(address indexed current, address indexed proposed);

    /// @notice Emitted when the recovery address change is accepted (step 2).
    event RecoveryAddressChanged(address indexed previous, address indexed current);

    /// @notice Emitted when the heartbeat interval is updated.
    event HeartbeatIntervalChanged(uint256 previous, uint256 current);

    /// @notice Emitted when the grace period is updated.
    event GracePeriodChanged(uint256 previous, uint256 current);

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    /// @notice The switch has already been activated.
    error SwitchAlreadyActivated();

    /// @notice The deadline + grace period has not yet elapsed.
    error DeadlineNotReached();

    /// @notice The proposed recovery address does not match the caller.
    error InvalidRecoveryAcceptance();

    /// @notice The provided address is the zero address.
    error ZeroAddress();

    /// @notice The provided duration is zero.
    error ZeroDuration();

    // ──────────────────────────────────────────────
    //  Views
    // ──────────────────────────────────────────────

    /// @notice Returns the heartbeat interval in seconds.
    function heartbeatInterval() external view returns (uint256);

    /// @notice Returns the grace period in seconds.
    function gracePeriod() external view returns (uint256);

    /// @notice Returns the timestamp of the last check-in.
    function lastCheckIn() external view returns (uint256);

    /// @notice Returns the timestamp at which the switch can be activated
    ///         (lastCheckIn + heartbeatInterval + gracePeriod).
    function switchDeadline() external view returns (uint256);

    /// @notice Returns true if the switch has been activated.
    function isSwitchActivated() external view returns (bool);

    /// @notice Returns the recovery address that will receive ownership.
    function recoveryAddress() external view returns (address);

    // ──────────────────────────────────────────────
    //  Owner actions
    // ──────────────────────────────────────────────

    /// @notice Resets the heartbeat timer. Only callable by the owner.
    function checkIn() external;

    /// @notice Proposes a new recovery address (2-step change).
    function proposeRecoveryAddress(address newRecovery) external;

    // ──────────────────────────────────────────────
    //  Recovery actions
    // ──────────────────────────────────────────────

    /// @notice Accepts the proposed recovery address. Callable by the proposed address.
    function acceptRecoveryAddress() external;

    // ──────────────────────────────────────────────
    //  Public actions
    // ──────────────────────────────────────────────

    /// @notice Activates the dead man's switch. Callable by anyone once the
    ///         deadline + grace period has passed.
    function activateSwitch() external;
}
