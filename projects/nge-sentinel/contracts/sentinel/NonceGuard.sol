// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/utils/Nonces.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/**
 * @title NonceGuard
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Abstract mixin providing EIP-712 signed action replay protection
 *         for Sentinel security modules.
 *
 * Prevents replay attacks on off-chain signed emergency triggers. When an
 * authorized signer signs a BreakGlass or WatchdogAlert action off-chain,
 * the nonce ensures each signed message can only be used once.
 *
 * Uses OpenZeppelin's Nonces contract for per-signer sequential nonce tracking
 * and EIP-712 for typed structured data signing.
 *
 * @dev Usage:
 *   contract MyVault is Ownable, BreakGlass, NonceGuard {
 *       bytes32 public constant EMERGENCY_TYPEHASH = keccak256(
 *           "EmergencyAction(uint8 action,address target,uint256 nonce,uint256 deadline)"
 *       );
 *
 *       function executeSignedEmergency(
 *           uint8 action, address target, uint256 deadline, bytes calldata signature
 *       ) external {
 *           require(block.timestamp <= deadline, "Expired");
 *           bytes32 structHash = keccak256(abi.encode(
 *               EMERGENCY_TYPEHASH, action, target, _useNonce(signer), deadline
 *           ));
 *           _verifySignedAction(signer, structHash, signature);
 *           // ... execute action
 *       }
 *   }
 */
abstract contract NonceGuard is EIP712, Nonces {
    // ──────────────────────────────────────────────
    //  Constants
    // ──────────────────────────────────────────────

    bytes32 private constant _SIGNED_ACTION_TYPEHASH = keccak256(
        "SignedAction(address signer,bytes32 actionHash,uint256 nonce,uint256 deadline)"
    );

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    event SignedActionExecuted(address indexed signer, bytes32 indexed actionHash, uint256 nonce);

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    error SignedActionExpired(uint256 deadline);
    error SignedActionInvalidSignature();

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    constructor() EIP712("NGE NonceGuard", "1") {}

    // ──────────────────────────────────────────────
    //  Internal functions
    // ──────────────────────────────────────────────

    /**
     * @dev Verifies an EIP-712 signed action, consuming the signer's nonce.
     *      Reverts if the signature is invalid, expired, or replayed.
     *
     * @param signer The expected signer address.
     * @param actionHash An arbitrary hash identifying the action being authorized.
     * @param deadline Timestamp after which the signature is no longer valid.
     * @param signature The EIP-712 signature bytes.
     * @return usedNonce The nonce that was consumed.
     */
    function _verifySignedAction(
        address signer,
        bytes32 actionHash,
        uint256 deadline,
        bytes calldata signature
    ) internal returns (uint256 usedNonce) {
        if (block.timestamp > deadline) revert SignedActionExpired(deadline);

        usedNonce = _useNonce(signer);

        bytes32 structHash = keccak256(
            abi.encode(_SIGNED_ACTION_TYPEHASH, signer, actionHash, usedNonce, deadline)
        );
        bytes32 digest = _hashTypedDataV4(structHash);

        if (!SignatureChecker.isValidSignatureNow(signer, digest, signature)) {
            revert SignedActionInvalidSignature();
        }

        emit SignedActionExecuted(signer, actionHash, usedNonce);
    }

    // ──────────────────────────────────────────────
    //  View functions
    // ──────────────────────────────────────────────

    /// @notice Returns the EIP-712 domain separator.
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /// @notice Returns the typehash for signed actions.
    function SIGNED_ACTION_TYPEHASH() external pure returns (bytes32) {
        return _SIGNED_ACTION_TYPEHASH;
    }
}
