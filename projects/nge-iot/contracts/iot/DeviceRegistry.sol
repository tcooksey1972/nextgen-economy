// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "./interfaces/IDeviceRegistry.sol";

/**
 * @title DeviceRegistry
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Abstract ERC-721-based IoT device identity and lifecycle management.
 *
 * Each registered device is minted as an NFT. The token ID doubles as the
 * device ID. Transferring the NFT transfers device ownership.
 *
 * On-chain storage is minimal: status enum + firmware hash per device.
 * Rich metadata (manufacturer, location, capabilities) lives off-chain
 * in the tokenURI.
 *
 * @dev Composability:
 *   This contract does NOT inherit Ownable — it uses a virtual
 *   `_authorizeRegistryAdmin()` function instead. The inheriting contract
 *   provides the access control. This avoids diamond inheritance conflicts
 *   when composing with Sentinel modules.
 *
 * Usage:
 *   contract MyRegistry is Ownable, DeviceRegistry {
 *       constructor()
 *           Ownable(msg.sender)
 *           DeviceRegistry()
 *       {}
 *
 *       function _authorizeRegistryAdmin() internal view override {
 *           _checkOwner();
 *       }
 *   }
 */
abstract contract DeviceRegistry is ERC721Enumerable, ERC721URIStorage, IDeviceRegistry {
    // ──────────────────────────────────────────────
    //  Storage
    // ──────────────────────────────────────────────

    /// @dev Auto-incrementing device ID counter.
    uint256 private _nextDeviceId;

    /// @dev Lifecycle status per device.
    mapping(uint256 => DeviceStatus) private _deviceStatuses;

    /// @dev Firmware hash per device.
    mapping(uint256 => bytes32) private _firmwareHashes;

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    constructor() ERC721("NGE IoT Device", "NGED") {}

    // ──────────────────────────────────────────────
    //  Modifiers
    // ──────────────────────────────────────────────

    /// @dev Reverts if the device is not in Active status.
    modifier onlyActiveDevice(uint256 deviceId) {
        if (_deviceStatuses[deviceId] != DeviceStatus.Active) {
            revert DeviceNotActive(deviceId);
        }
        _;
    }

    // ──────────────────────────────────────────────
    //  External functions — Registration
    // ──────────────────────────────────────────────

    /**
     * @notice Registers a new IoT device by minting an NFT.
     * @param owner Address that will own the device NFT.
     * @param fwHash Hash of the device's current firmware.
     * @param uri Metadata URI for off-chain device info.
     * @return deviceId The ID assigned to the new device.
     */
    function registerDevice(
        address owner,
        bytes32 fwHash,
        string calldata uri
    ) external returns (uint256 deviceId) {
        _authorizeRegistryAdmin();
        if (fwHash == bytes32(0)) revert InvalidFirmwareHash();

        deviceId = _nextDeviceId++;
        _safeMint(owner, deviceId);
        _setTokenURI(deviceId, uri);

        _deviceStatuses[deviceId] = DeviceStatus.Active;
        _firmwareHashes[deviceId] = fwHash;

        emit DeviceRegistered(deviceId, owner, fwHash);
    }

    // ──────────────────────────────────────────────
    //  External functions — Lifecycle
    // ──────────────────────────────────────────────

    /**
     * @notice Deactivates a device. Can be called by the device owner.
     * @param deviceId The device to deactivate.
     */
    function deactivateDevice(uint256 deviceId) external onlyActiveDevice(deviceId) {
        if (ownerOf(deviceId) != msg.sender) {
            revert NotDeviceOwner(deviceId, msg.sender);
        }

        _deviceStatuses[deviceId] = DeviceStatus.Inactive;
        emit DeviceDeactivated(deviceId);
    }

    /**
     * @notice Reactivates an inactive device. Admin only.
     * @param deviceId The device to reactivate.
     */
    function reactivateDevice(uint256 deviceId) external {
        _authorizeRegistryAdmin();
        if (_deviceStatuses[deviceId] == DeviceStatus.Active) {
            revert DeviceAlreadyActive(deviceId);
        }

        _deviceStatuses[deviceId] = DeviceStatus.Active;
        emit DeviceReactivated(deviceId);
    }

    /**
     * @notice Suspends a device (admin action for compromised devices).
     * @param deviceId The device to suspend.
     */
    function suspendDevice(uint256 deviceId) external onlyActiveDevice(deviceId) {
        _authorizeRegistryAdmin();

        _deviceStatuses[deviceId] = DeviceStatus.Suspended;
        emit DeviceSuspended(deviceId);
    }

    /**
     * @notice Updates the firmware hash of a device. Admin only.
     * @param deviceId The device to update.
     * @param newHash The new firmware hash.
     */
    function updateFirmware(uint256 deviceId, bytes32 newHash) external {
        _authorizeRegistryAdmin();
        if (newHash == bytes32(0)) revert InvalidFirmwareHash();

        // Device must exist (ownerOf reverts for non-existent tokens)
        ownerOf(deviceId);

        bytes32 oldHash = _firmwareHashes[deviceId];
        _firmwareHashes[deviceId] = newHash;

        emit FirmwareUpdated(deviceId, oldHash, newHash);
    }

    // ──────────────────────────────────────────────
    //  View functions
    // ──────────────────────────────────────────────

    /// @inheritdoc IDeviceRegistry
    function deviceStatus(uint256 deviceId) external view returns (DeviceStatus) {
        ownerOf(deviceId); // reverts if device doesn't exist
        return _deviceStatuses[deviceId];
    }

    /// @inheritdoc IDeviceRegistry
    function firmwareHash(uint256 deviceId) external view returns (bytes32) {
        ownerOf(deviceId); // reverts if device doesn't exist
        return _firmwareHashes[deviceId];
    }

    /// @inheritdoc IDeviceRegistry
    function isDeviceActive(uint256 deviceId) external view returns (bool) {
        // Return false for non-existent devices instead of reverting
        try this.ownerOf(deviceId) returns (address) {
            return _deviceStatuses[deviceId] == DeviceStatus.Active;
        } catch {
            return false;
        }
    }

    /// @inheritdoc IDeviceRegistry
    function deviceCount() external view returns (uint256) {
        return _nextDeviceId;
    }

    // ──────────────────────────────────────────────
    //  Internal — device status helper
    // ──────────────────────────────────────────────

    /// @dev Returns true if the device exists and is Active. For use by subcontracts.
    function _isDeviceActive(uint256 deviceId) internal view returns (bool) {
        if (deviceId >= _nextDeviceId) return false;
        return _deviceStatuses[deviceId] == DeviceStatus.Active;
    }

    // ──────────────────────────────────────────────
    //  Required overrides — ERC721 multiple inheritance
    // ──────────────────────────────────────────────

    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721, ERC721Enumerable)
        returns (address)
    {
        _beforeDeviceTransfer(tokenId);
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721, ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Enumerable, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    // ──────────────────────────────────────────────
    //  Virtual hooks — implement in inheriting contract
    // ──────────────────────────────────────────────

    /**
     * @dev Override to provide access control for admin functions
     *      (registerDevice, reactivateDevice, suspendDevice, updateFirmware).
     *      Revert if unauthorized.
     */
    function _authorizeRegistryAdmin() internal virtual;

    /**
     * @dev Hook called before any device NFT transfer. Override to add
     *      Sentinel module integration (e.g., rate-limit device transfers).
     *      Default implementation is a no-op.
     */
    function _beforeDeviceTransfer(uint256 deviceId) internal virtual {
        // solhint-disable-next-line no-empty-blocks
    }
}
