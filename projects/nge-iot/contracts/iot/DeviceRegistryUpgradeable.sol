// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./interfaces/IDeviceRegistry.sol";

/**
 * @title DeviceRegistryUpgradeable
 * @author Cloud Creations LLC — NextGen Economy
 * @notice UUPS-upgradeable version of DeviceRegistry for production deployments.
 *
 * Uses OpenZeppelin's UUPS proxy pattern. The upgrade logic lives in this
 * implementation contract (not in the proxy), making it cheaper to deploy.
 *
 * Key differences from the non-upgradeable version:
 *   - Uses `initialize()` instead of `constructor()`
 *   - Uses OpenZeppelin upgradeable base contracts
 *   - Includes `_authorizeUpgrade()` gated by `onlyOwner`
 *   - Storage gaps (`__gap`) for future upgrade safety
 *
 * Deploy via:
 *   const proxy = await upgrades.deployProxy(DeviceRegistryUpgradeable, [], { kind: "uups" });
 */
contract DeviceRegistryUpgradeable is
    ERC721EnumerableUpgradeable,
    ERC721URIStorageUpgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    IDeviceRegistry
{
    // ──────────────────────────────────────────────
    //  Storage
    // ──────────────────────────────────────────────

    uint256 private _nextDeviceId;
    mapping(uint256 => DeviceStatus) private _deviceStatuses;
    mapping(uint256 => bytes32) private _firmwareHashes;

    /// @dev Reserved storage gap for future upgrades (50 slots).
    uint256[47] private __gap;

    // ──────────────────────────────────────────────
    //  Initializer (replaces constructor)
    // ──────────────────────────────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() public initializer {
        __ERC721_init("NGE IoT Device", "NGED");
        __ERC721Enumerable_init();
        __ERC721URIStorage_init();
        __Ownable_init(msg.sender);
    }

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
        address owner_,
        bytes32 fwHash,
        string calldata uri
    ) external onlyOwner returns (uint256 deviceId) {
        if (fwHash == bytes32(0)) revert InvalidFirmwareHash();

        deviceId = _nextDeviceId++;
        _safeMint(owner_, deviceId);
        _setTokenURI(deviceId, uri);

        _deviceStatuses[deviceId] = DeviceStatus.Active;
        _firmwareHashes[deviceId] = fwHash;

        emit DeviceRegistered(deviceId, owner_, fwHash);
    }

    // ──────────────────────────────────────────────
    //  External functions — Lifecycle
    // ──────────────────────────────────────────────

    function deactivateDevice(uint256 deviceId) external onlyActiveDevice(deviceId) {
        if (ownerOf(deviceId) != msg.sender) {
            revert NotDeviceOwner(deviceId, msg.sender);
        }
        _deviceStatuses[deviceId] = DeviceStatus.Inactive;
        emit DeviceDeactivated(deviceId);
    }

    function reactivateDevice(uint256 deviceId) external onlyOwner {
        if (_deviceStatuses[deviceId] == DeviceStatus.Active) {
            revert DeviceAlreadyActive(deviceId);
        }
        _deviceStatuses[deviceId] = DeviceStatus.Active;
        emit DeviceReactivated(deviceId);
    }

    function suspendDevice(uint256 deviceId) external onlyOwner onlyActiveDevice(deviceId) {
        _deviceStatuses[deviceId] = DeviceStatus.Suspended;
        emit DeviceSuspended(deviceId);
    }

    function updateFirmware(uint256 deviceId, bytes32 newHash) external onlyOwner {
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

    // ──────────────────────────────────────────────
    //  UUPS — Upgrade authorization
    // ──────────────────────────────────────────────

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ──────────────────────────────────────────────
    //  Required overrides
    // ──────────────────────────────────────────────

    function _update(address to, uint256 tokenId, address auth)
        internal override(ERC721EnumerableUpgradeable, ERC721Upgradeable) returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value)
        internal override(ERC721EnumerableUpgradeable, ERC721Upgradeable)
    {
        super._increaseBalance(account, value);
    }

    function tokenURI(uint256 tokenId)
        public view override(ERC721Upgradeable, ERC721URIStorageUpgradeable) returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public view override(ERC721EnumerableUpgradeable, ERC721URIStorageUpgradeable) returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
