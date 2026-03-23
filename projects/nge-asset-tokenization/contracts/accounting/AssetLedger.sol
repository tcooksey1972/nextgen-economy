// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../interfaces/IAssetLedger.sol";
import "../interfaces/IAssetRegistry.sol";

/**
 * @title AssetLedger
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Abstract on-chain accounting ledger for corporate asset tracking.
 *
 * @dev Records immutable journal entries for every financial event:
 *      acquisitions, depreciation, revaluations, impairments, disposals,
 *      and internal transfers.
 *
 *      Straight-line depreciation is computed on-chain:
 *        monthly_amount = acquisitionCost / usefulLifeMonths
 *
 *      Access control via virtual hooks:
 *        - _authorizeAccountant() — who can record entries and depreciation
 *
 *      Must be paired with an AssetRegistry to read asset metadata.
 */
abstract contract AssetLedger is IAssetLedger {
    // ── Storage ────────────────────────────────────────────────

    /// @dev All journal entries in chronological order.
    JournalEntry[] private _entries;

    /// @dev tokenId => current book value (starts at acquisitionCost).
    mapping(uint256 => uint256) private _bookValues;

    /// @dev tokenId => total depreciation recorded so far.
    mapping(uint256 => uint256) private _accumulated;

    /// @dev tokenId => number of depreciation periods recorded.
    mapping(uint256 => uint256) private _periods;

    /// @dev tokenId => whether the initial book value has been set.
    mapping(uint256 => bool) private _initialized;

    // ── External — Journal Entries ─────────────────────────────

    /**
     * @notice Records an acquisition entry when a new asset is registered.
     * @param tokenId       The asset token ID.
     * @param cost          Acquisition cost.
     */
    function recordAcquisition(uint256 tokenId, uint256 cost) external {
        _authorizeAccountant();
        if (cost == 0) revert InvalidEntryAmounts();

        _bookValues[tokenId] = cost;
        _initialized[tokenId] = true;

        _recordEntry(
            tokenId,
            EntryType.Acquisition,
            cost,
            0,
            "Asset acquired"
        );
    }

    /**
     * @notice Records straight-line depreciation for one period (month).
     * @param tokenId The asset token ID.
     *
     * @dev Computes: monthlyDepreciation = acquisitionCost / usefulLifeMonths.
     *      Final period absorbs any rounding remainder.
     */
    function recordDepreciation(uint256 tokenId) external {
        _authorizeAccountant();

        IAssetRegistry.AssetMetadata memory meta = _getAssetMetadata(tokenId);
        if (meta.usefulLifeMonths == 0) revert AssetNotDepreciable(tokenId);
        if (_periods[tokenId] >= meta.usefulLifeMonths) {
            revert DepreciationAlreadyCurrent(tokenId, _periods[tokenId]);
        }
        if (_bookValues[tokenId] == 0) revert BookValueExhausted(tokenId);

        uint256 monthlyAmount = meta.acquisitionCost / meta.usefulLifeMonths;
        uint256 period = _periods[tokenId] + 1;

        // Last period absorbs rounding remainder
        uint256 amount;
        if (period == meta.usefulLifeMonths) {
            amount = _bookValues[tokenId];
        } else {
            amount = monthlyAmount;
            if (amount > _bookValues[tokenId]) {
                amount = _bookValues[tokenId];
            }
        }

        _bookValues[tokenId] -= amount;
        _accumulated[tokenId] += amount;
        _periods[tokenId] = period;

        _recordEntry(tokenId, EntryType.Depreciation, 0, amount, "Monthly depreciation");

        emit DepreciationRecorded(tokenId, period, amount, _bookValues[tokenId]);
    }

    /**
     * @notice Records a revaluation (fair value adjustment).
     * @param tokenId  The asset token ID.
     * @param newValue The new book value after revaluation.
     */
    function recordRevaluation(uint256 tokenId, uint256 newValue) external {
        _authorizeAccountant();
        _requireInitialized(tokenId);

        uint256 current = _bookValues[tokenId];
        if (newValue > current) {
            uint256 increase = newValue - current;
            _bookValues[tokenId] = newValue;
            _recordEntry(tokenId, EntryType.Revaluation, increase, 0, "Revaluation surplus");
        } else if (newValue < current) {
            uint256 decrease = current - newValue;
            _bookValues[tokenId] = newValue;
            _recordEntry(tokenId, EntryType.Revaluation, 0, decrease, "Revaluation deficit");
        }
    }

    /**
     * @notice Records an impairment (write-down).
     * @param tokenId The asset token ID.
     * @param amount  The impairment amount.
     */
    function recordImpairment(uint256 tokenId, uint256 amount) external {
        _authorizeAccountant();
        _requireInitialized(tokenId);
        if (amount == 0 || amount > _bookValues[tokenId]) revert InvalidEntryAmounts();

        _bookValues[tokenId] -= amount;
        _recordEntry(tokenId, EntryType.Impairment, 0, amount, "Impairment loss");
    }

    /**
     * @notice Records a disposal entry.
     * @param tokenId      The asset token ID.
     * @param disposalValue Proceeds from disposal.
     */
    function recordDisposal(uint256 tokenId, uint256 disposalValue) external {
        _authorizeAccountant();
        _requireInitialized(tokenId);

        uint256 bv = _bookValues[tokenId];
        _bookValues[tokenId] = 0;

        string memory memo = disposalValue >= bv ? "Disposal - gain" : "Disposal - loss";
        _recordEntry(tokenId, EntryType.Disposal, disposalValue, bv, memo);
    }

    /**
     * @notice Records a department transfer.
     * @param tokenId       The asset token ID.
     * @param fromDept      Source department name.
     * @param toDept        Target department name.
     */
    function recordTransfer(
        uint256 tokenId,
        string calldata fromDept,
        string calldata toDept
    ) external {
        _authorizeAccountant();
        _requireInitialized(tokenId);

        string memory memo = string.concat("Transfer: ", fromDept, " to ", toDept);
        _recordEntry(tokenId, EntryType.Transfer, 0, 0, memo);
    }

    // ── View Functions ─────────────────────────────────────────

    function bookValue(uint256 tokenId) external view override returns (uint256) {
        return _bookValues[tokenId];
    }

    function accumulatedDepreciation(uint256 tokenId) external view override returns (uint256) {
        return _accumulated[tokenId];
    }

    function depreciationPeriods(uint256 tokenId) external view override returns (uint256) {
        return _periods[tokenId];
    }

    function entryCount() external view override returns (uint256) {
        return _entries.length;
    }

    function getEntry(uint256 entryId) external view override returns (JournalEntry memory) {
        return _entries[entryId];
    }

    // ── Internal — Access hooks ────────────────────────────────

    function _authorizeAccountant() internal virtual;

    /**
     * @dev Child must provide a way to fetch asset metadata from the registry.
     */
    function _getAssetMetadata(uint256 tokenId)
        internal
        view
        virtual
        returns (IAssetRegistry.AssetMetadata memory);

    // ── Internal — Helpers ─────────────────────────────────────

    function _recordEntry(
        uint256 tokenId,
        EntryType entryType,
        uint256 debit,
        uint256 credit,
        string memory memo
    ) internal {
        uint256 entryId = _entries.length;
        _entries.push(JournalEntry({
            tokenId: tokenId,
            entryType: entryType,
            debitAmount: debit,
            creditAmount: credit,
            timestamp: block.timestamp,
            recordedBy: msg.sender,
            memo: memo
        }));

        emit JournalEntryRecorded(entryId, tokenId, entryType, debit, credit);
    }

    function _requireInitialized(uint256 tokenId) internal view {
        if (!_initialized[tokenId]) revert InvalidEntryAmounts();
    }
}
