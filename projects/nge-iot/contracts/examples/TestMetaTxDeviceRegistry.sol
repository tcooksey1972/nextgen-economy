// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../iot/MetaTxDeviceRegistry.sol";

/**
 * @dev Concrete test harness for MetaTxDeviceRegistry.
 *      Uses a simple admin address instead of Ownable to avoid
 *      _msgSender/_msgData override conflicts with ERC2771Context.
 */
contract TestMetaTxDeviceRegistry is MetaTxDeviceRegistry {
    address private _admin;

    constructor(address trustedForwarder)
        MetaTxDeviceRegistry(trustedForwarder)
    {
        _admin = _msgSender();
    }

    function admin() external view returns (address) {
        return _admin;
    }

    function _authorizeRegistryAdmin() internal view override {
        require(_msgSender() == _admin, "not admin");
    }
}
