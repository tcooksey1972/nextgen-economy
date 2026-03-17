// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../iot/DeviceRegistry.sol";
import "../iot/MerkleOnboarding.sol";
import "../iot/DeviceBitMap.sol";
import "../iot/DeviceReputation.sol";

/**
 * @title MerkleDeviceRegistry
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Full-featured DeviceRegistry combining Merkle onboarding, BitMap
 *         status tracking, and Checkpoints-based reputation.
 *
 * Demonstrates composition of four new OpenZeppelin integrations:
 *   - MerkleProof: Batch device onboarding via allowlists
 *   - BitMaps: Gas-efficient device flags (allowlisted, premium, etc.)
 *   - Checkpoints: Historical reputation scoring with time-travel lookups
 *   - Ownable: Single-owner access control
 */
contract MerkleDeviceRegistry is Ownable, DeviceRegistry, MerkleOnboarding, DeviceBitMap, DeviceReputation {
    bytes32 public constant ALLOWLISTED = keccak256("allowlisted");
    bytes32 public constant PREMIUM = keccak256("premium");

    uint208 public constant INITIAL_REPUTATION = 5000; // 50%

    /// @dev Flag to allow claimDevice to bypass admin check in registerDevice.
    bool private _merkleClaimActive;

    constructor() Ownable(msg.sender) DeviceRegistry() {}

    /**
     * @notice Claims a device registration using a Merkle proof.
     * @dev The caller must be the device owner specified in the allowlist.
     */
    function claimDevice(
        bytes32 fwHash,
        string calldata uri,
        bytes32[] calldata proof
    ) external returns (uint256 deviceId) {
        bytes32 leaf = _verifyAndClaimMerkle(msg.sender, fwHash, uri, proof);

        // Temporarily allow registerDevice without admin check
        _merkleClaimActive = true;
        deviceId = this.registerDevice(msg.sender, fwHash, uri);
        _merkleClaimActive = false;

        // Set initial flags and reputation
        _setDeviceFlag(ALLOWLISTED, deviceId, true);
        _updateReputation(deviceId, INITIAL_REPUTATION);

        emit DeviceClaimedViaMerkle(deviceId, msg.sender, leaf);
    }

    /**
     * @notice Admin sets a device flag (allowlisted, premium, etc.).
     */
    function setDeviceFlag(bytes32 bitmap, uint256 deviceId, bool value) external onlyOwner {
        _setDeviceFlag(bitmap, deviceId, value);
    }

    /**
     * @notice Admin updates a device's reputation score.
     */
    function updateDeviceReputation(uint256 deviceId, uint208 score) external onlyOwner {
        _updateReputation(deviceId, score);
    }

    // ──────────────────────────────────────────────
    //  Virtual hook implementations
    // ──────────────────────────────────────────────

    /// @dev Allows admin OR active Merkle claim.
    function _authorizeRegistryAdmin() internal view override {
        if (!_merkleClaimActive) {
            _checkOwner();
        }
    }

    function _authorizeMerkleAdmin() internal view override {
        _checkOwner();
    }
}
