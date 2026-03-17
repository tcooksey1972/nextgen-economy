// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20VotesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "../interfaces/INGEToken.sol";

/**
 * @title NGETokenUpgradeable
 * @author Cloud Creations LLC — NextGen Economy
 * @notice UUPS-upgradeable version of NGEToken for production deployments.
 *
 * Combines all the features of the non-upgradeable NGEToken with UUPS proxy
 * upgradeability. Uses OpenZeppelin's upgradeable contract variants with
 * `initializer` instead of `constructor`.
 *
 * Deploy via:
 *   const proxy = await upgrades.deployProxy(NGETokenUpgradeable, [cap, mintTo, amount], { kind: "uups" });
 */
contract NGETokenUpgradeable is
    ERC20Upgradeable,
    ERC20BurnableUpgradeable,
    ERC20PausableUpgradeable,
    ERC20PermitUpgradeable,
    ERC20VotesUpgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable,
    INGEToken
{
    // ──────────────────────────────────────────────
    //  Storage
    // ──────────────────────────────────────────────

    uint256 private _supplyCap;

    /// @dev Reserved storage gap for future upgrades (49 slots).
    uint256[49] private __gap;

    // ──────────────────────────────────────────────
    //  Initializer
    // ──────────────────────────────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        uint256 cap_,
        address initialMintTo,
        uint256 initialMintAmount
    ) public initializer {
        __ERC20_init("NextGen Economy", "NGE");
        __ERC20Burnable_init();
        __ERC20Pausable_init();
        __ERC20Permit_init("NextGen Economy");
        __ERC20Votes_init();
        __Ownable_init(msg.sender);

        _supplyCap = cap_;

        if (initialMintTo != address(0) && initialMintAmount > 0) {
            if (cap_ > 0 && initialMintAmount > cap_) {
                revert SupplyCapExceeded(initialMintAmount, cap_);
            }
            _mint(initialMintTo, initialMintAmount);
        }
    }

    // ──────────────────────────────────────────────
    //  External — Minting
    // ──────────────────────────────────────────────

    function mint(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        if (_supplyCap > 0) {
            uint256 remaining = _supplyCap - totalSupply();
            if (amount > remaining) {
                revert SupplyCapExceeded(amount, remaining);
            }
        }

        _mint(to, amount);
        emit TokensMinted(to, amount, msg.sender);
    }

    // ──────────────────────────────────────────────
    //  External — Pause / Unpause
    // ──────────────────────────────────────────────

    function pause() external onlyOwner {
        _pause();
        emit TokenPaused(msg.sender);
    }

    function unpause() external onlyOwner {
        _unpause();
        emit TokenUnpaused(msg.sender);
    }

    // ──────────────────────────────────────────────
    //  External — Admin
    // ──────────────────────────────────────────────

    function setSupplyCap(uint256 newCap) external onlyOwner {
        if (newCap > 0 && newCap < totalSupply()) {
            revert CapBelowSupply(newCap, totalSupply());
        }
        uint256 oldCap = _supplyCap;
        _supplyCap = newCap;
        emit SupplyCapUpdated(oldCap, newCap);
    }

    // ──────────────────────────────────────────────
    //  View functions
    // ──────────────────────────────────────────────

    function supplyCap() external view returns (uint256) {
        return _supplyCap;
    }

    function mintableSupply() external view returns (uint256) {
        if (_supplyCap == 0) return type(uint256).max;
        return _supplyCap - totalSupply();
    }

    // ──────────────────────────────────────────────
    //  UUPS
    // ──────────────────────────────────────────────

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ──────────────────────────────────────────────
    //  Required overrides
    // ──────────────────────────────────────────────

    function _update(address from, address to, uint256 value)
        internal override(ERC20Upgradeable, ERC20PausableUpgradeable, ERC20VotesUpgradeable)
    {
        super._update(from, to, value);
    }

    function nonces(address owner_)
        public view override(ERC20PermitUpgradeable, NoncesUpgradeable) returns (uint256)
    {
        return super.nonces(owner_);
    }
}
