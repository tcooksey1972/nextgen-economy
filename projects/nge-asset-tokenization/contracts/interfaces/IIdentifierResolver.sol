// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title IIdentifierResolver
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Interface for mapping external identifiers (QR codes, UPNs,
 *         serial numbers, barcodes) to on-chain token IDs.
 *
 * @dev External identifiers are stored as keccak256 hashes to keep
 *      gas costs constant regardless of identifier length. The original
 *      identifier can be verified off-chain by hashing and comparing.
 *
 *      Identifier types:
 *        - QR Code: Encoded URL or data payload
 *        - UPN (Universal Product Number): Standard product identifier
 *        - Serial Number: Manufacturer-assigned unique ID
 *        - Custom: Any other organizational identifier
 */
interface IIdentifierResolver {
    // ── Types ──────────────────────────────────────────────────

    enum IdentifierType {
        QRCode,        // 0
        UPN,           // 1
        SerialNumber,  // 2
        Barcode,       // 3
        Custom         // 4
    }

    struct IdentifierRecord {
        uint256 tokenId;
        IdentifierType idType;
        uint256 registeredAt;
        address registeredBy;
    }

    // ── Events ─────────────────────────────────────────────────

    event IdentifierLinked(
        bytes32 indexed identifierHash,
        uint256 indexed tokenId,
        IdentifierType idType,
        address indexed registeredBy
    );

    event IdentifierUnlinked(
        bytes32 indexed identifierHash,
        uint256 indexed tokenId,
        address indexed removedBy
    );

    // ── Errors ─────────────────────────────────────────────────

    error IdentifierAlreadyLinked(bytes32 identifierHash, uint256 existingTokenId);
    error IdentifierNotFound(bytes32 identifierHash);
    error ZeroIdentifier();

    // ── View Functions ─────────────────────────────────────────

    /// @notice Resolves an identifier hash to its token ID.
    function resolve(bytes32 identifierHash) external view returns (uint256);

    /// @notice Returns the full record for an identifier.
    function getIdentifier(bytes32 identifierHash) external view returns (IdentifierRecord memory);

    /// @notice Returns true if the identifier has been linked to a token.
    function isLinked(bytes32 identifierHash) external view returns (bool);

    /// @notice Returns the number of identifiers linked to a given token.
    function identifierCount(uint256 tokenId) external view returns (uint256);
}
