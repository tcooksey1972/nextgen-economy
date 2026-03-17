// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/utils/structs/Checkpoints.sol";

/**
 * @title DeviceReputation
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Abstract mixin for historical device reputation tracking using
 *         OpenZeppelin Checkpoints.
 *
 * Records reputation scores for devices at specific timestamps, enabling:
 *   - Historical lookups: "What was device X's reputation at time T?"
 *   - Governance weight: Use reputation as voting power for device-based DAOs
 *   - Staking decisions: Historical reputation influences staking rewards
 *   - Audit trail: Immutable on-chain history of reputation changes
 *
 * Checkpoints are stored as (timestamp, value) pairs using binary search
 * for efficient lookups. Each device has its own checkpoint history.
 *
 * @dev Composability:
 *   Uses virtual hooks for authorization. Compatible with DeviceRegistry
 *   and Sentinel modules.
 */
abstract contract DeviceReputation {
    using Checkpoints for Checkpoints.Trace208;

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    event ReputationUpdated(uint256 indexed deviceId, uint208 oldScore, uint208 newScore);

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    error ReputationScoreOutOfRange(uint208 score, uint208 max);

    // ──────────────────────────────────────────────
    //  Constants
    // ──────────────────────────────────────────────

    /// @notice Maximum reputation score (basis points: 10000 = 100%).
    uint208 public constant MAX_REPUTATION = 10000;

    // ──────────────────────────────────────────────
    //  Storage
    // ──────────────────────────────────────────────

    /// @dev Per-device reputation checkpoint history.
    mapping(uint256 => Checkpoints.Trace208) private _reputations;

    // ──────────────────────────────────────────────
    //  Internal functions
    // ──────────────────────────────────────────────

    /**
     * @dev Updates the reputation score for a device. Creates a new checkpoint.
     * @param deviceId The device ID.
     * @param newScore New reputation score (0-10000 basis points).
     */
    function _updateReputation(uint256 deviceId, uint208 newScore) internal {
        if (newScore > MAX_REPUTATION) revert ReputationScoreOutOfRange(newScore, MAX_REPUTATION);

        uint208 oldScore = _currentReputation(deviceId);
        _reputations[deviceId].push(uint48(block.timestamp), newScore);
        emit ReputationUpdated(deviceId, oldScore, newScore);
    }

    /**
     * @dev Returns the current reputation score for a device.
     */
    function _currentReputation(uint256 deviceId) internal view returns (uint208) {
        return _reputations[deviceId].latest();
    }

    /**
     * @dev Returns the reputation score for a device at a specific timestamp.
     */
    function _reputationAt(uint256 deviceId, uint48 timestamp) internal view returns (uint208) {
        return _reputations[deviceId].upperLookupRecent(timestamp);
    }

    // ──────────────────────────────────────────────
    //  External view functions
    // ──────────────────────────────────────────────

    /**
     * @notice Returns the current reputation score of a device.
     * @param deviceId The device ID.
     * @return score The current reputation (0-10000 basis points).
     */
    function reputation(uint256 deviceId) external view returns (uint208) {
        return _currentReputation(deviceId);
    }

    /**
     * @notice Returns the reputation score of a device at a past timestamp.
     * @param deviceId The device ID.
     * @param timestamp The historical timestamp to query.
     * @return score The reputation at that time.
     */
    function reputationAt(uint256 deviceId, uint48 timestamp) external view returns (uint208) {
        return _reputationAt(deviceId, timestamp);
    }
}
