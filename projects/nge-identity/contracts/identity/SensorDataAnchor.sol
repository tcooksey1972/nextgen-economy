// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "./interfaces/ISensorDataAnchor.sol";

/**
 * @title SensorDataAnchor
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Registers IoT sensor data Merkle roots for provenance.
 *
 * Sensor readings are batched off-chain. The Merkle root of each batch
 * is anchored on-chain, allowing any individual reading to be verified
 * against its batch root without storing raw data on-chain.
 *
 * Uses AccessControl for device registration management:
 *   - DEFAULT_ADMIN_ROLE: Full admin
 *   - DEVICE_MANAGER_ROLE: Can register/deregister devices
 *   - ANCHOR_SUBMITTER_ROLE: Can submit data anchors (relayers)
 *
 * @dev Reuses patterns from the existing nge-iot DataAnchor but adds
 *      DID-based device identity and Merkle proof verification.
 */
contract SensorDataAnchor is AccessControl, ISensorDataAnchor {
    // ──────────────────────────────────────────────
    //  Roles
    // ──────────────────────────────────────────────

    bytes32 public constant DEVICE_MANAGER_ROLE = keccak256("DEVICE_MANAGER_ROLE");
    bytes32 public constant ANCHOR_SUBMITTER_ROLE = keccak256("ANCHOR_SUBMITTER_ROLE");

    // ──────────────────────────────────────────────
    //  Storage
    // ──────────────────────────────────────────────

    /// @dev Batch ID → DataBatch record
    mapping(bytes32 => DataBatch) private _batches;

    /// @dev Device DID → list of batch IDs
    mapping(bytes32 => bytes32[]) private _deviceBatches;

    /// @dev Registered device DIDs
    mapping(bytes32 => bool) private _registeredDevices;

    /// @dev Total number of anchored batches
    uint256 private _batchCount;

    /// @dev Total number of registered devices
    uint256 private _deviceCount;

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(DEVICE_MANAGER_ROLE, msg.sender);
        _grantRole(ANCHOR_SUBMITTER_ROLE, msg.sender);
    }

    // ──────────────────────────────────────────────
    //  Device Management
    // ──────────────────────────────────────────────

    /**
     * @notice Registers a device DID for data anchoring.
     * @param deviceDID The DID hash of the IoT device
     */
    function registerDevice(bytes32 deviceDID) external onlyRole(DEVICE_MANAGER_ROLE) {
        if (_registeredDevices[deviceDID]) revert DeviceAlreadyRegistered(deviceDID);

        _registeredDevices[deviceDID] = true;
        _deviceCount++;

        emit DeviceRegistered(deviceDID, msg.sender);
    }

    /**
     * @notice Deregisters a device DID.
     * @param deviceDID The DID hash to deregister
     */
    function deregisterDevice(bytes32 deviceDID) external onlyRole(DEVICE_MANAGER_ROLE) {
        if (!_registeredDevices[deviceDID]) revert DeviceNotRegistered(deviceDID);

        _registeredDevices[deviceDID] = false;
        _deviceCount--;

        emit DeviceDeregistered(deviceDID);
    }

    /**
     * @notice Checks if a device is registered.
     * @param deviceDID The DID hash to check
     * @return True if the device is registered
     */
    function isDeviceRegistered(bytes32 deviceDID) external view returns (bool) {
        return _registeredDevices[deviceDID];
    }

    // ──────────────────────────────────────────────
    //  Data Anchoring
    // ──────────────────────────────────────────────

    /**
     * @notice Anchors a batch of sensor readings via Merkle root.
     * @param batchId Unique ID for this batch
     * @param deviceDID DID of the device that produced the data
     * @param merkleRoot Root of the Merkle tree containing sensor readings
     * @param readingCount Number of readings in the batch
     * @param startTimestamp Timestamp of the first reading
     * @param endTimestamp Timestamp of the last reading
     * @param metadataURI URI to batch metadata (IPFS/S3)
     */
    function anchorBatch(
        bytes32 batchId,
        bytes32 deviceDID,
        bytes32 merkleRoot,
        uint256 readingCount,
        uint256 startTimestamp,
        uint256 endTimestamp,
        string calldata metadataURI
    ) external onlyRole(ANCHOR_SUBMITTER_ROLE) {
        if (!_registeredDevices[deviceDID]) revert DeviceNotRegistered(deviceDID);
        if (_batches[batchId].anchoredAt != 0) revert BatchAlreadyAnchored(batchId);
        if (merkleRoot == bytes32(0)) revert InvalidMerkleRoot();
        if (readingCount == 0) revert InvalidReadingCount();
        if (startTimestamp > endTimestamp) revert InvalidTimestamps();

        _batches[batchId] = DataBatch({
            deviceDID: deviceDID,
            merkleRoot: merkleRoot,
            readingCount: readingCount,
            startTimestamp: startTimestamp,
            endTimestamp: endTimestamp,
            metadataURI: metadataURI,
            anchoredAt: block.timestamp
        });

        _deviceBatches[deviceDID].push(batchId);
        _batchCount++;

        emit DataAnchored(batchId, deviceDID, merkleRoot, readingCount);
    }

    // ──────────────────────────────────────────────
    //  Verification
    // ──────────────────────────────────────────────

    /**
     * @notice Verifies a sensor reading against its batch's Merkle root.
     * @param batchId The batch containing the reading
     * @param leaf The hashed reading (leaf node)
     * @param proof The Merkle proof path
     * @return True if the reading is verified
     */
    function verifyReading(
        bytes32 batchId,
        bytes32 leaf,
        bytes32[] calldata proof
    ) external view returns (bool) {
        DataBatch storage batch = _batches[batchId];
        if (batch.anchoredAt == 0) revert BatchNotFound(batchId);

        return MerkleProof.verify(proof, batch.merkleRoot, leaf);
    }

    // ──────────────────────────────────────────────
    //  Query functions
    // ──────────────────────────────────────────────

    /**
     * @notice Returns a batch record.
     * @param batchId The batch to look up
     * @return The batch record
     */
    function getBatch(bytes32 batchId) external view returns (DataBatch memory) {
        if (_batches[batchId].anchoredAt == 0) revert BatchNotFound(batchId);
        return _batches[batchId];
    }

    /**
     * @notice Returns all batch IDs for a device.
     * @param deviceDID The device DID to query
     * @return Array of batch IDs
     */
    function getDeviceBatches(bytes32 deviceDID) external view returns (bytes32[] memory) {
        return _deviceBatches[deviceDID];
    }

    /**
     * @notice Returns the total number of anchored batches.
     */
    function batchCount() external view returns (uint256) {
        return _batchCount;
    }

    /**
     * @notice Returns the total number of registered devices.
     */
    function deviceCount() external view returns (uint256) {
        return _deviceCount;
    }
}
