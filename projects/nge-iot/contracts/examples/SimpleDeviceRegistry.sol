// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../iot/DeviceRegistry.sol";

/**
 * @title SimpleDeviceRegistry
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Minimal concrete DeviceRegistry using single-owner access control.
 *
 * Demonstrates basic usage of the DeviceRegistry abstract contract without
 * any Sentinel module integration. Suitable for simple IoT deployments
 * where a single admin manages device registration.
 */
contract SimpleDeviceRegistry is Ownable, DeviceRegistry {
    constructor() Ownable(msg.sender) DeviceRegistry() {}

    /// @dev Admin authorization — delegates to Ownable._checkOwner().
    function _authorizeRegistryAdmin() internal view override {
        _checkOwner();
    }
}
