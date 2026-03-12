// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../sentinel/RateLimiter.sol";

/**
 * @title RateLimitedVault
 * @author Cloud Creations LLC — NextGen Economy
 * @notice A simple ETH vault protected by RateLimiter. Used for testing.
 */
contract RateLimitedVault is Ownable, RateLimiter {
    event Deposited(address indexed sender, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);

    constructor(uint256 maxAmount_, uint256 windowDuration_)
        Ownable(msg.sender)
        RateLimiter(maxAmount_, windowDuration_)
    {}

    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    function withdraw(address payable to, uint256 amount) external onlyOwner {
        require(amount <= address(this).balance, "Insufficient balance");
        _enforceRateLimit(amount);
        (bool success, ) = to.call{value: amount}("");
        require(success, "Transfer failed");
        emit Withdrawn(to, amount);
    }

    function _authorizeRateLimitAdmin() internal view override {
        _checkOwner();
    }
}
