// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title IAssetRegistry
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Interface for the corporate asset tokenization registry.
 *
 * @dev Each physical or digital corporate asset is represented as an ERC-1155
 *      token. Fungible token IDs represent inventory/stock classes, while
 *      non-fungible token IDs (supply of 1) represent unique assets like
 *      equipment, vehicles, or real estate.
 */
interface IAssetRegistry {
    // ── Types ──────────────────────────────────────────────────

    enum AssetClass {
        UniqueEquipment,    // 0 — one-of-a-kind (vehicles, machinery, buildings)
        FungibleInventory,  // 1 — interchangeable units (stock, supplies, parts)
        IntellectualProperty, // 2 — patents, trademarks, licenses
        FinancialInstrument   // 3 — bonds, notes, receivables
    }

    enum AssetStatus {
        Active,       // 0 — in service / available
        Inactive,     // 1 — decommissioned / sold
        InTransit,    // 2 — being moved between locations
        UnderReview,  // 3 — audit hold / pending verification
        Disposed      // 4 — written off / destroyed
    }

    struct AssetMetadata {
        AssetClass assetClass;
        AssetStatus status;
        uint256 acquisitionCost;   // in wei-denominated stablecoin units
        uint256 acquisitionDate;   // unix timestamp
        uint256 usefulLifeMonths;  // for depreciation (0 = non-depreciable)
        string department;         // organizational unit
        string location;           // physical or logical location
    }

    // ── Events ─────────────────────────────────────────────────

    event AssetRegistered(
        uint256 indexed tokenId,
        AssetClass indexed assetClass,
        uint256 amount,
        address indexed registeredBy
    );

    event AssetStatusChanged(
        uint256 indexed tokenId,
        AssetStatus oldStatus,
        AssetStatus newStatus,
        address indexed changedBy
    );

    event AssetMetadataUpdated(
        uint256 indexed tokenId,
        string field,
        address indexed updatedBy
    );

    event AssetDisposed(
        uint256 indexed tokenId,
        uint256 amount,
        uint256 disposalValue,
        address indexed disposedBy
    );

    // ── Errors ─────────────────────────────────────────────────

    error ZeroAmount();
    error ZeroAddress();
    error InvalidAssetClass(AssetClass provided);
    error AssetNotFound(uint256 tokenId);
    error AssetNotActive(uint256 tokenId, AssetStatus current);
    error InsufficientBalance(uint256 tokenId, uint256 requested, uint256 available);
    error UsefulLifeRequired();

    // ── View Functions ─────────────────────────────────────────

    /// @notice Returns the total number of distinct asset types registered.
    function assetCount() external view returns (uint256);

    /// @notice Returns the full metadata for a given asset token ID.
    function assetMetadata(uint256 tokenId) external view returns (AssetMetadata memory);

    /// @notice Returns the current status of an asset.
    function assetStatus(uint256 tokenId) external view returns (AssetStatus);

    /// @notice Returns true if the asset exists and is Active.
    function isAssetActive(uint256 tokenId) external view returns (bool);
}
