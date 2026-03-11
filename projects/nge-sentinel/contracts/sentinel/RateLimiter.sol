// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./interfaces/IRateLimiter.sol";

/**
 * @title RateLimiter
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Abstract contract that caps outflows within a rolling time window.
 *
 * If an attacker compromises a privileged key or exploits a bug, they can
 * normally drain an entire contract in one transaction. RateLimiter ensures
 * only `_maxAmount` can leave per `_windowDuration`, buying the team time
 * to detect and respond.
 *
 * @dev How the window works:
 *   - The window starts at the timestamp of the first outflow (or deployment).
 *   - Each outflow call adds to `_windowUsed`.
 *   - When `block.timestamp >= _windowStart + _windowDuration`, the window
 *     resets automatically on the next outflow.
 *   - This is a "tumbling window" (resets fully), not a "sliding window"
 *     (which would require per-transaction tracking and more gas).
 *
 * Composability:
 *   This contract does NOT inherit Ownable — it uses a virtual
 *   `_authorizeRateLimitAdmin()` function instead. The inheriting contract
 *   provides the access control (Ownable, AccessControl, or custom).
 *   This avoids diamond inheritance conflicts when composing with other
 *   Sentinel modules.
 *
 * Usage:
 *   contract MyTreasury is Ownable, RateLimiter {
 *       constructor()
 *           Ownable(msg.sender)
 *           RateLimiter(100 ether, 24 hours)
 *       {}
 *
 *       function _authorizeRateLimitAdmin() internal view override {
 *           _checkOwner(); // or any custom auth
 *       }
 *
 *       function withdraw(uint256 amount) external onlyOwner {
 *           _enforceRateLimit(amount);
 *           // ... transfer logic
 *       }
 *   }
 */
abstract contract RateLimiter is IRateLimiter {
    // ──────────────────────────────────────────────
    //  Storage
    // ──────────────────────────────────────────────

    /// @dev Maximum outflow amount allowed within a single window.
    uint256 private _maxAmount;

    /// @dev Duration of each rate limit window in seconds.
    uint256 private _windowDuration;

    /// @dev Timestamp when the current window began.
    uint256 private _windowStart;

    /// @dev Cumulative outflow in the current window. Resets when the
    ///      window rolls over.
    uint256 private _windowUsed;

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    /**
     * @param maxAmount_ Maximum outflow per window (in wei or token units).
     * @param windowDuration_ Window length in seconds (e.g., 24 hours = 86400).
     */
    constructor(uint256 maxAmount_, uint256 windowDuration_) {
        if (maxAmount_ == 0) revert ZeroMaxAmount();
        if (windowDuration_ == 0) revert ZeroWindowDuration();

        _maxAmount = maxAmount_;
        _windowDuration = windowDuration_;
        _windowStart = block.timestamp;
    }

    // ──────────────────────────────────────────────
    //  View functions
    // ──────────────────────────────────────────────

    /// @inheritdoc IRateLimiter
    function rateLimitMax() external view returns (uint256) {
        return _maxAmount;
    }

    /// @inheritdoc IRateLimiter
    function rateLimitWindow() external view returns (uint256) {
        return _windowDuration;
    }

    /// @inheritdoc IRateLimiter
    function windowStart() external view returns (uint256) {
        return _windowStart;
    }

    /// @inheritdoc IRateLimiter
    function currentWindowUsage() external view returns (uint256) {
        if (_isWindowExpired()) return 0;
        return _windowUsed;
    }

    /// @inheritdoc IRateLimiter
    function currentWindowRemaining() external view returns (uint256) {
        if (_isWindowExpired()) return _maxAmount;
        if (_windowUsed >= _maxAmount) return 0;
        return _maxAmount - _windowUsed;
    }

    // ──────────────────────────────────────────────
    //  Admin actions
    // ──────────────────────────────────────────────

    /// @notice Updates the rate limit configuration.
    /// @dev Does NOT reset the current window — existing usage carries over.
    function setRateLimit(uint256 newMax, uint256 newWindow) external {
        _authorizeRateLimitAdmin();
        if (newMax == 0) revert ZeroMaxAmount();
        if (newWindow == 0) revert ZeroWindowDuration();

        uint256 prevMax = _maxAmount;
        uint256 prevWindow = _windowDuration;
        _maxAmount = newMax;
        _windowDuration = newWindow;

        emit RateLimitChanged(prevMax, newMax, prevWindow, newWindow);
    }

    /// @notice Resets the current window usage to zero.
    /// @dev Use after an emergency pause/resolution to restore full capacity.
    function resetRateLimit() external {
        _authorizeRateLimitAdmin();
        _windowUsed = 0;
        _windowStart = block.timestamp;
        emit RateLimitReset(msg.sender);
    }

    // ──────────────────────────────────────────────
    //  Internal functions
    // ──────────────────────────────────────────────

    /**
     * @dev Call this in your withdraw/transfer functions to enforce the rate limit.
     *      Reverts with `RateLimitExceeded` if the amount would exceed the window cap.
     *      Automatically rolls over to a new window if the current one has expired.
     *
     * @param amount The outflow amount to check and record.
     */
    function _enforceRateLimit(uint256 amount) internal {
        if (_isWindowExpired()) {
            _windowStart = block.timestamp;
            _windowUsed = 0;
        }

        uint256 remaining = _maxAmount - _windowUsed;
        if (amount > remaining) {
            revert RateLimitExceeded(amount, remaining);
        }

        _windowUsed += amount;
        emit OutflowRecorded(amount, _windowUsed, _maxAmount - _windowUsed);
    }

    /**
     * @dev Returns true if the current window has expired.
     */
    function _isWindowExpired() internal view returns (bool) {
        return block.timestamp >= _windowStart + _windowDuration;
    }

    /**
     * @dev Override this to provide access control for admin functions
     *      (setRateLimit, resetRateLimit). Revert if unauthorized.
     *
     * Example: `function _authorizeRateLimitAdmin() internal view override { _checkOwner(); }`
     */
    function _authorizeRateLimitAdmin() internal virtual;
}
