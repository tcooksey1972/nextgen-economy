// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../iot/DeviceReputation.sol";

/**
 * @title TestDeviceReputation
 * @notice Concrete harness that exposes DeviceReputation internals for testing.
 */
contract TestDeviceReputation is DeviceReputation {
    function updateReputation(uint256 deviceId, uint208 newScore) external {
        _updateReputation(deviceId, newScore);
    }
}
