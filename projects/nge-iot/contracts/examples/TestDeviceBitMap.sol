// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../iot/DeviceBitMap.sol";

/**
 * @title TestDeviceBitMap
 * @notice Concrete harness that exposes DeviceBitMap internals for testing.
 */
contract TestDeviceBitMap is DeviceBitMap {
    function setFlag(bytes32 bitmap, uint256 deviceId, bool value) external {
        _setDeviceFlag(bitmap, deviceId, value);
    }

    function getFlag(bytes32 bitmap, uint256 deviceId) external view returns (bool) {
        return _getDeviceFlag(bitmap, deviceId);
    }
}
