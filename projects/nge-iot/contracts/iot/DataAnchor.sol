// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./interfaces/IDataAnchor.sol";

/**
 * @title DataAnchor
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Abstract contract for tamper-proof on-chain anchoring of IoT
 *         sensor data hashes.
 *
 * Devices (or their authorized relayers) submit keccak256 hashes of
 * sensor readings. The contract stores a minimal proof record: device ID,
 * timestamp, and block number. Raw data never goes on-chain.
 *
 * Supports single and batch anchoring. Batch anchoring computes a single
 * root hash from multiple data hashes, storing one record for gas efficiency.
 *
 * @dev Composability:
 *   Uses virtual hooks (`_authorizeAnchorSubmitter`, `_onDataAnchored`)
 *   instead of inheriting Ownable. This allows composition with Sentinel
 *   modules (WatchdogAlert for anomaly detection on submission patterns,
 *   RateLimiter for throttling submissions).
 *
 * Usage:
 *   contract MyAnchor is Ownable, DataAnchor {
 *       constructor() Ownable(msg.sender) {}
 *
 *       function _authorizeAnchorSubmitter(uint256) internal view override {
 *           _checkOwner();
 *       }
 *   }
 */
abstract contract DataAnchor is IDataAnchor {
    // ──────────────────────────────────────────────
    //  Storage
    // ──────────────────────────────────────────────

    /// @dev Maps data hash → anchor record.
    mapping(bytes32 => Anchor) private _anchors;

    /// @dev Per-device submission count.
    mapping(uint256 => uint256) private _deviceAnchorCounts;

    /// @dev Per-device replay protection nonce.
    mapping(uint256 => uint256) private _deviceNonces;

    // ──────────────────────────────────────────────
    //  External functions
    // ──────────────────────────────────────────────

    /**
     * @notice Anchors a single data hash for a device.
     * @param deviceId The device that produced the data.
     * @param dataHash keccak256 hash of the sensor reading.
     */
    function anchorData(uint256 deviceId, bytes32 dataHash) external {
        _authorizeAnchorSubmitter(deviceId);
        if (dataHash == bytes32(0)) revert InvalidDataHash();
        if (_anchors[dataHash].timestamp != 0) revert AlreadyAnchored(dataHash);

        uint256 nonce = _deviceNonces[deviceId]++;
        _anchors[dataHash] = Anchor({
            deviceId: deviceId,
            timestamp: block.timestamp,
            blockNumber: block.number
        });
        _deviceAnchorCounts[deviceId]++;

        emit DataAnchored(deviceId, dataHash, block.timestamp, nonce);

        _onDataAnchored(deviceId, dataHash);
    }

    /**
     * @notice Anchors a batch of data hashes as a single root.
     * @dev Computes `keccak256(abi.encodePacked(dataHashes))` as the batch root.
     *      Individual hashes can be verified off-chain against the root.
     * @param deviceId The device that produced the data.
     * @param dataHashes Array of data hashes to batch-anchor.
     */
    function anchorBatch(uint256 deviceId, bytes32[] calldata dataHashes) external {
        _authorizeAnchorSubmitter(deviceId);
        if (dataHashes.length == 0) revert EmptyBatch();

        bytes32 batchRoot = keccak256(abi.encodePacked(dataHashes));
        if (_anchors[batchRoot].timestamp != 0) revert AlreadyAnchored(batchRoot);

        _deviceNonces[deviceId]++;
        _anchors[batchRoot] = Anchor({
            deviceId: deviceId,
            timestamp: block.timestamp,
            blockNumber: block.number
        });
        _deviceAnchorCounts[deviceId]++;

        emit BatchAnchored(deviceId, batchRoot, dataHashes.length, block.timestamp);

        _onDataAnchored(deviceId, batchRoot);
    }

    // ──────────────────────────────────────────────
    //  View functions
    // ──────────────────────────────────────────────

    /// @inheritdoc IDataAnchor
    function isAnchored(bytes32 dataHash) external view returns (bool) {
        return _anchors[dataHash].timestamp != 0;
    }

    /// @inheritdoc IDataAnchor
    function getAnchor(bytes32 dataHash)
        external
        view
        returns (uint256 deviceId, uint256 timestamp, uint256 blockNumber)
    {
        Anchor storage a = _anchors[dataHash];
        if (a.timestamp == 0) revert AnchorNotFound(dataHash);
        return (a.deviceId, a.timestamp, a.blockNumber);
    }

    /// @inheritdoc IDataAnchor
    function deviceAnchorCount(uint256 deviceId) external view returns (uint256) {
        return _deviceAnchorCounts[deviceId];
    }

    /// @inheritdoc IDataAnchor
    function deviceNonce(uint256 deviceId) external view returns (uint256) {
        return _deviceNonces[deviceId];
    }

    // ──────────────────────────────────────────────
    //  Virtual hooks — implement in inheriting contract
    // ──────────────────────────────────────────────

    /**
     * @dev Override to control who can submit data for a device.
     *      Revert if unauthorized. Typical checks: device owner, authorized
     *      relayer, or the device address itself.
     */
    function _authorizeAnchorSubmitter(uint256 deviceId) internal virtual;

    /**
     * @dev Hook called after data is anchored. Override to integrate with
     *      Sentinel modules (e.g., WatchdogAlert for anomaly detection).
     *      Default implementation is a no-op.
     */
    function _onDataAnchored(uint256 deviceId, bytes32 dataHash) internal virtual {
        // solhint-disable-next-line no-empty-blocks
    }
}
