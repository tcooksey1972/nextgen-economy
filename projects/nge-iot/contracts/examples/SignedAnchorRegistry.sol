// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../iot/DeviceRegistry.sol";
import "../iot/SignedDataAnchor.sol";

/**
 * @title SignedAnchorRegistry
 * @author Cloud Creations LLC — NextGen Economy
 * @notice DeviceRegistry combined with EIP-712 signed data anchoring.
 *
 * Demonstrates the SignedDataAnchor integration where IoT devices sign their
 * data readings off-chain and a relayer submits them on-chain. The device
 * NFT owner is the authorized signer for each device.
 */
contract SignedAnchorRegistry is Ownable, DeviceRegistry, SignedDataAnchor {
    constructor() Ownable(msg.sender) DeviceRegistry() SignedDataAnchor() {}

    // ──────────────────────────────────────────────
    //  Virtual hook implementations
    // ──────────────────────────────────────────────

    function _authorizeRegistryAdmin() internal view override {
        _checkOwner();
    }

    /**
     * @dev The device NFT owner is the authorized signer.
     */
    function _getDeviceSigner(uint256 deviceId) internal view override returns (address) {
        return ownerOf(deviceId);
    }

}
