// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "../sentinel/BreakGlass.sol";
import "../sentinel/NonceGuard.sol";
import "../sentinel/EnumerableGuardians.sol";

/**
 * @title SignedBreakGlassVault
 * @author Cloud Creations LLC — NextGen Economy
 * @notice ETH vault demonstrating NonceGuard (replay-protected signed actions)
 *         and EnumerableGuardians (on-chain guardian enumeration).
 *
 * Adds two capabilities on top of the basic BreakGlassVault:
 *   1. **NonceGuard**: Guardians can sign emergency actions off-chain with
 *      replay protection (each signature uses a sequential nonce).
 *   2. **EnumerableGuardians**: Full on-chain enumeration of the guardian set
 *      for transparency dashboards and governance UIs.
 */
contract SignedBreakGlassVault is Ownable, Pausable, BreakGlass, NonceGuard, EnumerableGuardians {
    bytes32 public constant GUARDIAN_SET = keccak256("guardians");
    bytes32 public constant OPERATOR_SET = keccak256("operators");

    bytes32 public constant SIGNED_PAUSE_ACTION = keccak256("PAUSE");

    event Deposited(address indexed sender, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);

    constructor(
        address[] memory guardians_,
        uint256 threshold_,
        uint256 delay_
    )
        Ownable(msg.sender)
        BreakGlass(guardians_, threshold_, delay_)
        NonceGuard()
    {
        // Also add guardians to the enumerable set
        for (uint256 i = 0; i < guardians_.length; i++) {
            if (!_isMember(GUARDIAN_SET, guardians_[i])) {
                _addMember(GUARDIAN_SET, guardians_[i]);
            }
        }
    }

    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    function withdraw(address payable to, uint256 amount) external onlyOwner whenNotPaused {
        require(amount <= address(this).balance, "Insufficient balance");
        (bool success, ) = to.call{value: amount}("");
        require(success, "Transfer failed");
        emit Withdrawn(to, amount);
    }

    /**
     * @notice Executes a signed emergency pause action with replay protection.
     * @param signer The guardian who signed the action.
     * @param deadline Expiry timestamp for the signature.
     * @param signature The EIP-712 signature.
     */
    function signedEmergencyPause(
        address signer,
        uint256 deadline,
        bytes calldata signature
    ) external {
        require(_isMember(GUARDIAN_SET, signer), "Not a guardian");
        _verifySignedAction(signer, SIGNED_PAUSE_ACTION, deadline, signature);
        _pause();
    }

    /**
     * @notice Adds an operator to the enumerable operator set.
     */
    function addOperator(address operator) external onlyOwner {
        _addMember(OPERATOR_SET, operator);
    }

    /**
     * @notice Removes an operator from the enumerable operator set.
     */
    function removeOperator(address operator) external onlyOwner {
        _removeMember(OPERATOR_SET, operator);
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ──────────────────────────────────────────────
    //  Virtual hook implementations — BreakGlass
    // ──────────────────────────────────────────────

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
