// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "../sentinel/BreakGlass.sol";

/**
 * @title BreakGlassVault
 * @author Cloud Creations LLC — NextGen Economy
 * @notice A simple ETH vault protected by BreakGlass. Used for testing.
 */
contract BreakGlassVault is Ownable, Pausable, BreakGlass {
    event Deposited(address indexed sender, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);

    constructor(
        address[] memory guardians_,
        uint256 threshold_,
        uint256 executionDelay_
    )
        Ownable(msg.sender)
        BreakGlass(guardians_, threshold_, executionDelay_)
    {}

    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    function withdraw(address payable to, uint256 amount) external onlyOwner whenNotPaused {
        require(amount <= address(this).balance, "Insufficient balance");
        (bool success, ) = to.call{value: amount}("");
        require(success, "Transfer failed");
        emit Withdrawn(to, amount);
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _authorizeBreakGlassAdmin() internal view override {
        _checkOwner();
    }

    function _breakGlassPause() internal override {
        _pause();
    }

    function _breakGlassUnpause() internal override {
        _unpause();
    }

    function _breakGlassTransferOwnership(address newOwner) internal override {
        _transferOwnership(newOwner);
    }
}
