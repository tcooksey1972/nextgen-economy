// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "../asset/AssetRegistry.sol";
import "../accounting/AssetLedger.sol";
import "../resolver/IdentifierResolver.sol";

/**
 * @title ControlledAssetManager
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Role-based asset management for government and military use cases.
 *
 * @dev Designed for organizations that manage controlled items — ammunition,
 *      narcotics, hazardous materials, classified equipment — where strict
 *      chain-of-custody and multi-party authorization are required.
 *
 *      Roles:
 *        - DEFAULT_ADMIN: Grant/revoke roles, emergency pause. Typically a
 *          multisig or DAO for production deployments.
 *        - PROPERTY_OFFICER: Register assets, update metadata, link identifiers.
 *          Equivalent to a military Property Book Officer (PBO).
 *        - ACCOUNTANT: Record journal entries, depreciation, revaluations.
 *          Maps to DFAS accounting personnel.
 *        - CUSTODIAN: Issue and return controlled items. Tracks quantity
 *          changes with on-chain events for full chain-of-custody.
 *        - INSPECTOR: Verify physical counts against on-chain balances.
 *          Records inspection results as on-chain attestations.
 *
 *      Workflow (ammunition example):
 *        1. PROPERTY_OFFICER registers ammo lot (10,000 rounds as ERC-1155)
 *        2. PROPERTY_OFFICER links QR code to the token ID
 *        3. ACCOUNTANT records acquisition ($50,000)
 *        4. CUSTODIAN issues 500 rounds to a unit (token transfer)
 *        5. CUSTODIAN records return of 480 rounds (20 expended)
 *        6. INSPECTOR verifies physical count matches on-chain balance
 *        7. ACCOUNTANT records depreciation or disposal as needed
 */
contract ControlledAssetManager is
    AccessControl,
    AssetRegistry,
    AssetLedger,
    IdentifierResolver
{
    // ── Roles ──────────────────────────────────────────────

    bytes32 public constant PROPERTY_OFFICER = keccak256("PROPERTY_OFFICER");
    bytes32 public constant ACCOUNTANT = keccak256("ACCOUNTANT");
    bytes32 public constant CUSTODIAN = keccak256("CUSTODIAN");
    bytes32 public constant INSPECTOR = keccak256("INSPECTOR");

    // ── Events ─────────────────────────────────────────────

    event ItemsIssued(
        uint256 indexed tokenId,
        address indexed from,
        address indexed to,
        uint256 amount,
        string memo
    );

    event ItemsReturned(
        uint256 indexed tokenId,
        address indexed from,
        address indexed to,
        uint256 returned,
        uint256 expended,
        string memo
    );

    event InspectionRecorded(
        uint256 indexed tokenId,
        address indexed location,
        uint256 physicalCount,
        uint256 onChainBalance,
        bool discrepancy,
        address indexed inspector
    );

    // ── Errors ─────────────────────────────────────────────

    error ReturnExceedsIssued(uint256 returned, uint256 expended, uint256 issued);

    // ── Constructor ────────────────────────────────────────

    constructor(string memory baseUri)
        AssetRegistry(baseUri)
    {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PROPERTY_OFFICER, msg.sender);
        _grantRole(ACCOUNTANT, msg.sender);
        _grantRole(CUSTODIAN, msg.sender);
        _grantRole(INSPECTOR, msg.sender);
    }

    // ── Custodian — Issue / Return ─────────────────────────

    /**
     * @notice Issues controlled items from a storage location to a recipient.
     * @param from      Address holding the tokens (armory, warehouse).
     * @param to        Recipient address (unit, individual).
     * @param tokenId   The asset token ID.
     * @param amount    Number of items to issue.
     * @param memo      Reason for issuance (e.g., "Training exercise 2026-03").
     */
    function issueItems(
        address from,
        address to,
        uint256 tokenId,
        uint256 amount,
        string calldata memo
    ) external onlyRole(CUSTODIAN) {
        _requireExists(tokenId);
        safeTransferFrom(from, to, tokenId, amount, "");
        emit ItemsIssued(tokenId, from, to, amount, memo);
    }

    /**
     * @notice Records the return of controlled items, accounting for expended units.
     * @param from      Address returning the items.
     * @param to        Storage address receiving the items.
     * @param tokenId   The asset token ID.
     * @param returned  Number of items physically returned.
     * @param expended  Number of items consumed/expended (will be burned).
     * @param memo      Notes (e.g., "20 rounds expended at range").
     */
    function returnItems(
        address from,
        address to,
        uint256 tokenId,
        uint256 returned,
        uint256 expended,
        string calldata memo
    ) external onlyRole(CUSTODIAN) {
        _requireExists(tokenId);
        uint256 total = returned + expended;
        uint256 bal = balanceOf(from, tokenId);
        if (total > bal) {
            revert ReturnExceedsIssued(returned, expended, bal);
        }

        // Transfer returned items back to storage
        if (returned > 0) {
            safeTransferFrom(from, to, tokenId, returned, "");
        }

        // Burn expended items
        if (expended > 0) {
            _burn(from, tokenId, expended);
        }

        emit ItemsReturned(tokenId, from, to, returned, expended, memo);
    }

    // ── Inspector — Physical Count Verification ────────────

    /**
     * @notice Records an inspection comparing physical count to on-chain balance.
     * @param tokenId      The asset token ID.
     * @param holder       Address being inspected (unit, warehouse).
     * @param physicalCount Number of items physically counted.
     */
    function recordInspection(
        uint256 tokenId,
        address holder,
        uint256 physicalCount
    ) external onlyRole(INSPECTOR) {
        _requireExists(tokenId);
        uint256 onChain = balanceOf(holder, tokenId);
        bool discrepancy = physicalCount != onChain;

        emit InspectionRecorded(
            tokenId,
            holder,
            physicalCount,
            onChain,
            discrepancy,
            msg.sender
        );
    }

    // ── Access Control Hooks ───────────────────────────────

    function _authorizeRegistrar() internal view override {
        _checkRole(PROPERTY_OFFICER);
    }

    function _authorizeManager() internal view override {
        _checkRole(PROPERTY_OFFICER);
    }

    function _authorizePauser() internal view override {
        _checkRole(DEFAULT_ADMIN_ROLE);
    }

    function _authorizeAccountant() internal view override {
        _checkRole(ACCOUNTANT);
    }

    function _authorizeResolver() internal view override {
        _checkRole(PROPERTY_OFFICER);
    }

    // ── Ledger Integration ─────────────────────────────────

    function _getAssetMetadata(uint256 tokenId)
        internal
        view
        override
        returns (IAssetRegistry.AssetMetadata memory)
    {
        return _getMetadata(tokenId);
    }

    // ── Required Override — ERC-1155 + AccessControl ───────

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControl, ERC1155)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
