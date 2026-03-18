// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../iot/DeviceToken.sol";

/**
 * @title SimpleDeviceToken
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Concrete ERC-1155 multi-token for IoT device types and sensor credits.
 *
 * Demonstrates the DeviceToken (ERC1155) integration with predefined token types
 * for a typical IoT platform:
 *   - ID 0: Sensor Data Credits (fungible)
 *   - ID 1: Compute Credits (fungible)
 *   - ID 1000+: Unique Device NFTs (non-fungible)
 */
contract SimpleDeviceToken is Ownable, DeviceToken {
    uint256 public constant SENSOR_CREDITS = 0;
    uint256 public constant COMPUTE_CREDITS = 1;

    constructor()
        Ownable(msg.sender)
        DeviceToken("https://api.nextgen.economy/tokens/{id}.json")
    {}

    function _authorizeDeviceTokenAdmin() internal view override {
        _checkOwner();
    }
}
