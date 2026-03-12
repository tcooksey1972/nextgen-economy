// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../sentinel/WatchdogAlert.sol";

/**
 * @title WatchdogVault
 * @author Cloud Creations LLC — NextGen Economy
 * @notice A simple ETH vault with WatchdogAlert monitoring. Used for testing.
 */
contract WatchdogVault is Ownable, WatchdogAlert {
    event Deposited(address indexed sender, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);

    constructor(
        uint256 largeTransferThreshold_,
        uint256 rapidActivityThreshold_,
        uint256 rapidActivityWindow_
    )
        Ownable(msg.sender)
        WatchdogAlert(largeTransferThreshold_, rapidActivityThreshold_, rapidActivityWindow_)
    {}

    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    function withdraw(address payable to, uint256 amount) external onlyOwner {
        require(amount <= address(this).balance, "Insufficient balance");
        _watchdogCheck(address(this), to, amount);
        (bool success, ) = to.call{value: amount}("");
        require(success, "Transfer failed");
        emit Withdrawn(to, amount);
    }

    function _authorizeWatchdogAdmin() internal view override {
        _checkOwner();
    }
}
