// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../asset/AssetRegistry.sol";
import "../accounting/AssetLedger.sol";
import "../resolver/IdentifierResolver.sol";

/**
 * @title SimpleAssetManager
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Concrete implementation combining AssetRegistry, AssetLedger, and
 *         IdentifierResolver with Ownable access control.
 *
 * @dev This is a ready-to-deploy contract that wires all three abstract
 *      modules together under single-owner access control. For production
 *      multi-role deployments, use AccessControl instead of Ownable.
 *
 *      Workflow:
 *        1. Owner registers an asset → mints ERC-1155 token + ledger entry
 *        2. Owner links QR/UPN identifiers to the token
 *        3. Anyone scans QR → resolves to token ID → reads on-chain data
 *        4. Owner records depreciation monthly (or via off-chain cron)
 *        5. Owner disposes of asset → burns token + ledger entry
 */
contract SimpleAssetManager is Ownable, AssetRegistry, AssetLedger, IdentifierResolver {
    constructor(string memory baseUri)
        Ownable(msg.sender)
        AssetRegistry(baseUri)
    {}

    // ── Convenience — Register + Record + Link ─────────────────

    /**
     * @notice Registers an asset, records the acquisition in the ledger,
     *         and optionally links an identifier — all in one transaction.
     * @param to              Recipient address.
     * @param amount          Number of units.
     * @param assetClass      Classification.
     * @param acquisitionCost Cost in stablecoin units.
     * @param usefulLifeMonths Depreciation period.
     * @param department      Organizational unit.
     * @param location        Physical or logical location.
     * @param tokenUri        Metadata URI.
     * @param identifierHash  Optional identifier hash (bytes32(0) to skip).
     * @param idType          Identifier type (ignored if hash is zero).
     * @return tokenId        The assigned token ID.
     */
    function registerAndLink(
        address to,
        uint256 amount,
        AssetClass assetClass,
        uint256 acquisitionCost,
        uint256 usefulLifeMonths,
        string calldata department,
        string calldata location,
        string calldata tokenUri,
        bytes32 identifierHash,
        IdentifierType idType
    ) external returns (uint256 tokenId) {
        _checkOwner();

        // Register the asset (mints tokens)
        tokenId = this.registerAsset(
            to, amount, assetClass, acquisitionCost,
            usefulLifeMonths, department, location, tokenUri
        );

        // Record acquisition in the ledger
        this.recordAcquisition(tokenId, acquisitionCost);

        // Link identifier if provided
        if (identifierHash != bytes32(0)) {
            this.linkIdentifier(identifierHash, tokenId, idType);
        }
    }

    // ── Access Control Hooks ───────────────────────────────────

    function _authorizeRegistrar() internal view override {
        _checkOwner();
    }

    function _authorizeManager() internal view override {
        _checkOwner();
    }

    function _authorizePauser() internal view override {
        _checkOwner();
    }

    function _authorizeAccountant() internal view override {
        _checkOwner();
    }

    function _authorizeResolver() internal view override {
        _checkOwner();
    }

    // ── Ledger Integration ─────────────────────────────────────

    /**
     * @dev Provides the ledger with access to asset metadata from the registry.
     */
    function _getAssetMetadata(uint256 tokenId)
        internal
        view
        override
        returns (IAssetRegistry.AssetMetadata memory)
    {
        return _getMetadata(tokenId);
    }
}
