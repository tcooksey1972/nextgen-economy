// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../identity/DIDRegistry.sol";

/**
 * @title SimpleDIDRegistry
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Concrete DIDRegistry with Ownable access control.
 *
 * Deployer becomes the owner and can perform admin operations
 * (force-deactivate compromised DIDs). Any address can create
 * their own DID — no admin permission required for self-sovereign
 * identity creation.
 */
contract SimpleDIDRegistry is Ownable, DIDRegistry {
    constructor() Ownable(msg.sender) {}

    function _authorizeDIDAdmin() internal view override {
        _checkOwner();
    }
}
