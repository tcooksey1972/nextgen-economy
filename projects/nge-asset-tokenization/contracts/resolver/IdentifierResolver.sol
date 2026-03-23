// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../interfaces/IIdentifierResolver.sol";

/**
 * @title IdentifierResolver
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Abstract contract that maps external identifiers (QR codes, UPNs,
 *         serial numbers, barcodes) to on-chain asset token IDs.
 *
 * @dev Identifiers are stored as keccak256 hashes for constant gas cost.
 *      Off-chain systems generate QR codes or barcodes that encode the
 *      raw identifier string. Scanning resolves to the token ID via:
 *
 *        1. Scan QR/barcode → get raw identifier string
 *        2. Hash it: keccak256(abi.encodePacked(rawIdentifier))
 *        3. Call resolve(hash) → get token ID
 *        4. Query AssetRegistry for full asset details
 *
 *      Multiple identifiers can point to the same token ID (e.g., a piece
 *      of equipment might have both a QR code and a serial number).
 *
 *      Access control via virtual hook:
 *        - _authorizeResolver() — who can link/unlink identifiers
 */
abstract contract IdentifierResolver is IIdentifierResolver {
    // ── Storage ────────────────────────────────────────────────

    /// @dev identifierHash => IdentifierRecord
    mapping(bytes32 => IdentifierRecord) private _records;

    /// @dev identifierHash => exists flag (cheaper than checking struct)
    mapping(bytes32 => bool) private _linked;

    /// @dev tokenId => count of linked identifiers
    mapping(uint256 => uint256) private _idCounts;

    // ── External — Link / Unlink ───────────────────────────────

    /**
     * @notice Links an external identifier to an asset token ID.
     * @param identifierHash keccak256 hash of the raw identifier string.
     * @param tokenId        The asset token ID to link to.
     * @param idType         The type of identifier (QR, UPN, Serial, etc.).
     */
    function linkIdentifier(
        bytes32 identifierHash,
        uint256 tokenId,
        IdentifierType idType
    ) external {
        _authorizeResolver();
        if (identifierHash == bytes32(0)) revert ZeroIdentifier();
        if (_linked[identifierHash]) {
            revert IdentifierAlreadyLinked(identifierHash, _records[identifierHash].tokenId);
        }

        _records[identifierHash] = IdentifierRecord({
            tokenId: tokenId,
            idType: idType,
            registeredAt: block.timestamp,
            registeredBy: msg.sender
        });
        _linked[identifierHash] = true;
        _idCounts[tokenId]++;

        emit IdentifierLinked(identifierHash, tokenId, idType, msg.sender);
    }

    /**
     * @notice Unlinks an external identifier from its asset token.
     * @param identifierHash keccak256 hash of the raw identifier string.
     */
    function unlinkIdentifier(bytes32 identifierHash) external {
        _authorizeResolver();
        if (!_linked[identifierHash]) revert IdentifierNotFound(identifierHash);

        uint256 tokenId = _records[identifierHash].tokenId;

        delete _records[identifierHash];
        _linked[identifierHash] = false;
        _idCounts[tokenId]--;

        emit IdentifierUnlinked(identifierHash, tokenId, msg.sender);
    }

    /**
     * @notice Links multiple identifiers to the same token in one transaction.
     * @param identifierHashes Array of identifier hashes.
     * @param tokenId          The asset token ID.
     * @param idTypes          Array of identifier types (parallel to hashes).
     */
    function linkBatch(
        bytes32[] calldata identifierHashes,
        uint256 tokenId,
        IdentifierType[] calldata idTypes
    ) external {
        _authorizeResolver();
        uint256 len = identifierHashes.length;
        require(len == idTypes.length, "Array length mismatch");
        require(len > 0, "Empty batch");

        for (uint256 i = 0; i < len; i++) {
            bytes32 h = identifierHashes[i];
            if (h == bytes32(0)) revert ZeroIdentifier();
            if (_linked[h]) revert IdentifierAlreadyLinked(h, _records[h].tokenId);

            _records[h] = IdentifierRecord({
                tokenId: tokenId,
                idType: idTypes[i],
                registeredAt: block.timestamp,
                registeredBy: msg.sender
            });
            _linked[h] = true;
            _idCounts[tokenId]++;

            emit IdentifierLinked(h, tokenId, idTypes[i], msg.sender);
        }
    }

    // ── View Functions ─────────────────────────────────────────

    function resolve(bytes32 identifierHash) external view override returns (uint256) {
        if (!_linked[identifierHash]) revert IdentifierNotFound(identifierHash);
        return _records[identifierHash].tokenId;
    }

    function getIdentifier(bytes32 identifierHash)
        external
        view
        override
        returns (IdentifierRecord memory)
    {
        if (!_linked[identifierHash]) revert IdentifierNotFound(identifierHash);
        return _records[identifierHash];
    }

    function isLinked(bytes32 identifierHash) external view override returns (bool) {
        return _linked[identifierHash];
    }

    function identifierCount(uint256 tokenId) external view override returns (uint256) {
        return _idCounts[tokenId];
    }

    // ── Internal — Access hook ─────────────────────────────────

    function _authorizeResolver() internal virtual;
}
