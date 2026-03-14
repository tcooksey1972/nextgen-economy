// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title IDataAnchor
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Interface for tamper-proof on-chain anchoring of IoT sensor data hashes.
 */
interface IDataAnchor {
    // ──────────────────────────────────────────────
    //  Types
    // ──────────────────────────────────────────────

    /// @notice On-chain proof that a data hash was recorded at a specific time.
    struct Anchor {
        uint256 deviceId;
        uint256 timestamp;
        uint256 blockNumber;
    }

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    /// @notice Emitted when a single data hash is anchored.
    event DataAnchored(
        uint256 indexed deviceId,
        bytes32 indexed dataHash,
        uint256 timestamp,
        uint256 nonce
    );

    /// @notice Emitted when a batch of data hashes is anchored as one root.
    event BatchAnchored(
        uint256 indexed deviceId,
        bytes32 indexed batchRoot,
        uint256 count,
        uint256 timestamp
    );

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    /// @notice Thrown when a zero data hash is provided.
    error InvalidDataHash();

    /// @notice Thrown when a data hash has already been anchored.
    error AlreadyAnchored(bytes32 dataHash);

    /// @notice Thrown when an empty batch is submitted.
    error EmptyBatch();

    /// @notice Thrown when querying an anchor that does not exist.
    error AnchorNotFound(bytes32 dataHash);

    // ──────────────────────────────────────────────
    //  View functions
    // ──────────────────────────────────────────────

    /// @notice Returns true if a data hash has been anchored.
    function isAnchored(bytes32 dataHash) external view returns (bool);

    /// @notice Returns the anchor record for a data hash.
    function getAnchor(bytes32 dataHash) external view returns (uint256 deviceId, uint256 timestamp, uint256 blockNumber);

    /// @notice Returns the total number of anchors submitted by a device.
    function deviceAnchorCount(uint256 deviceId) external view returns (uint256);

    /// @notice Returns the current nonce for a device (increments with each anchor).
    function deviceNonce(uint256 deviceId) external view returns (uint256);
}
