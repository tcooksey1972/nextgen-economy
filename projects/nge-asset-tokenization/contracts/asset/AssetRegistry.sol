// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Pausable.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155URIStorage.sol";
import "../interfaces/IAssetRegistry.sol";

/**
 * @title AssetRegistry
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Abstract ERC-1155-based registry for tokenizing corporate assets.
 *
 * @dev Each asset type gets a unique token ID. Unique assets (equipment,
 *      vehicles) are minted with supply=1. Fungible inventory (stock, parts)
 *      can be minted with arbitrary supply.
 *
 *      Access control is delegated to child contracts via virtual hooks:
 *        - _authorizeRegistrar()  — who can register new assets
 *        - _authorizeManager()    — who can change status / update metadata
 *        - _authorizePauser()     — who can pause/unpause
 *
 *      Example child: SimpleAssetRegistry (Ownable-based)
 */
abstract contract AssetRegistry is
    ERC1155,
    ERC1155Supply,
    ERC1155Pausable,
    ERC1155URIStorage,
    IAssetRegistry
{
    // ── Storage ────────────────────────────────────────────────

    uint256 private _nextTokenId;
    mapping(uint256 => AssetMetadata) private _metadata;

    // ── Constructor ────────────────────────────────────────────

    constructor(string memory baseUri) ERC1155(baseUri) {}

    // ── External — Registration ────────────────────────────────

    /**
     * @notice Registers a new corporate asset and mints tokens.
     * @param to        Recipient address (department wallet, custodian).
     * @param amount    Number of units (1 for unique assets).
     * @param assetClass Classification of the asset.
     * @param acquisitionCost Cost in stablecoin units (wei precision).
     * @param usefulLifeMonths Depreciation period (0 if non-depreciable).
     * @param department Organizational unit that owns the asset.
     * @param location  Physical or logical location.
     * @param tokenUri  Metadata URI (IPFS hash or API endpoint).
     * @return tokenId  The newly assigned token ID.
     */
    function registerAsset(
        address to,
        uint256 amount,
        AssetClass assetClass,
        uint256 acquisitionCost,
        uint256 usefulLifeMonths,
        string calldata department,
        string calldata location,
        string calldata tokenUri
    ) external returns (uint256 tokenId) {
        _authorizeRegistrar();
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        // Unique assets must have supply of 1
        if (assetClass == AssetClass.UniqueEquipment && amount != 1) {
            revert ZeroAmount(); // unique assets must be singular
        }

        // Depreciable assets require a useful life
        if (acquisitionCost > 0 && usefulLifeMonths == 0 &&
            assetClass == AssetClass.UniqueEquipment) {
            revert UsefulLifeRequired();
        }

        tokenId = _nextTokenId++;

        _metadata[tokenId] = AssetMetadata({
            assetClass: assetClass,
            status: AssetStatus.Active,
            acquisitionCost: acquisitionCost,
            acquisitionDate: block.timestamp,
            usefulLifeMonths: usefulLifeMonths,
            department: department,
            location: location
        });

        _mint(to, tokenId, amount, "");

        if (bytes(tokenUri).length > 0) {
            _setURI(tokenId, tokenUri);
        }

        emit AssetRegistered(tokenId, assetClass, amount, msg.sender);
    }

    // ── External — Status Management ───────────────────────────

    /**
     * @notice Changes the status of a registered asset.
     * @param tokenId The asset token ID.
     * @param newStatus The new status to set.
     */
    function setAssetStatus(uint256 tokenId, AssetStatus newStatus) external {
        _authorizeManager();
        _requireExists(tokenId);

        AssetStatus oldStatus = _metadata[tokenId].status;
        _metadata[tokenId].status = newStatus;

        emit AssetStatusChanged(tokenId, oldStatus, newStatus, msg.sender);
    }

    /**
     * @notice Updates the location of an asset.
     */
    function updateLocation(uint256 tokenId, string calldata newLocation) external {
        _authorizeManager();
        _requireExists(tokenId);

        _metadata[tokenId].location = newLocation;
        emit AssetMetadataUpdated(tokenId, "location", msg.sender);
    }

    /**
     * @notice Updates the department assignment of an asset.
     */
    function updateDepartment(uint256 tokenId, string calldata newDepartment) external {
        _authorizeManager();
        _requireExists(tokenId);

        _metadata[tokenId].department = newDepartment;
        emit AssetMetadataUpdated(tokenId, "department", msg.sender);
    }

    /**
     * @notice Disposes of (burns) asset tokens. Marks as Disposed.
     * @param from     Address holding the tokens.
     * @param tokenId  The asset token ID.
     * @param amount   Number of units to dispose.
     * @param disposalValue Proceeds from disposal (0 if scrapped).
     */
    function disposeAsset(
        address from,
        uint256 tokenId,
        uint256 amount,
        uint256 disposalValue
    ) external {
        _authorizeManager();
        _requireExists(tokenId);
        if (amount == 0) revert ZeroAmount();

        uint256 bal = balanceOf(from, tokenId);
        if (bal < amount) revert InsufficientBalance(tokenId, amount, bal);

        _burn(from, tokenId, amount);

        // If all supply burned, mark as disposed
        if (totalSupply(tokenId) == 0) {
            _metadata[tokenId].status = AssetStatus.Disposed;
            emit AssetStatusChanged(
                tokenId,
                _metadata[tokenId].status,
                AssetStatus.Disposed,
                msg.sender
            );
        }

        emit AssetDisposed(tokenId, amount, disposalValue, msg.sender);
    }

    /**
     * @notice Emergency pause on all transfers.
     */
    function pause() external {
        _authorizePauser();
        _pause();
    }

    /**
     * @notice Unpause transfers.
     */
    function unpause() external {
        _authorizePauser();
        _unpause();
    }

    // ── View Functions ─────────────────────────────────────────

    function assetCount() external view override returns (uint256) {
        return _nextTokenId;
    }

    function assetMetadata(uint256 tokenId)
        external
        view
        override
        returns (AssetMetadata memory)
    {
        _requireExists(tokenId);
        return _metadata[tokenId];
    }

    function assetStatus(uint256 tokenId)
        external
        view
        override
        returns (AssetStatus)
    {
        _requireExists(tokenId);
        return _metadata[tokenId].status;
    }

    function isAssetActive(uint256 tokenId)
        external
        view
        override
        returns (bool)
    {
        if (tokenId >= _nextTokenId) return false;
        return _metadata[tokenId].status == AssetStatus.Active;
    }

    // ── View — URI override ────────────────────────────────────

    function uri(uint256 tokenId)
        public
        view
        override(ERC1155, ERC1155URIStorage)
        returns (string memory)
    {
        return super.uri(tokenId);
    }

    // ── Internal — Access hooks ────────────────────────────────

    function _authorizeRegistrar() internal virtual;
    function _authorizeManager() internal virtual;
    function _authorizePauser() internal virtual;

    // ── Internal — Helpers ─────────────────────────────────────

    function _requireExists(uint256 tokenId) internal view {
        if (tokenId >= _nextTokenId) revert AssetNotFound(tokenId);
    }

    /**
     * @dev Exposes token ID counter for child contracts (e.g. ledger needs it).
     */
    function _currentTokenCount() internal view returns (uint256) {
        return _nextTokenId;
    }

    /**
     * @dev Exposes internal metadata for child contracts.
     */
    function _getMetadata(uint256 tokenId)
        internal
        view
        returns (AssetMetadata storage)
    {
        return _metadata[tokenId];
    }

    // ── Required Overrides ─────────────────────────────────────

    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override(ERC1155, ERC1155Supply, ERC1155Pausable) {
        super._update(from, to, ids, values);
    }
}
