// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title IWatchdogAlert
 * @notice Interface for on-chain anomaly detection. Emits events when
 *         suspicious patterns are detected (large transfers, rapid activity).
 *
 * WatchdogAlert is monitoring-only — it does NOT block transactions.
 * Events are designed to be consumed by off-chain listeners (AWS Lambda,
 * The Graph, etc.) for real-time alerting.
 */
interface IWatchdogAlert {
    // ──────────────────────────────────────────────
    //  Enums
    // ──────────────────────────────────────────────

    /// @notice Severity levels for watchdog alerts.
    enum Severity {
        INFO,       // Notable but not concerning
        WARNING,    // Unusual pattern detected
        CRITICAL    // Highly suspicious, likely requires action
    }

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    /// @notice Emitted when an anomaly is detected.
    event WatchdogAlerted(
        Severity severity,
        string reason,
        address indexed from,
        address indexed to,
        uint256 value
    );

    /// @notice Emitted when alert thresholds are updated.
    event ThresholdsUpdated(
        uint256 largeTransferThreshold,
        uint256 rapidActivityThreshold,
        uint256 rapidActivityWindow
    );

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    /// @notice A threshold value is invalid (zero).
    error WatchdogInvalidThreshold();

    // ──────────────────────────────────────────────
    //  Views
    // ──────────────────────────────────────────────

    /// @notice Returns the transfer size that triggers a large-transfer alert.
    function largeTransferThreshold() external view returns (uint256);

    /// @notice Returns the number of transfers from one address that triggers a rapid-activity alert.
    function rapidActivityThreshold() external view returns (uint256);

    /// @notice Returns the time window (seconds) for counting rapid activity.
    function rapidActivityWindow() external view returns (uint256);
}
