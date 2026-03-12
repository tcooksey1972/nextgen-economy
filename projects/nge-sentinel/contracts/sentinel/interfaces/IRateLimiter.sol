// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title IRateLimiter
 * @notice Interface for a rolling-window rate limiter that caps outflows
 *         from a contract within a configurable time window.
 *
 * Designed to limit exploit damage: even if an attacker gains access,
 * they can only drain up to `maxAmount` per `windowDuration`.
 */
interface IRateLimiter {
    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    /// @notice Emitted when an outflow is recorded against the rate limit.
    event OutflowRecorded(uint256 amount, uint256 windowTotal, uint256 remaining);

    /// @notice Emitted when the rate limit configuration is updated.
    event RateLimitChanged(uint256 previousMax, uint256 newMax, uint256 previousWindow, uint256 newWindow);

    /// @notice Emitted when the rate limit is reset (e.g., after emergency action).
    event RateLimitReset(address indexed resetBy);

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    /// @notice The requested outflow would exceed the rate limit for this window.
    error RateLimitExceeded(uint256 requested, uint256 remaining);

    /// @notice The provided max amount is zero.
    error ZeroMaxAmount();

    /// @notice The provided window duration is zero.
    error ZeroWindowDuration();

    // ──────────────────────────────────────────────
    //  Views
    // ──────────────────────────────────────────────

    /// @notice Returns the maximum outflow amount allowed per window.
    function rateLimitMax() external view returns (uint256);

    /// @notice Returns the window duration in seconds.
    function rateLimitWindow() external view returns (uint256);

    /// @notice Returns the total amount consumed in the current window.
    function currentWindowUsage() external view returns (uint256);

    /// @notice Returns the remaining outflow capacity in the current window.
    function currentWindowRemaining() external view returns (uint256);

    /// @notice Returns the timestamp when the current window started.
    function windowStart() external view returns (uint256);
}
