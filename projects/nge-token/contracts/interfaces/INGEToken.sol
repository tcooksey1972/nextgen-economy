// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title INGEToken
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Interface for the NGE platform ERC-20 token with sentinel security hooks.
 */
interface INGEToken {
    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    /// @notice Emitted when tokens are minted by an authorized minter.
    event TokensMinted(address indexed to, uint256 amount, address indexed minter);

    /// @notice Emitted when the token is paused.
    event TokenPaused(address indexed by);

    /// @notice Emitted when the token is unpaused.
    event TokenUnpaused(address indexed by);

    /// @notice Emitted when the supply cap is updated.
    event SupplyCapUpdated(uint256 oldCap, uint256 newCap);

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    /// @notice Thrown when minting would exceed the supply cap.
    error SupplyCapExceeded(uint256 requested, uint256 remaining);

    /// @notice Thrown when a zero amount is provided.
    error ZeroAmount();

    /// @notice Thrown when a zero address is provided.
    error ZeroAddress();

    /// @notice Thrown when the new cap is below the current total supply.
    error CapBelowSupply(uint256 newCap, uint256 currentSupply);

    // ──────────────────────────────────────────────
    //  View functions
    // ──────────────────────────────────────────────

    /// @notice Returns the maximum token supply.
    function supplyCap() external view returns (uint256);

    /// @notice Returns the remaining mintable supply.
    function mintableSupply() external view returns (uint256);
}
