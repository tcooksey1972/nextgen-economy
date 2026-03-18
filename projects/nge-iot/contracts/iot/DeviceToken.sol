// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Burnable.sol";

/**
 * @title DeviceToken
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Abstract ERC-1155 multi-token for IoT device types and sensor credits.
 *
 * ERC-1155 is more gas-efficient than separate ERC-20 + ERC-721 contracts for
 * IoT platforms where devices produce multiple types of tokens:
 *
 *   - **Fungible tokens** (sensor credits, data credits, staking tokens):
 *     Token IDs 0-999 are reserved for fungible types.
 *   - **Non-fungible tokens** (unique device identities):
 *     Token IDs 1000+ represent unique devices (mint quantity = 1).
 *   - **Batch operations**: `safeBatchTransferFrom` and `mintBatch` transfer
 *     multiple token types in a single transaction, saving gas.
 *
 * @dev Composability:
 *   Uses virtual hooks for access control. The inheriting contract provides
 *   authorization via Ownable, AccessControl, or AccessManager.
 *
 * Usage:
 *   contract MyDeviceToken is Ownable, DeviceToken {
 *       constructor() Ownable(msg.sender) DeviceToken("https://api.nextgen.economy/tokens/{id}.json") {}
 *       function _authorizeDeviceTokenAdmin() internal view override { _checkOwner(); }
 *   }
 */
abstract contract DeviceToken is ERC1155, ERC1155Supply, ERC1155Burnable {
    // ──────────────────────────────────────────────
    //  Constants
    // ──────────────────────────────────────────────

    /// @notice Boundary between fungible and non-fungible token IDs.
    uint256 public constant NFT_ID_START = 1000;

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    event DeviceTokenTypeCreated(uint256 indexed tokenId, string name, bool fungible);
    event SensorCreditsIssued(uint256 indexed tokenId, address indexed to, uint256 amount);
    event DeviceNFTMinted(uint256 indexed tokenId, address indexed to);

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    error TokenIdInFungibleRange(uint256 tokenId);
    error TokenIdInNFTRange(uint256 tokenId);
    error NFTAlreadyMinted(uint256 tokenId);

    // ──────────────────────────────────────────────
    //  Storage
    // ──────────────────────────────────────────────

    uint256 private _nextNFTId;
    mapping(uint256 => string) private _tokenNames;

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    constructor(string memory uri_) ERC1155(uri_) {
        _nextNFTId = NFT_ID_START;
    }

    // ──────────────────────────────────────────────
    //  External — Admin functions
    // ──────────────────────────────────────────────

    /**
     * @notice Issues fungible sensor credits to a device owner.
     * @param tokenId Fungible token ID (must be < NFT_ID_START).
     * @param to Recipient address.
     * @param amount Number of credits.
     */
    function issueSensorCredits(uint256 tokenId, address to, uint256 amount) external {
        _authorizeDeviceTokenAdmin();
        if (tokenId >= NFT_ID_START) revert TokenIdInNFTRange(tokenId);

        _mint(to, tokenId, amount, "");
        emit SensorCreditsIssued(tokenId, to, amount);
    }

    /**
     * @notice Mints a unique device NFT.
     * @param to The device owner address.
     * @return tokenId The newly minted token ID.
     */
    function mintDeviceNFT(address to) external returns (uint256 tokenId) {
        _authorizeDeviceTokenAdmin();

        tokenId = _nextNFTId++;
        _mint(to, tokenId, 1, "");
        emit DeviceNFTMinted(tokenId, to);
    }

    /**
     * @notice Batch mint multiple token types at once.
     * @param to Recipient address.
     * @param ids Array of token IDs.
     * @param amounts Array of amounts for each token ID.
     */
    function mintBatch(address to, uint256[] calldata ids, uint256[] calldata amounts) external {
        _authorizeDeviceTokenAdmin();
        _mintBatch(to, ids, amounts, "");
    }

    /**
     * @notice Registers a name for a token type.
     * @param tokenId The token ID.
     * @param name Human-readable name for the token type.
     */
    function setTokenName(uint256 tokenId, string calldata name) external {
        _authorizeDeviceTokenAdmin();
        _tokenNames[tokenId] = name;
        emit DeviceTokenTypeCreated(tokenId, name, tokenId < NFT_ID_START);
    }

    /**
     * @notice Updates the base URI for all tokens.
     * @param newUri The new URI string.
     */
    function setURI(string calldata newUri) external {
        _authorizeDeviceTokenAdmin();
        _setURI(newUri);
    }

    // ──────────────────────────────────────────────
    //  View functions
    // ──────────────────────────────────────────────

    /// @notice Returns the name of a token type.
    function tokenName(uint256 tokenId) external view returns (string memory) {
        return _tokenNames[tokenId];
    }

    /// @notice Returns the next NFT ID that will be minted.
    function nextNFTId() external view returns (uint256) {
        return _nextNFTId;
    }

    // ──────────────────────────────────────────────
    //  Required overrides
    // ──────────────────────────────────────────────

    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal override(ERC1155, ERC1155Supply)
    {
        super._update(from, to, ids, values);
    }

    // ──────────────────────────────────────────────
    //  Virtual hooks
    // ──────────────────────────────────────────────

    /// @dev Override to provide access control for admin functions.
    function _authorizeDeviceTokenAdmin() internal virtual;
}
