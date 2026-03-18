// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/manager/AccessManaged.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "./interfaces/IDeviceRegistry.sol";
import "./DataAnchor.sol";

/**
 * @title DeviceAccessManaged
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Device registry + data anchoring controlled by a centralized
 *         AccessManager instead of single-owner (Ownable).
 *
 * Uses OpenZeppelin AccessManaged's `restricted` modifier on external
 * functions. The AccessManager contract controls which addresses can call
 * which functions via role-based permissions configured with
 * `setTargetFunctionRole()`.
 *
 * This enables:
 *   - Unified role management across IoT, Token, and Sentinel contracts
 *   - Fine-grained function-level permissions
 *   - Time-delayed role grants for sensitive operations
 */
contract DeviceAccessManaged is AccessManaged, ERC721Enumerable, ERC721URIStorage, IDeviceRegistry, DataAnchor {
    // ──────────────────────────────────────────────
    //  Storage
    // ──────────────────────────────────────────────

    uint256 private _nextDeviceId;
    mapping(uint256 => DeviceStatus) private _deviceStatuses;
    mapping(uint256 => bytes32) private _firmwareHashes;

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    constructor(address manager)
        AccessManaged(manager)
        ERC721("NGE IoT Device", "NGED")
    {}

    // ──────────────────────────────────────────────
    //  Modifiers
    // ──────────────────────────────────────────────

    modifier onlyActiveDevice(uint256 deviceId) {
        if (_deviceStatuses[deviceId] != DeviceStatus.Active) {
            revert DeviceNotActive(deviceId);
        }
        _;
    }

    // ──────────────────────────────────────────────
    //  External — Registration (restricted by AccessManager)
    // ──────────────────────────────────────────────

    function registerDevice(address owner_, bytes32 fwHash, string calldata uri)
        external restricted returns (uint256 deviceId)
    {
        if (fwHash == bytes32(0)) revert InvalidFirmwareHash();

        deviceId = _nextDeviceId++;
        _safeMint(owner_, deviceId);
        _setTokenURI(deviceId, uri);

        _deviceStatuses[deviceId] = DeviceStatus.Active;
        _firmwareHashes[deviceId] = fwHash;

        emit DeviceRegistered(deviceId, owner_, fwHash);
    }

    // ──────────────────────────────────────────────
    //  External — Lifecycle
    // ──────────────────────────────────────────────

    function deactivateDevice(uint256 deviceId) external onlyActiveDevice(deviceId) {
        if (ownerOf(deviceId) != msg.sender) {
            revert NotDeviceOwner(deviceId, msg.sender);
        }
        _deviceStatuses[deviceId] = DeviceStatus.Inactive;
        emit DeviceDeactivated(deviceId);
    }

    function reactivateDevice(uint256 deviceId) external restricted {
        if (_deviceStatuses[deviceId] == DeviceStatus.Active) {
            revert DeviceAlreadyActive(deviceId);
        }
        _deviceStatuses[deviceId] = DeviceStatus.Active;
        emit DeviceReactivated(deviceId);
    }

    function suspendDevice(uint256 deviceId) external restricted onlyActiveDevice(deviceId) {
        _deviceStatuses[deviceId] = DeviceStatus.Suspended;
        emit DeviceSuspended(deviceId);
    }

    function updateFirmware(uint256 deviceId, bytes32 newHash) external restricted {
        if (newHash == bytes32(0)) revert InvalidFirmwareHash();
        ownerOf(deviceId);

        bytes32 oldHash = _firmwareHashes[deviceId];
        _firmwareHashes[deviceId] = newHash;
        emit FirmwareUpdated(deviceId, oldHash, newHash);
    }

    // ──────────────────────────────────────────────
    //  View functions
    // ──────────────────────────────────────────────

    function deviceStatus(uint256 deviceId) external view returns (DeviceStatus) {
        ownerOf(deviceId);
        return _deviceStatuses[deviceId];
    }

    function firmwareHash(uint256 deviceId) external view returns (bytes32) {
        ownerOf(deviceId);
        return _firmwareHashes[deviceId];
    }

    function isDeviceActive(uint256 deviceId) external view returns (bool) {
        try this.ownerOf(deviceId) returns (address) {
            return _deviceStatuses[deviceId] == DeviceStatus.Active;
        } catch {
            return false;
        }
    }

    function deviceCount() external view returns (uint256) {
        return _nextDeviceId;
    }

    function _isDeviceActive(uint256 deviceId) internal view returns (bool) {
        if (deviceId >= _nextDeviceId) return false;
        return _deviceStatuses[deviceId] == DeviceStatus.Active;
    }

    // ──────────────────────────────────────────────
    //  DataAnchor hook — device owner can anchor data
    // ──────────────────────────────────────────────

    function _authorizeAnchorSubmitter(uint256 deviceId) internal view override {
        if (!_isDeviceActive(deviceId)) {
            revert DeviceNotActive(deviceId);
        }
        if (ownerOf(deviceId) != msg.sender) {
            revert NotDeviceOwner(deviceId, msg.sender);
        }
    }

    // ──────────────────────────────────────────────
    //  Required overrides — ERC721 multiple inheritance
    // ──────────────────────────────────────────────

    function _update(address to, uint256 tokenId, address auth)
        internal override(ERC721, ERC721Enumerable) returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value)
        internal override(ERC721, ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }

    function tokenURI(uint256 tokenId)
        public view override(ERC721, ERC721URIStorage) returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public view override(ERC721Enumerable, ERC721URIStorage) returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
