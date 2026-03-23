// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title IAssetLedger
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Interface for on-chain accounting ledger that tracks asset
 *         valuations, depreciation, and audit trail entries.
 *
 * @dev Designed to automate corporate accounting by recording every
 *      financial event on-chain with immutable journal entries.
 */
interface IAssetLedger {
    // ── Types ──────────────────────────────────────────────────

    enum EntryType {
        Acquisition,      // 0 — asset purchased / received
        Depreciation,     // 1 — periodic depreciation recorded
        Revaluation,      // 2 — fair value adjustment
        Impairment,       // 3 — write-down due to loss of value
        Disposal,         // 4 — asset sold or scrapped
        Transfer          // 5 — internal transfer between departments
    }

    struct JournalEntry {
        uint256 tokenId;
        EntryType entryType;
        uint256 debitAmount;     // increase in asset/expense
        uint256 creditAmount;    // decrease in asset/revenue
        uint256 timestamp;
        address recordedBy;
        string memo;
    }

    // ── Events ─────────────────────────────────────────────────

    event JournalEntryRecorded(
        uint256 indexed entryId,
        uint256 indexed tokenId,
        EntryType indexed entryType,
        uint256 debitAmount,
        uint256 creditAmount
    );

    event DepreciationRecorded(
        uint256 indexed tokenId,
        uint256 period,
        uint256 amount,
        uint256 newBookValue
    );

    // ── Errors ─────────────────────────────────────────────────

    error AssetNotDepreciable(uint256 tokenId);
    error DepreciationAlreadyCurrent(uint256 tokenId, uint256 currentPeriod);
    error BookValueExhausted(uint256 tokenId);
    error InvalidEntryAmounts();

    // ── View Functions ─────────────────────────────────────────

    /// @notice Returns the current book value of an asset after depreciation.
    function bookValue(uint256 tokenId) external view returns (uint256);

    /// @notice Returns the accumulated depreciation for an asset.
    function accumulatedDepreciation(uint256 tokenId) external view returns (uint256);

    /// @notice Returns the number of depreciation periods already recorded.
    function depreciationPeriods(uint256 tokenId) external view returns (uint256);

    /// @notice Returns the total number of journal entries.
    function entryCount() external view returns (uint256);

    /// @notice Returns a specific journal entry by ID.
    function getEntry(uint256 entryId) external view returns (JournalEntry memory);
}
