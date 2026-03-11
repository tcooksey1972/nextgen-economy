// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../sentinel/DeadManSwitch.sol";

/**
 * @title SentinelVault
 * @notice A simple ETH vault protected by a DeadManSwitch.
 *
 * Demonstrates how to inherit DeadManSwitch in a real contract.
 * The owner can deposit and withdraw ETH. If the owner goes inactive
 * and the switch activates, the vault pauses and ownership transfers
 * to the recovery address, who can then unpause and withdraw.
 */
contract SentinelVault is DeadManSwitch {
    event Deposited(address indexed sender, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);

    constructor(
        uint256 heartbeatInterval_,
        uint256 gracePeriod_,
        address recoveryAddress_
    )
        Ownable(msg.sender)
        DeadManSwitch(heartbeatInterval_, gracePeriod_, recoveryAddress_)
    {}

    /// @notice Deposit ETH into the vault.
    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    /// @notice Withdraw ETH from the vault. Only callable by the owner
    ///         when the contract is not paused.
    function withdraw(address payable to, uint256 amount) external onlyOwner whenNotPaused {
        require(amount <= address(this).balance, "Insufficient balance");
        (bool success, ) = to.call{value: amount}("");
        require(success, "Transfer failed");
        emit Withdrawn(to, amount);
    }

    /// @notice Allows the owner to unpause after the switch has been activated
    ///         and ownership has been recovered.
    function unpause() external onlyOwner {
        _unpause();
    }
}
