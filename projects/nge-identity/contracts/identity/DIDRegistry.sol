// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "./interfaces/IDIDRegistry.sol";

/**
 * @title DIDRegistry
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Anchors W3C DIDs on-chain with document URI resolution.
 *
 * Each DID is identified by a bytes32 hash (keccak256 of the DID string).
 * The contract stores a minimal record: controller address, document URI,
 * timestamps, and active status. Full DID Documents live off-chain
 * (S3/IPFS via did:web or did:ethr resolution).
 *
 * @dev Composability:
 *   Uses virtual hooks (`_authorizeDIDAdmin`) instead of inheriting Ownable.
 *   This allows composition with Sentinel modules and AccessControl.
 *
 * Usage:
 *   contract MyDIDRegistry is Ownable, DIDRegistry {
 *       constructor() Ownable(msg.sender) DIDRegistry() {}
 *       function _authorizeDIDAdmin() internal view override { _checkOwner(); }
 *   }
 */
abstract contract DIDRegistry is IDIDRegistry {
    // ──────────────────────────────────────────────
    //  Storage
    // ──────────────────────────────────────────────

    /// @dev DID hash → DIDRecord
    mapping(bytes32 => DIDRecord) private _dids;

    /// @dev Controller address → list of DID hashes they control
    mapping(address => bytes32[]) private _controllerDIDs;

    /// @dev Biometric commitment hash → DID hash (one biometric per DID)
    mapping(bytes32 => bytes32) private _biometricBindings;

    /// @dev Total number of DIDs created
    uint256 private _didCount;

    // ──────────────────────────────────────────────
    //  Modifiers
    // ──────────────────────────────────────────────

    modifier onlyController(bytes32 didHash) {
        if (_dids[didHash].controller == address(0)) revert DIDNotFound(didHash);
        if (!_dids[didHash].active) revert DIDDeactivatedError(didHash);
        if (_dids[didHash].controller != msg.sender) revert NotDIDController(didHash, msg.sender);
        _;
    }

    // ──────────────────────────────────────────────
    //  External functions — DID Lifecycle
    // ──────────────────────────────────────────────

    /**
     * @notice Creates a new DID anchored to the caller's address.
     * @param didHash keccak256 hash of the DID string (e.g., "did:web:nge.example.com:users:alice")
     * @param documentURI URI to the DID Document (S3 or IPFS)
     * @return The didHash for reference
     */
    function createDID(
        bytes32 didHash,
        string calldata documentURI
    ) external returns (bytes32) {
        if (didHash == bytes32(0)) revert InvalidDIDHash();
        if (bytes(documentURI).length == 0) revert InvalidDocumentURI();
        if (_dids[didHash].controller != address(0)) revert DIDAlreadyExists(didHash);

        _dids[didHash] = DIDRecord({
            controller: msg.sender,
            documentURI: documentURI,
            created: block.timestamp,
            updated: block.timestamp,
            active: true
        });

        _controllerDIDs[msg.sender].push(didHash);
        _didCount++;

        emit DIDCreated(didHash, msg.sender, documentURI);
        _onDIDCreated(didHash, msg.sender);

        return didHash;
    }

    /**
     * @notice Updates the DID Document URI. Only the controller can update.
     * @param didHash The DID to update
     * @param newDocumentURI New URI for the DID Document
     */
    function updateDocument(
        bytes32 didHash,
        string calldata newDocumentURI
    ) external onlyController(didHash) {
        if (bytes(newDocumentURI).length == 0) revert InvalidDocumentURI();

        _dids[didHash].documentURI = newDocumentURI;
        _dids[didHash].updated = block.timestamp;

        emit DIDUpdated(didHash, newDocumentURI);
    }

    /**
     * @notice Deactivates a DID. Only the controller can deactivate.
     * @param didHash The DID to deactivate
     */
    function deactivate(bytes32 didHash) external onlyController(didHash) {
        _dids[didHash].active = false;
        _dids[didHash].updated = block.timestamp;

        emit DIDDeactivated(didHash);
    }

    /**
     * @notice Transfers control of a DID to a new address.
     * @param didHash The DID to transfer
     * @param newController The new controller address
     */
    function changeController(
        bytes32 didHash,
        address newController
    ) external onlyController(didHash) {
        if (newController == address(0)) revert NotDIDController(didHash, newController);

        address oldController = _dids[didHash].controller;
        _dids[didHash].controller = newController;
        _dids[didHash].updated = block.timestamp;

        _controllerDIDs[newController].push(didHash);

        emit DIDControllerChanged(didHash, oldController, newController);
    }

    /**
     * @notice Binds a biometric commitment hash to a DID.
     * @dev The biometric template is hashed client-side. Only the commitment
     *      (hash) is stored on-chain. One biometric binds to exactly one DID.
     * @param didHash The DID to bind the biometric to
     * @param biometricCommitment Hash of the biometric template
     */
    function bindBiometric(
        bytes32 didHash,
        bytes32 biometricCommitment
    ) external onlyController(didHash) {
        if (biometricCommitment == bytes32(0)) revert InvalidDIDHash();
        if (_biometricBindings[biometricCommitment] != bytes32(0)) {
            revert BiometricAlreadyBound(biometricCommitment);
        }

        _biometricBindings[biometricCommitment] = didHash;

        emit BiometricBound(didHash, biometricCommitment);
    }

    // ──────────────────────────────────────────────
    //  External functions — Admin (trusted issuer mgmt)
    // ──────────────────────────────────────────────

    /**
     * @notice Admin-only: force-deactivate a DID (for compromised identities).
     * @param didHash The DID to deactivate
     */
    function adminDeactivate(bytes32 didHash) external {
        _authorizeDIDAdmin();
        if (_dids[didHash].controller == address(0)) revert DIDNotFound(didHash);
        if (!_dids[didHash].active) revert DIDDeactivatedError(didHash);

        _dids[didHash].active = false;
        _dids[didHash].updated = block.timestamp;

        emit DIDDeactivated(didHash);
    }

    // ──────────────────────────────────────────────
    //  View functions
    // ──────────────────────────────────────────────

    /// @inheritdoc IDIDRegistry
    function resolve(bytes32 didHash) external view returns (DIDRecord memory) {
        if (_dids[didHash].controller == address(0)) revert DIDNotFound(didHash);
        return _dids[didHash];
    }

    /// @inheritdoc IDIDRegistry
    function isActive(bytes32 didHash) external view returns (bool) {
        if (_dids[didHash].controller == address(0)) return false;
        return _dids[didHash].active;
    }

    /// @inheritdoc IDIDRegistry
    function controllerOf(bytes32 didHash) external view returns (address) {
        return _dids[didHash].controller;
    }

    /// @inheritdoc IDIDRegistry
    function didCount() external view returns (uint256) {
        return _didCount;
    }

    /**
     * @notice Returns the DID hash bound to a biometric commitment.
     * @param biometricCommitment The biometric hash to look up
     * @return The bound DID hash (bytes32(0) if none)
     */
    function biometricToDID(bytes32 biometricCommitment) external view returns (bytes32) {
        return _biometricBindings[biometricCommitment];
    }

    /**
     * @notice Returns all DID hashes controlled by an address.
     * @param controller The controller address to query
     * @return Array of DID hashes
     */
    function getDIDsByController(address controller) external view returns (bytes32[] memory) {
        return _controllerDIDs[controller];
    }

    // ──────────────────────────────────────────────
    //  Virtual hooks
    // ──────────────────────────────────────────────

    /**
     * @dev Override to provide access control for admin functions.
     *      Revert if unauthorized.
     */
    function _authorizeDIDAdmin() internal virtual;

    /**
     * @dev Hook called after a DID is created. Override to integrate with
     *      Sentinel modules or emit additional events.
     */
    function _onDIDCreated(bytes32 didHash, address controller) internal virtual {
        // solhint-disable-next-line no-empty-blocks
    }
}
