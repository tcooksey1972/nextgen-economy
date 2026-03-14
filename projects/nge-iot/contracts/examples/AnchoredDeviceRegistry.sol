// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../iot/DeviceRegistry.sol";
import "../iot/DataAnchor.sol";

/**
 * @title AnchoredDeviceRegistry
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Full-featured IoT contract combining device identity (ERC-721),
 *         data anchoring, and optional Sentinel module hooks.
 *
 * Demonstrates:
 *   - Device registration with ERC-721 ownership
 *   - On-chain data hash anchoring tied to registered devices
 *   - Only active devices can submit data
 *   - Device owners can anchor data for their own devices
 *
 * Sentinel integration points (virtual hooks are wired but Sentinel modules
 * are not directly inherited to keep this example self-contained within
 * nge-iot). A production deployment could add RateLimiter and WatchdogAlert
 * via multiple inheritance, following the FullSentinelVault pattern.
 */
contract AnchoredDeviceRegistry is Ownable, DeviceRegistry, DataAnchor {
    constructor() Ownable(msg.sender) DeviceRegistry() {}

    // ──────────────────────────────────────────────
    //  Virtual hook implementations — DeviceRegistry
    // ──────────────────────────────────────────────

    /// @dev Admin authorization — delegates to Ownable._checkOwner().
    function _authorizeRegistryAdmin() internal view override {
        _checkOwner();
    }

    // ──────────────────────────────────────────────
    //  Virtual hook implementations — DataAnchor
    // ──────────────────────────────────────────────

    /**
     * @dev Only the device NFT owner can submit data for that device,
     *      and the device must be in Active status.
     */
    function _authorizeAnchorSubmitter(uint256 deviceId) internal view override {
        if (!_isDeviceActive(deviceId)) {
            revert DeviceNotActive(deviceId);
        }
        if (ownerOf(deviceId) != msg.sender) {
            revert NotDeviceOwner(deviceId, msg.sender);
        }
    }
}
