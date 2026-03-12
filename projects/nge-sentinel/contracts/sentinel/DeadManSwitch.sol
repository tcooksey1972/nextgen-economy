// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./interfaces/IDeadManSwitch.sol";

/**
 * @title DeadManSwitch
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Abstract contract implementing a heartbeat-based dead man's switch.
 *
 * The contract owner must call `checkIn()` within a recurring heartbeat
 * interval. If the owner misses a heartbeat and the grace period elapses,
 * anyone can call `activateSwitch()` which:
 *   1. Pauses the contract (stops all `whenNotPaused` operations)
 *   2. Transfers ownership to the pre-configured recovery address
 *   3. Emits a `SwitchActivated` event
 *
 * Inherits Ownable2Step so ownership transfers (including recovery) require
 * the new owner to explicitly accept — preventing transfers to wrong addresses.
 *
 * Inherits Pausable so child contracts can gate functions with `whenNotPaused`.
 *
 * Usage:
 *   contract MyVault is DeadManSwitch {
 *       constructor(address recovery)
 *           Ownable(msg.sender)
 *           DeadManSwitch(30 days, 7 days, recovery)
 *       {}
 *   }
 */
abstract contract DeadManSwitch is IDeadManSwitch, Ownable2Step, Pausable {
    // ──────────────────────────────────────────────
    //  Storage
    // ──────────────────────────────────────────────

    /// @dev Required time (in seconds) between owner check-ins. If the owner
    ///      does not call `checkIn()` within this interval, the grace period
    ///      begins. Configurable via `setHeartbeatInterval()`.
    uint256 private _heartbeatInterval;

    /// @dev Additional buffer (in seconds) after a missed heartbeat before the
    ///      switch can be activated. Prevents accidental activation due to
    ///      brief owner unavailability. Configurable via `setGracePeriod()`.
    uint256 private _gracePeriod;

    /// @dev Timestamp of the owner's most recent `checkIn()` call. Initialized
    ///      to `block.timestamp` at deployment. The switch deadline is computed
    ///      as: `_lastCheckIn + _heartbeatInterval + _gracePeriod`.
    uint256 private _lastCheckIn;

    /// @dev Set to true once `activateSwitch()` executes. Irreversible — once
    ///      activated, the switch cannot be deactivated or re-triggered.
    bool private _switchActivated;

    /// @dev Address that receives ownership when the switch activates. Set at
    ///      deployment and changeable via the 2-step propose/accept pattern
    ///      (`proposeRecoveryAddress` + `acceptRecoveryAddress`).
    address private _recoveryAddress;

    /// @dev Staging address for recovery changes. Set by `proposeRecoveryAddress()`,
    ///      cleared when the proposed address calls `acceptRecoveryAddress()`.
    ///      This 2-step pattern mirrors Ownable2Step and prevents accidental
    ///      transfers to wrong addresses.
    address private _pendingRecoveryAddress;

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    /**
     * @param heartbeatInterval_ Time in seconds between required check-ins.
     * @param gracePeriod_ Additional time in seconds after a missed heartbeat
     *        before the switch can be activated.
     * @param recoveryAddress_ Address that receives ownership on activation.
     */
    constructor(
        uint256 heartbeatInterval_,
        uint256 gracePeriod_,
        address recoveryAddress_
    ) {
        if (heartbeatInterval_ == 0) revert ZeroDuration();
        if (gracePeriod_ == 0) revert ZeroDuration();
        if (recoveryAddress_ == address(0)) revert ZeroAddress();

        _heartbeatInterval = heartbeatInterval_;
        _gracePeriod = gracePeriod_;
        _recoveryAddress = recoveryAddress_;
        _lastCheckIn = block.timestamp;
    }

    // ──────────────────────────────────────────────
    //  Modifiers
    // ──────────────────────────────────────────────

    /// @dev Guards functions that must not be called after the switch has fired.
    ///      Applied to `checkIn()`, `setHeartbeatInterval()`, `setGracePeriod()`,
    ///      and `activateSwitch()` itself (prevents double-activation).
    modifier switchNotActivated() {
        if (_switchActivated) revert SwitchAlreadyActivated();
        _;
    }

    // ──────────────────────────────────────────────
    //  View functions
    // ──────────────────────────────────────────────

    function heartbeatInterval() external view returns (uint256) {
        return _heartbeatInterval;
    }

    function gracePeriod() external view returns (uint256) {
        return _gracePeriod;
    }

    function lastCheckIn() external view returns (uint256) {
        return _lastCheckIn;
    }

    /// @dev Public (not external) so child contracts and `activateSwitch()` can
    ///      call it internally without an external call overhead.
    function switchDeadline() public view returns (uint256) {
        return _lastCheckIn + _heartbeatInterval + _gracePeriod;
    }

    function isSwitchActivated() external view returns (bool) {
        return _switchActivated;
    }

    function recoveryAddress() external view returns (address) {
        return _recoveryAddress;
    }

    /// @notice Returns the pending recovery address (zero if none proposed).
    function pendingRecoveryAddress() external view returns (address) {
        return _pendingRecoveryAddress;
    }

    /// @notice Returns the number of seconds remaining before the switch
    ///         can be activated, or 0 if the deadline has passed.
    function timeRemaining() external view returns (uint256) {
        uint256 deadline = switchDeadline();
        if (block.timestamp >= deadline) return 0;
        return deadline - block.timestamp;
    }

    // ──────────────────────────────────────────────
    //  Owner actions
    // ──────────────────────────────────────────────

    /// @inheritdoc IDeadManSwitch
    function checkIn() external onlyOwner switchNotActivated {
        _lastCheckIn = block.timestamp;
        uint256 nextDeadline = switchDeadline();
        emit HeartbeatReceived(msg.sender, nextDeadline);
    }

    /// @inheritdoc IDeadManSwitch
    function proposeRecoveryAddress(address newRecovery) external onlyOwner {
        if (newRecovery == address(0)) revert ZeroAddress();
        _pendingRecoveryAddress = newRecovery;
        emit RecoveryAddressProposed(_recoveryAddress, newRecovery);
    }

    /// @notice Allows the owner to update the heartbeat interval.
    ///         Also resets the check-in timer to prevent accidental activation.
    function setHeartbeatInterval(uint256 newInterval) external onlyOwner switchNotActivated {
        if (newInterval == 0) revert ZeroDuration();
        uint256 previous = _heartbeatInterval;
        _heartbeatInterval = newInterval;
        _lastCheckIn = block.timestamp; // reset timer on config change
        emit HeartbeatIntervalChanged(previous, newInterval);
    }

    /// @notice Allows the owner to update the grace period.
    function setGracePeriod(uint256 newGracePeriod) external onlyOwner switchNotActivated {
        if (newGracePeriod == 0) revert ZeroDuration();
        uint256 previous = _gracePeriod;
        _gracePeriod = newGracePeriod;
        emit GracePeriodChanged(previous, newGracePeriod);
    }

    // ──────────────────────────────────────────────
    //  Recovery actions
    // ──────────────────────────────────────────────

    /// @inheritdoc IDeadManSwitch
    function acceptRecoveryAddress() external {
        if (msg.sender != _pendingRecoveryAddress) revert InvalidRecoveryAcceptance();
        address previous = _recoveryAddress;
        _recoveryAddress = _pendingRecoveryAddress;
        _pendingRecoveryAddress = address(0);
        emit RecoveryAddressChanged(previous, _recoveryAddress);
    }

    // ──────────────────────────────────────────────
    //  Public actions
    // ──────────────────────────────────────────────

    /// @inheritdoc IDeadManSwitch
    function activateSwitch() external switchNotActivated {
        if (block.timestamp < switchDeadline()) revert DeadlineNotReached();

        _switchActivated = true;

        // Pause the contract — all `whenNotPaused` functions will revert.
        if (!paused()) {
            _pause();
        }

        // Transfer ownership to recovery address.
        // Uses Ownable2Step internally — the recovery address must call
        // `acceptOwnership()` to finalize.
        _transferOwnership(_recoveryAddress);

        emit SwitchActivated(msg.sender, block.timestamp);
    }

    // ──────────────────────────────────────────────
    //  Internal hook
    // ──────────────────────────────────────────────

    /**
     * @dev Called during `activateSwitch()` after pause and ownership transfer.
     *      Override in child contracts to add custom emergency logic
     *      (e.g., freeze funds, disable specific features).
     *
     *      Default implementation is a no-op.
     */
    function _onSwitchActivated() internal virtual {}
}
