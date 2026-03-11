// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../sentinel/DeadManSwitch.sol";
import "../sentinel/RateLimiter.sol";
import "../sentinel/BreakGlass.sol";
import "../sentinel/WatchdogAlert.sol";

/**
 * @title FullSentinelVault
 * @author Cloud Creations LLC — NextGen Economy
 * @notice An ETH vault protected by ALL four Sentinel security modules.
 *
 * Demonstrates how DeadManSwitch, RateLimiter, BreakGlass, and WatchdogAlert
 * compose together in a single contract. Each module provides an independent
 * layer of protection:
 *
 *   - DeadManSwitch: Auto-pauses if the owner goes inactive
 *   - RateLimiter:   Caps withdrawal amounts per time window
 *   - BreakGlass:    Multi-sig guardians can trigger emergency actions
 *   - WatchdogAlert: Emits events on suspicious withdrawal patterns
 *
 * @dev Inheritance resolution:
 *   Only DeadManSwitch inherits Ownable2Step and Pausable. The other three
 *   modules (RateLimiter, BreakGlass, WatchdogAlert) use virtual hook
 *   functions instead of inheriting Ownable/Pausable directly, which
 *   eliminates diamond inheritance conflicts entirely.
 *
 *   This contract implements all required hooks:
 *   - RateLimiter:   `_authorizeRateLimitAdmin()` → _checkOwner()
 *   - BreakGlass:    `_authorizeBreakGlassAdmin()` → _checkOwner()
 *                    `_breakGlassPause()` → _pause()
 *                    `_breakGlassUnpause()` → _unpause()
 *                    `_breakGlassTransferOwnership()` → _transferOwnership()
 *   - WatchdogAlert: `_authorizeWatchdogAdmin()` → _checkOwner()
 *
 *   The constructor uses a `Config` struct to avoid Solidity's "stack too deep"
 *   error (the combined 11 parameters exceed the 16-slot stack limit).
 */
contract FullSentinelVault is DeadManSwitch, RateLimiter, BreakGlass, WatchdogAlert {
    /// @notice Emitted when ETH is deposited into the vault.
    event Deposited(address indexed sender, uint256 amount);

    /// @notice Emitted when ETH is withdrawn from the vault.
    event Withdrawn(address indexed to, uint256 amount);

    /// @notice Configuration struct to avoid stack-too-deep in constructor.
    struct Config {
        // DeadManSwitch
        uint256 heartbeatInterval;
        uint256 gracePeriod;
        address recoveryAddress;
        // RateLimiter
        uint256 maxWithdraw;
        uint256 withdrawWindow;
        // BreakGlass
        address[] guardians;
        uint256 guardianThreshold;
        uint256 emergencyDelay;
        // WatchdogAlert
        uint256 largeTransfer;
        uint256 rapidCount;
        uint256 rapidWindow;
    }

    /**
     * @param cfg Configuration struct containing all module parameters.
     */
    constructor(Config memory cfg)
        Ownable(msg.sender)
        DeadManSwitch(cfg.heartbeatInterval, cfg.gracePeriod, cfg.recoveryAddress)
        RateLimiter(cfg.maxWithdraw, cfg.withdrawWindow)
        BreakGlass(cfg.guardians, cfg.guardianThreshold, cfg.emergencyDelay)
        WatchdogAlert(cfg.largeTransfer, cfg.rapidCount, cfg.rapidWindow)
    {}

    /// @notice Deposit ETH into the vault.
    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    /// @notice Withdraw ETH from the vault.
    /// @dev Enforces: onlyOwner, whenNotPaused, rate limit, and watchdog check.
    function withdraw(address payable to, uint256 amount) external onlyOwner whenNotPaused {
        require(amount <= address(this).balance, "Insufficient balance");

        // Rate limiter: reverts if amount exceeds window cap
        _enforceRateLimit(amount);

        // Watchdog: emits alert events (never reverts)
        _watchdogCheck(address(this), to, amount);

        (bool success, ) = to.call{value: amount}("");
        require(success, "Transfer failed");
        emit Withdrawn(to, amount);
    }

    /// @notice Allows the owner to unpause after emergency recovery.
    function unpause() external onlyOwner {
        _unpause();
    }

    // ──────────────────────────────────────────────
    //  Virtual hook implementations
    // ──────────────────────────────────────────────

    /// @dev RateLimiter admin authorization — delegates to Ownable._checkOwner().
    function _authorizeRateLimitAdmin() internal view override {
        _checkOwner();
    }

    /// @dev BreakGlass admin authorization — delegates to Ownable._checkOwner().
    function _authorizeBreakGlassAdmin() internal view override {
        _checkOwner();
    }

    /// @dev BreakGlass pause action — delegates to Pausable._pause().
    function _breakGlassPause() internal override {
        _pause();
    }

    /// @dev BreakGlass unpause action — delegates to Pausable._unpause().
    function _breakGlassUnpause() internal override {
        _unpause();
    }

    /// @dev BreakGlass ownership transfer — delegates to Ownable._transferOwnership().
    function _breakGlassTransferOwnership(address newOwner) internal override {
        _transferOwnership(newOwner);
    }

    /// @dev WatchdogAlert admin authorization — delegates to Ownable._checkOwner().
    function _authorizeWatchdogAdmin() internal view override {
        _checkOwner();
    }
}
