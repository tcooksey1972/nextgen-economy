// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "../sentinel/DeadManSwitch.sol";

/**
 * @title SentinelVault
 * @author Cloud Creations LLC — NextGen Economy
 * @notice A simple ETH vault protected by a DeadManSwitch.
 *
 * Demonstrates how to inherit DeadManSwitch in a real contract.
 * The owner can deposit and withdraw ETH. If the owner goes inactive
 * and the switch activates, the vault pauses and ownership transfers
 * to the recovery address, who can then unpause and withdraw.
 *
 * @dev Integration pattern:
 *   1. Inherit DeadManSwitch (which brings Ownable2Step + Pausable)
 *   2. Call `Ownable(msg.sender)` in your constructor to set the initial owner
 *   3. Gate value-transfer functions with `whenNotPaused` so they halt on activation
 *   4. Provide an `unpause()` so the recovery address can resume operations
 *
 * This contract uses `receive()` instead of a named `deposit()` function so
 * that plain ETH transfers (e.g., from a wallet or another contract) work
 * without requiring the sender to know the vault's ABI.
 */
contract SentinelVault is DeadManSwitch {
    /// @notice Emitted when ETH is deposited into the vault.
    event Deposited(address indexed sender, uint256 amount);

    /// @notice Emitted when ETH is withdrawn from the vault.
    event Withdrawn(address indexed to, uint256 amount);

    /**
     * @param heartbeatInterval_ Time in seconds between required owner check-ins.
     * @param gracePeriod_ Buffer time in seconds after missed heartbeat.
     * @param recoveryAddress_ Address that receives ownership on switch activation.
     */
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
