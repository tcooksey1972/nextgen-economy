// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/utils/structs/BitMaps.sol";

/**
 * @title DeviceBitMap
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Abstract mixin providing gas-efficient bulk device status tracking
 *         using OpenZeppelin BitMaps.
 *
 * Standard mappings use one 32-byte storage slot per device for a boolean flag.
 * BitMaps pack 256 booleans into a single slot, reducing storage costs by ~256x
 * for large device fleets. This is ideal for:
 *   - Device allowlists / blocklists
 *   - Firmware update acknowledgment tracking
 *   - Feature flags per device
 *
 * @dev Each bitmap is identified by a string key. Multiple independent bitmaps
 *      can coexist (e.g., "allowlisted", "firmware-acked", "premium").
 */
abstract contract DeviceBitMap {
    using BitMaps for BitMaps.BitMap;

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    event DeviceFlagSet(bytes32 indexed bitmap, uint256 indexed deviceId, bool value);

    // ──────────────────────────────────────────────
    //  Storage
    // ──────────────────────────────────────────────

    /// @dev Maps bitmap name hash → bitmap data.
    mapping(bytes32 => BitMaps.BitMap) private _bitmaps;

    // ──────────────────────────────────────────────
    //  Internal functions
    // ──────────────────────────────────────────────

    /**
     * @dev Sets or unsets a device flag in a named bitmap.
     * @param bitmap Name hash of the bitmap (e.g., keccak256("allowlisted")).
     * @param deviceId The device ID.
     * @param value True to set, false to unset.
     */
    function _setDeviceFlag(bytes32 bitmap, uint256 deviceId, bool value) internal {
        _bitmaps[bitmap].setTo(deviceId, value);
        emit DeviceFlagSet(bitmap, deviceId, value);
    }

    /**
     * @dev Returns whether a device flag is set in a named bitmap.
     * @param bitmap Name hash of the bitmap.
     * @param deviceId The device ID.
     */
    function _getDeviceFlag(bytes32 bitmap, uint256 deviceId) internal view returns (bool) {
        return _bitmaps[bitmap].get(deviceId);
    }

    // ──────────────────────────────────────────────
    //  View functions (external)
    // ──────────────────────────────────────────────

    /**
     * @notice Returns whether a device has a specific flag set.
     * @param bitmap Name hash of the bitmap.
     * @param deviceId The device ID.
     */
    function hasDeviceFlag(bytes32 bitmap, uint256 deviceId) external view returns (bool) {
        return _bitmaps[bitmap].get(deviceId);
    }
}
