// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "./interfaces/IDeviceRegistry.sol";

/**
 * @title MetaTxDeviceRegistry
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Abstract ERC-721 device registry with ERC-2771 meta-transaction support.
 *
 * Enables gasless device operations via a trusted forwarder. IoT devices don't
 * need ETH — a relayer pays gas on their behalf. The contract uses
 * `_msgSender()` instead of `msg.sender` for all authorization checks, so
 * both direct calls and relayed calls work correctly.
 *
 * This is a separate contract from DeviceRegistry (not an extension) because
 * ERC2771Context requires overriding `_msgSender()` and `_msgData()` which
 * affects the entire ERC721 inheritance chain.
 *
 * @dev Composability:
 *   Uses the same virtual hook pattern as DeviceRegistry. Compatible with
 *   Sentinel modules and DataAnchor.
 */
abstract contract MetaTxDeviceRegistry is
    ERC2771Context,
    ERC721Enumerable,
    ERC721URIStorage,
    IDeviceRegistry
{
    // ──────────────────────────────────────────────
    //  Storage
    // ──────────────────────────────────────────────

    uint256 private _nextDeviceId;
    mapping(uint256 => DeviceStatus) private _deviceStatuses;
    mapping(uint256 => bytes32) private _firmwareHashes;

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    constructor(address trustedForwarder)
        ERC2771Context(trustedForwarder)
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
    //  External functions — Registration
    // ──────────────────────────────────────────────

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

    function deactivateDevice(uint256 deviceId) external onlyActiveDevice(deviceId) {
        if (ownerOf(deviceId) != _msgSender()) {
            revert NotDeviceOwner(deviceId, _msgSender());
        }
        _deviceStatuses[deviceId] = DeviceStatus.Inactive;
        emit DeviceDeactivated(deviceId);
    }

    function reactivateDevice(uint256 deviceId) external {
        _authorizeRegistryAdmin();
        if (_deviceStatuses[deviceId] == DeviceStatus.Active) {
            revert DeviceAlreadyActive(deviceId);
        }
        _deviceStatuses[deviceId] = DeviceStatus.Active;
        emit DeviceReactivated(deviceId);
    }

    function suspendDevice(uint256 deviceId) external onlyActiveDevice(deviceId) {
        _authorizeRegistryAdmin();
        _deviceStatuses[deviceId] = DeviceStatus.Suspended;
        emit DeviceSuspended(deviceId);
    }

    function updateFirmware(uint256 deviceId, bytes32 newHash) external {
        _authorizeRegistryAdmin();
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
    //  Required overrides — ERC721 + ERC2771
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

    /// @dev Use ERC2771Context._msgSender() for all sender resolution.
    function _msgSender() internal view override(Context, ERC2771Context) returns (address) {
        return ERC2771Context._msgSender();
    }

    /// @dev Use ERC2771Context._msgData() for all data resolution.
    function _msgData() internal view override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }

    /// @dev Use ERC2771Context._contextSuffixLength().
    function _contextSuffixLength() internal view override(Context, ERC2771Context) returns (uint256) {
        return ERC2771Context._contextSuffixLength();
    }

    // ──────────────────────────────────────────────
    //  Virtual hooks
    // ──────────────────────────────────────────────

    function _authorizeRegistryAdmin() internal virtual;
}
