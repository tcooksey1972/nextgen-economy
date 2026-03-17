// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title MerkleOnboarding
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Abstract mixin for batch device onboarding via Merkle allowlists.
 *
 * Instead of calling `registerDevice()` individually for each device (expensive
 * at scale), an admin publishes a Merkle root of pre-approved devices. Device
 * owners then claim their registration by providing a Merkle proof, paying gas
 * themselves. This shifts gas costs from the admin to individual device owners.
 *
 * Leaf format: `keccak256(abi.encodePacked(owner, fwHash, uri))`
 *
 * @dev Composability:
 *   This contract does NOT inherit Ownable — it uses a virtual
 *   `_authorizeMerkleAdmin()` function instead. The inheriting contract
 *   provides the access control.
 *
 * Usage:
 *   contract MyRegistry is Ownable, DeviceRegistry, MerkleOnboarding {
 *       function _authorizeRegistryAdmin() internal view override { _checkOwner(); }
 *       function _authorizeMerkleAdmin() internal view override { _checkOwner(); }
 *   }
 */
abstract contract MerkleOnboarding {
    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    event MerkleRootUpdated(bytes32 indexed oldRoot, bytes32 indexed newRoot);
    event DeviceClaimedViaMerkle(uint256 indexed deviceId, address indexed owner, bytes32 leaf);

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    error InvalidMerkleProof();
    error MerkleRootNotSet();
    error LeafAlreadyClaimed(bytes32 leaf);

    // ──────────────────────────────────────────────
    //  Storage
    // ──────────────────────────────────────────────

    /// @dev Current Merkle root for the device allowlist.
    bytes32 private _merkleRoot;

    /// @dev Tracks which leaves have been claimed to prevent double-claims.
    mapping(bytes32 => bool) private _claimedLeaves;

    // ──────────────────────────────────────────────
    //  Admin functions
    // ──────────────────────────────────────────────

    /**
     * @notice Sets a new Merkle root for the device onboarding allowlist.
     * @param newRoot The new Merkle root.
     */
    function setMerkleRoot(bytes32 newRoot) external {
        _authorizeMerkleAdmin();
        bytes32 oldRoot = _merkleRoot;
        _merkleRoot = newRoot;
        emit MerkleRootUpdated(oldRoot, newRoot);
    }

    // ──────────────────────────────────────────────
    //  View functions
    // ──────────────────────────────────────────────

    /// @notice Returns the current Merkle root.
    function merkleRoot() external view returns (bytes32) {
        return _merkleRoot;
    }

    /// @notice Returns true if a leaf has already been claimed.
    function isLeafClaimed(bytes32 leaf) external view returns (bool) {
        return _claimedLeaves[leaf];
    }

    // ──────────────────────────────────────────────
    //  Internal functions
    // ──────────────────────────────────────────────

    /**
     * @dev Verifies a Merkle proof and marks the leaf as claimed.
     *      Call this from a public `claimDevice()` function in the inheriting contract.
     *
     * @param owner The device owner address.
     * @param fwHash Firmware hash of the device.
     * @param uri Metadata URI for the device.
     * @param proof Merkle proof for the leaf.
     * @return leaf The computed leaf hash.
     */
    function _verifyAndClaimMerkle(
        address owner,
        bytes32 fwHash,
        string calldata uri,
        bytes32[] calldata proof
    ) internal returns (bytes32 leaf) {
        if (_merkleRoot == bytes32(0)) revert MerkleRootNotSet();

        leaf = keccak256(abi.encodePacked(owner, fwHash, uri));

        if (_claimedLeaves[leaf]) revert LeafAlreadyClaimed(leaf);
        if (!MerkleProof.verify(proof, _merkleRoot, leaf)) revert InvalidMerkleProof();

        _claimedLeaves[leaf] = true;
    }

    // ──────────────────────────────────────────────
    //  Virtual hooks
    // ──────────────────────────────────────────────

    /// @dev Override to provide access control for setMerkleRoot().
    function _authorizeMerkleAdmin() internal virtual;
}
