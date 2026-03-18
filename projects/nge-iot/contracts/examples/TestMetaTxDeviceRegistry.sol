// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../iot/MetaTxDeviceRegistry.sol";

contract TestMetaTxDeviceRegistry is Ownable, MetaTxDeviceRegistry {
    constructor(address trustedForwarder)
        Ownable(msg.sender)
        MetaTxDeviceRegistry(trustedForwarder)
    {}

    function _authorizeRegistryAdmin() internal view override {
        _checkOwner();
    }
}
