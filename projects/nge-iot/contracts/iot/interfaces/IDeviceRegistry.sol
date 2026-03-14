// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title IDeviceRegistry
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Interface for ERC-721-based IoT device identity and lifecycle management.
 */
interface IDeviceRegistry {
    // ──────────────────────────────────────────────
    //  Types
    // ──────────────────────────────────────────────

    /// @notice Lifecycle status of a registered device.
    enum DeviceStatus {
        Inactive,   // Deactivated by owner — no longer operational
        Active,     // Operational and authorized to submit data
        Suspended   // Admin-suspended (e.g., compromised device)
    }

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    /// @notice Emitted when a new device is registered (NFT minted).
    event DeviceRegistered(
        uint256 indexed deviceId,
        address indexed owner,
        bytes32 firmwareHash
    );

    /// @notice Emitted when a device is deactivated by its owner.
    event DeviceDeactivated(uint256 indexed deviceId);

    /// @notice Emitted when a device is reactivated by an admin.
    event DeviceReactivated(uint256 indexed deviceId);

    /// @notice Emitted when a device is suspended by an admin.
    event DeviceSuspended(uint256 indexed deviceId);

    /// @notice Emitted when a device's firmware hash is updated.
    event FirmwareUpdated(
        uint256 indexed deviceId,
        bytes32 oldHash,
        bytes32 newHash
    );

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    /// @notice Thrown when an operation requires an active device.
    error DeviceNotActive(uint256 deviceId);

    /// @notice Thrown when attempting to activate an already-active device.
    error DeviceAlreadyActive(uint256 deviceId);

    /// @notice Thrown when a zero firmware hash is provided.
    error InvalidFirmwareHash();

    /// @notice Thrown when a caller is not authorized for device operations.
    error NotDeviceOwner(uint256 deviceId, address caller);

    // ──────────────────────────────────────────────
    //  View functions
    // ──────────────────────────────────────────────

    /// @notice Returns the lifecycle status of a device.
    function deviceStatus(uint256 deviceId) external view returns (DeviceStatus);

    /// @notice Returns the firmware hash of a device.
    function firmwareHash(uint256 deviceId) external view returns (bytes32);

    /// @notice Returns true if the device exists and is Active.
    function isDeviceActive(uint256 deviceId) external view returns (bool);

    /// @notice Returns the total number of registered devices.
    function deviceCount() external view returns (uint256);
}
