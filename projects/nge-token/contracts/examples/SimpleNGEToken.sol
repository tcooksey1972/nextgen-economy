// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../token/NGEToken.sol";

/**
 * @title SimpleNGEToken
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Standalone NGE token with Ownable access control.
 *         Owner can mint, pause, and manage the supply cap.
 *         No sentinel integration — suitable for quick deployment or testing.
 *
 * @dev Deploy with a supply cap and optional initial mint. Owner is msg.sender.
 *
 * Example deployment (100M cap, 10M pre-mint):
 *   new SimpleNGEToken(100_000_000e18, 10_000_000e18)
 */
contract SimpleNGEToken is Ownable, NGEToken {
    constructor(uint256 cap_, uint256 initialMint)
        Ownable(msg.sender)
        NGEToken(cap_, msg.sender, initialMint)
    {}

    function _authorizeMinter() internal view override {
        _checkOwner();
    }

    function _authorizePauser() internal view override {
        _checkOwner();
    }

    function _authorizeAdmin() internal view override {
        _checkOwner();
    }
}
