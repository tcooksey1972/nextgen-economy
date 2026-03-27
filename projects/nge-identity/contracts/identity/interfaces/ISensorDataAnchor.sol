// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title ISensorDataAnchor
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Interface for the NGE Sensor Data Anchor contract.
 */
interface ISensorDataAnchor {
    // ──────────────────────────────────────────────
    //  Structs
    // ──────────────────────────────────────────────

    struct DataBatch {
        bytes32 deviceDID;
        bytes32 merkleRoot;
        uint256 readingCount;
        uint256 startTimestamp;
        uint256 endTimestamp;
        string metadataURI;
        uint256 anchoredAt;
    }

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    event DeviceRegistered(bytes32 indexed deviceDID, address indexed registeredBy);
    event DeviceDeregistered(bytes32 indexed deviceDID);
    event DataAnchored(
        bytes32 indexed batchId,
        bytes32 indexed deviceDID,
        bytes32 merkleRoot,
        uint256 readingCount
    );

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    error DeviceNotRegistered(bytes32 deviceDID);
    error DeviceAlreadyRegistered(bytes32 deviceDID);
    error BatchAlreadyAnchored(bytes32 batchId);
    error BatchNotFound(bytes32 batchId);
    error InvalidMerkleRoot();
    error InvalidTimestamps();
    error InvalidReadingCount();
    error InvalidProof();
}
