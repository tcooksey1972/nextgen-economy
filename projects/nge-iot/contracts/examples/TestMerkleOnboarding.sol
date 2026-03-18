// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../iot/MerkleOnboarding.sol";

/**
 * @title TestMerkleOnboarding
 * @notice Concrete harness that exposes MerkleOnboarding internals for testing.
 *         Uses Ownable for access control on the Merkle admin hook.
 */
contract TestMerkleOnboarding is Ownable, MerkleOnboarding {
    uint256 private _nextDeviceId;

    event TestDeviceClaimed(uint256 deviceId, address owner);

    constructor() Ownable(msg.sender) {}

    function _authorizeMerkleAdmin() internal view override {
        _checkOwner();
    }

    function claimDevice(
        bytes32 fwHash,
        string calldata uri,
        bytes32[] calldata proof
    ) external returns (uint256 deviceId) {
        deviceId = _nextDeviceId++;
        bytes32 leaf = _verifyAndClaimMerkle(msg.sender, fwHash, uri, proof);
        emit DeviceClaimedViaMerkle(deviceId, msg.sender, leaf);
        emit TestDeviceClaimed(deviceId, msg.sender);
    }
}
