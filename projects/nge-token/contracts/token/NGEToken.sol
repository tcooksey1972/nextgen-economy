// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "../interfaces/INGEToken.sol";

/**
 * @title NGEToken
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Abstract ERC-20 platform token with burn, pause, gasless approvals (EIP-2612),
 *         governance voting (ERC20Votes), and a configurable supply cap.
 *
 * @dev This contract is abstract. It uses virtual hooks for access control so that
 *      inheriting contracts can plug in Ownable, AccessControl, or Sentinel modules
 *      without diamond inheritance conflicts — same pattern as nge-sentinel and nge-iot.
 *
 *      Virtual hooks to implement:
 *        - _authorizeMinter()      → controls who can mint
 *        - _authorizePauser()      → controls who can pause/unpause
 *        - _authorizeAdmin()       → controls who can update the supply cap
 *        - _beforeTokenTransfer()  → pre-transfer hook (rate limiter, watchdog, etc.)
 */
abstract contract NGEToken is
    ERC20,
    ERC20Burnable,
    ERC20Pausable,
    ERC20Permit,
    ERC20Votes,
    INGEToken
{
    // ──────────────────────────────────────────────
    //  Storage
    // ──────────────────────────────────────────────

    uint256 private _supplyCap;

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    /**
     * @param cap_ Maximum token supply (in wei). Use 0 for unlimited.
     * @param initialMintTo Address to receive the initial mint (can be address(0) to skip).
     * @param initialMintAmount Amount to mint at deployment.
     */
    constructor(
        uint256 cap_,
        address initialMintTo,
        uint256 initialMintAmount
    )
        ERC20("NextGen Economy", "NGE")
        ERC20Permit("NextGen Economy")
    {
        _supplyCap = cap_;

        if (initialMintTo != address(0) && initialMintAmount > 0) {
            if (cap_ > 0 && initialMintAmount > cap_) {
                revert SupplyCapExceeded(initialMintAmount, cap_);
            }
            _mint(initialMintTo, initialMintAmount);
        }
    }

    // ──────────────────────────────────────────────
    //  External — Minting
    // ──────────────────────────────────────────────

    /**
     * @notice Mints new tokens to `to`.
     * @param to Recipient address.
     * @param amount Amount to mint (in wei).
     */
    function mint(address to, uint256 amount) external {
        _authorizeMinter();

        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        if (_supplyCap > 0) {
            uint256 remaining = _supplyCap - totalSupply();
            if (amount > remaining) {
                revert SupplyCapExceeded(amount, remaining);
            }
        }

        _mint(to, amount);
        emit TokensMinted(to, amount, msg.sender);
    }

    // ──────────────────────────────────────────────
    //  External — Pause / Unpause
    // ──────────────────────────────────────────────

    /// @notice Pauses all token transfers, minting, and burning.
    function pause() external {
        _authorizePauser();
        _pause();
        emit TokenPaused(msg.sender);
    }

    /// @notice Unpauses the token.
    function unpause() external {
        _authorizePauser();
        _unpause();
        emit TokenUnpaused(msg.sender);
    }

    // ──────────────────────────────────────────────
    //  External — Admin
    // ──────────────────────────────────────────────

    /**
     * @notice Updates the supply cap. Cannot be set below current totalSupply.
     * @param newCap New maximum supply (0 = unlimited).
     */
    function setSupplyCap(uint256 newCap) external {
        _authorizeAdmin();

        if (newCap > 0 && newCap < totalSupply()) {
            revert CapBelowSupply(newCap, totalSupply());
        }

        uint256 oldCap = _supplyCap;
        _supplyCap = newCap;
        emit SupplyCapUpdated(oldCap, newCap);
    }

    // ──────────────────────────────────────────────
    //  View functions
    // ──────────────────────────────────────────────

    /// @inheritdoc INGEToken
    function supplyCap() external view returns (uint256) {
        return _supplyCap;
    }

    /// @inheritdoc INGEToken
    function mintableSupply() external view returns (uint256) {
        if (_supplyCap == 0) return type(uint256).max;
        return _supplyCap - totalSupply();
    }

    // ──────────────────────────────────────────────
    //  Required overrides (multiple inheritance)
    // ──────────────────────────────────────────────

    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Pausable, ERC20Votes)
    {
        // Pre-transfer hook for sentinel modules (no-op by default)
        if (from != address(0) && to != address(0)) {
            _beforeTokenTransfer(from, to, value);
        }

        super._update(from, to, value);
    }

    function nonces(address owner_)
        public
        view
        override(ERC20Permit, Nonces)
        returns (uint256)
    {
        return super.nonces(owner_);
    }

    // ──────────────────────────────────────────────
    //  Virtual hooks — implement in inheriting contract
    // ──────────────────────────────────────────────

    /**
     * @dev Override to provide access control for mint(). Revert if unauthorized.
     */
    function _authorizeMinter() internal virtual;

    /**
     * @dev Override to provide access control for pause/unpause. Revert if unauthorized.
     */
    function _authorizePauser() internal virtual;

    /**
     * @dev Override to provide access control for setSupplyCap(). Revert if unauthorized.
     */
    function _authorizeAdmin() internal virtual;

    /**
     * @dev Hook called before every non-mint, non-burn transfer. Override to add
     *      sentinel module integration (rate limiter, watchdog, etc.).
     *      Default implementation is a no-op.
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual {
        // solhint-disable-next-line no-empty-blocks
    }
}
