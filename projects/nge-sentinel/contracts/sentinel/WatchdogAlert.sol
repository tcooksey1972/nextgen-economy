// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./interfaces/IWatchdogAlert.sol";

/**
 * @title WatchdogAlert
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Abstract contract for on-chain anomaly detection. Emits events
 *         when suspicious patterns are detected during token transfers
 *         or value movements.
 *
 * This module is monitoring-only — it never reverts transactions. Alerts
 * are emitted as events and consumed by off-chain listeners (AWS Lambda
 * in the NextGen Economy architecture) for real-time notifications.
 *
 * @dev Detects two types of anomalies:
 *   1. **Large transfers**: Single transfer exceeds a configurable threshold.
 *   2. **Rapid activity**: An address sends more than N transfers within a
 *      time window, suggesting automated or malicious behavior.
 *
 * Gas efficiency:
 *   - Uses a simple counter + timestamp per address (2 storage reads/writes
 *     per check in the worst case).
 *   - No arrays, no loops, no merkle proofs.
 *
 * Composability:
 *   This contract does NOT inherit Ownable — it uses a virtual
 *   `_authorizeWatchdogAdmin()` function instead. The inheriting contract
 *   provides the access control (Ownable, AccessControl, or custom).
 *   This avoids diamond inheritance conflicts when composing with other
 *   Sentinel modules.
 *
 * Usage:
 *   contract MyToken is Ownable, ERC20, WatchdogAlert {
 *       constructor()
 *           Ownable(msg.sender)
 *           ERC20("Token", "TKN")
 *           WatchdogAlert(1000 ether, 10, 1 hours)
 *       {}
 *
 *       function _authorizeWatchdogAdmin() internal view override {
 *           _checkOwner(); // or any custom auth
 *       }
 *
 *       function _update(address from, address to, uint256 value) internal override {
 *           _watchdogCheck(from, to, value);
 *           super._update(from, to, value);
 *       }
 *   }
 */
abstract contract WatchdogAlert is IWatchdogAlert {
    // ──────────────────────────────────────────────
    //  Types
    // ──────────────────────────────────────────────

    /// @dev Tracks per-address activity for rapid-activity detection.
    struct ActivityTracker {
        uint256 count;       // Number of transfers in the current window
        uint256 windowStart; // Timestamp when the current tracking window began
    }

    // ──────────────────────────────────────────────
    //  Storage
    // ──────────────────────────────────────────────

    /// @dev Transfer amount at or above which a CRITICAL alert is emitted.
    uint256 private _largeTransferThreshold;

    /// @dev Number of transfers from one address within `_rapidActivityWindow`
    ///      that triggers a WARNING alert.
    uint256 private _rapidActivityThreshold;

    /// @dev Time window (in seconds) for counting rapid activity per address.
    uint256 private _rapidActivityWindow;

    /// @dev Per-sender activity tracking. Maps sender address to their
    ///      current activity count and window start.
    mapping(address => ActivityTracker) private _activity;

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    /**
     * @param largeTransferThreshold_ Amount threshold for large-transfer alerts.
     * @param rapidActivityThreshold_ Number of transfers to trigger rapid-activity alert.
     * @param rapidActivityWindow_ Time window (seconds) for rapid-activity tracking.
     */
    constructor(
        uint256 largeTransferThreshold_,
        uint256 rapidActivityThreshold_,
        uint256 rapidActivityWindow_
    ) {
        if (largeTransferThreshold_ == 0) revert WatchdogInvalidThreshold();
        if (rapidActivityThreshold_ == 0) revert WatchdogInvalidThreshold();
        if (rapidActivityWindow_ == 0) revert WatchdogInvalidThreshold();

        _largeTransferThreshold = largeTransferThreshold_;
        _rapidActivityThreshold = rapidActivityThreshold_;
        _rapidActivityWindow = rapidActivityWindow_;
    }

    // ──────────────────────────────────────────────
    //  View functions
    // ──────────────────────────────────────────────

    /// @inheritdoc IWatchdogAlert
    function largeTransferThreshold() external view returns (uint256) {
        return _largeTransferThreshold;
    }

    /// @inheritdoc IWatchdogAlert
    function rapidActivityThreshold() external view returns (uint256) {
        return _rapidActivityThreshold;
    }

    /// @inheritdoc IWatchdogAlert
    function rapidActivityWindow() external view returns (uint256) {
        return _rapidActivityWindow;
    }

    /// @notice Returns the current activity count for an address in its active window.
    function activityCount(address account) external view returns (uint256) {
        ActivityTracker storage t = _activity[account];
        if (block.timestamp >= t.windowStart + _rapidActivityWindow) {
            return 0;
        }
        return t.count;
    }

    // ──────────────────────────────────────────────
    //  Admin actions
    // ──────────────────────────────────────────────

    /// @notice Updates the alert thresholds.
    function setThresholds(
        uint256 newLargeTransfer,
        uint256 newRapidActivity,
        uint256 newRapidWindow
    ) external {
        _authorizeWatchdogAdmin();
        if (newLargeTransfer == 0 || newRapidActivity == 0 || newRapidWindow == 0) {
            revert WatchdogInvalidThreshold();
        }

        _largeTransferThreshold = newLargeTransfer;
        _rapidActivityThreshold = newRapidActivity;
        _rapidActivityWindow = newRapidWindow;

        emit ThresholdsUpdated(newLargeTransfer, newRapidActivity, newRapidWindow);
    }

    // ──────────────────────────────────────────────
    //  Internal functions
    // ──────────────────────────────────────────────

    /**
     * @dev Call this in your transfer/update functions to check for anomalies.
     *      Never reverts — only emits events. Safe to call on every transfer.
     *
     * @param from Sender address (address(0) for mints).
     * @param to Recipient address (address(0) for burns).
     * @param value Transfer amount.
     */
    function _watchdogCheck(address from, address to, uint256 value) internal {
        // Skip mint/burn operations
        if (from == address(0) || to == address(0)) return;

        // Check 1: Large transfer
        if (value >= _largeTransferThreshold) {
            emit WatchdogAlerted(
                Severity.CRITICAL,
                "Large transfer detected",
                from,
                to,
                value
            );
        }

        // Check 2: Rapid activity from sender
        ActivityTracker storage tracker = _activity[from];

        // Reset window if expired
        if (block.timestamp >= tracker.windowStart + _rapidActivityWindow) {
            tracker.count = 1;
            tracker.windowStart = block.timestamp;
        } else {
            tracker.count++;
        }

        if (tracker.count >= _rapidActivityThreshold) {
            emit WatchdogAlerted(
                Severity.WARNING,
                "Rapid activity detected",
                from,
                to,
                value
            );
        }
    }

    // ──────────────────────────────────────────────
    //  Virtual hooks — implement in inheriting contract
    // ──────────────────────────────────────────────

    /**
     * @dev Override this to provide access control for admin functions
     *      (setThresholds). Revert if unauthorized.
     *
     * Example: `function _authorizeWatchdogAdmin() internal view override { _checkOwner(); }`
     */
    function _authorizeWatchdogAdmin() internal virtual;
}
