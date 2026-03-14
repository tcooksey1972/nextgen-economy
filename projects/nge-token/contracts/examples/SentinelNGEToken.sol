// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../token/NGEToken.sol";

/**
 * @title SentinelNGEToken
 * @author Cloud Creations LLC — NextGen Economy
 * @notice NGE token with sentinel security hook stubs for composability.
 *
 * @dev This contract demonstrates how NGEToken composes with nge-sentinel modules.
 *      In a full deployment, you would import and inherit from RateLimiter and
 *      WatchdogAlert, then wire the hooks in _beforeTokenTransfer. Example:
 *
 *      contract ProductionNGEToken is Ownable, NGEToken, RateLimiter, WatchdogAlert {
 *          function _beforeTokenTransfer(address from, address to, uint256 amount)
 *              internal override
 *          {
 *              _enforceRateLimit(amount);
 *              _watchdogCheck(from, to, amount);
 *          }
 *          function _authorizeRateLimitAdmin() internal view override { _checkOwner(); }
 *          function _authorizeWatchdogAdmin() internal view override { _checkOwner(); }
 *      }
 *
 *      This example uses an owner-configurable transfer limit as a standalone
 *      demonstration of the hook pattern without requiring nge-sentinel as a dependency.
 */
contract SentinelNGEToken is Ownable, NGEToken {
    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    event TransferLimitUpdated(uint256 oldLimit, uint256 newLimit);
    event LargeTransferDetected(address indexed from, address indexed to, uint256 amount);

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    error TransferExceedsLimit(uint256 amount, uint256 limit);

    // ──────────────────────────────────────────────
    //  Storage
    // ──────────────────────────────────────────────

    /// @notice Maximum single transfer amount (0 = unlimited).
    uint256 public transferLimit;

    /// @notice Threshold above which transfers emit a warning event.
    uint256 public largeTransferThreshold;

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    /**
     * @param cap_ Supply cap (0 = unlimited).
     * @param initialMint Amount to pre-mint to deployer.
     * @param transferLimit_ Max single transfer (0 = unlimited).
     * @param largeTransferThreshold_ Amount that triggers a warning event.
     */
    constructor(
        uint256 cap_,
        uint256 initialMint,
        uint256 transferLimit_,
        uint256 largeTransferThreshold_
    )
        Ownable(msg.sender)
        NGEToken(cap_, msg.sender, initialMint)
    {
        transferLimit = transferLimit_;
        largeTransferThreshold = largeTransferThreshold_;
    }

    // ──────────────────────────────────────────────
    //  Admin — Transfer controls
    // ──────────────────────────────────────────────

    function setTransferLimit(uint256 newLimit) external onlyOwner {
        uint256 old = transferLimit;
        transferLimit = newLimit;
        emit TransferLimitUpdated(old, newLimit);
    }

    function setLargeTransferThreshold(uint256 newThreshold) external onlyOwner {
        largeTransferThreshold = newThreshold;
    }

    // ──────────────────────────────────────────────
    //  Virtual hook implementations
    // ──────────────────────────────────────────────

    function _authorizeMinter() internal view override {
        _checkOwner();
    }

    function _authorizePauser() internal view override {
        _checkOwner();
    }

    function _authorizeAdmin() internal view override {
        _checkOwner();
    }

    /**
     * @dev Pre-transfer hook: enforces transfer limit and detects large transfers.
     *      In production, replace this with actual RateLimiter._enforceRateLimit()
     *      and WatchdogAlert._watchdogCheck() from nge-sentinel.
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override {
        // Rate limit check
        if (transferLimit > 0 && amount > transferLimit) {
            revert TransferExceedsLimit(amount, transferLimit);
        }

        // Watchdog alert
        if (largeTransferThreshold > 0 && amount >= largeTransferThreshold) {
            emit LargeTransferDetected(from, to, amount);
        }
    }
}
