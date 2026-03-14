// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title NGEGovernanceToken
 * @author Cloud Creations LLC — NextGen Economy
 * @notice USE CASE: Platform Governance — The governance token.
 *
 * Full-featured ERC-20 with voting power delegation, gasless approvals,
 * burn, pause, and a configurable supply cap. Token holders delegate
 * voting power and participate in on-chain governance.
 */
contract NGEGovernanceToken is ERC20, ERC20Burnable, ERC20Pausable, ERC20Permit, ERC20Votes, Ownable {

    uint256 public supplyCap;

    error SupplyCapExceeded(uint256 requested, uint256 remaining);
    error CapBelowSupply(uint256 newCap, uint256 currentSupply);

    constructor(uint256 cap_, uint256 initialMint)
        ERC20("NextGen Economy", "NGE")
        ERC20Permit("NextGen Economy")
        Ownable(msg.sender)
    {
        supplyCap = cap_;
        if (initialMint > 0) {
            _mint(msg.sender, initialMint);
        }
    }

    function mint(address to, uint256 amount) external onlyOwner {
        if (supplyCap > 0) {
            uint256 remaining = supplyCap - totalSupply();
            if (amount > remaining) revert SupplyCapExceeded(amount, remaining);
        }
        _mint(to, amount);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function setSupplyCap(uint256 newCap) external onlyOwner {
        if (newCap > 0 && newCap < totalSupply()) revert CapBelowSupply(newCap, totalSupply());
        supplyCap = newCap;
    }

    function mintableSupply() external view returns (uint256) {
        if (supplyCap == 0) return type(uint256).max;
        return supplyCap - totalSupply();
    }

    // Required overrides
    function _update(address from, address to, uint256 value)
        internal override(ERC20, ERC20Pausable, ERC20Votes)
    {
        super._update(from, to, value);
    }

    function nonces(address owner_) public view override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner_);
    }
}
