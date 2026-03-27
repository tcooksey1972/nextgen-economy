// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title IDIDRegistry
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Interface for the NGE DID Registry contract.
 */
interface IDIDRegistry {
    // ──────────────────────────────────────────────
    //  Structs
    // ──────────────────────────────────────────────

    struct DIDRecord {
        address controller;
        string documentURI;
        uint256 created;
        uint256 updated;
        bool active;
    }

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    event DIDCreated(bytes32 indexed didHash, address indexed controller, string documentURI);
    event DIDUpdated(bytes32 indexed didHash, string newDocumentURI);
    event DIDDeactivated(bytes32 indexed didHash);
    event DIDControllerChanged(bytes32 indexed didHash, address indexed oldController, address indexed newController);
    event BiometricBound(bytes32 indexed didHash, bytes32 biometricCommitment);

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    error DIDAlreadyExists(bytes32 didHash);
    error DIDNotFound(bytes32 didHash);
    error DIDDeactivatedError(bytes32 didHash);
    error NotDIDController(bytes32 didHash, address caller);
    error BiometricAlreadyBound(bytes32 biometricCommitment);
    error InvalidDocumentURI();
    error InvalidDIDHash();

    // ──────────────────────────────────────────────
    //  Functions
    // ──────────────────────────────────────────────

    function createDID(bytes32 didHash, string calldata documentURI) external returns (bytes32);
    function updateDocument(bytes32 didHash, string calldata newDocumentURI) external;
    function deactivate(bytes32 didHash) external;
    function changeController(bytes32 didHash, address newController) external;
    function bindBiometric(bytes32 didHash, bytes32 biometricCommitment) external;
    function resolve(bytes32 didHash) external view returns (DIDRecord memory);
    function isActive(bytes32 didHash) external view returns (bool);
    function controllerOf(bytes32 didHash) external view returns (address);
    function didCount() external view returns (uint256);
}
