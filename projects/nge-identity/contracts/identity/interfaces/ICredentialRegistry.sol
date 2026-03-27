// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title ICredentialRegistry
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Interface for the NGE Credential Registry contract.
 */
interface ICredentialRegistry {
    // ──────────────────────────────────────────────
    //  Enums
    // ──────────────────────────────────────────────

    enum CredentialType {
        EDUCATION,
        PROFESSIONAL,
        SKILL,
        EXPERIENCE,
        STATE_ID,
        HEALTHCARE,
        SENSOR_ATTESTATION
    }

    // ──────────────────────────────────────────────
    //  Structs
    // ──────────────────────────────────────────────

    struct Credential {
        bytes32 issuerDID;
        bytes32 holderDID;
        bytes32 credentialHash;
        CredentialType cType;
        uint256 issuedAt;
        uint256 expiresAt;
        bool revoked;
        string metadataURI;
    }

    struct VerificationResult {
        bool valid;
        bool expired;
        bool revoked;
        bool trustedIssuer;
    }

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    event CredentialIssued(
        bytes32 indexed credentialId,
        bytes32 indexed issuerDID,
        bytes32 indexed holderDID,
        CredentialType cType
    );
    event CredentialRevoked(bytes32 indexed credentialId, bytes32 indexed issuerDID);
    event IssuerTrusted(bytes32 indexed issuerDID);
    event IssuerUntrusted(bytes32 indexed issuerDID);

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    error CredentialAlreadyExists(bytes32 credentialId);
    error CredentialNotFound(bytes32 credentialId);
    error IssuerNotTrusted(bytes32 issuerDID);
    error NotCredentialIssuer(bytes32 credentialId, bytes32 callerDID);
    error AlreadyRevoked(bytes32 credentialId);
    error InvalidCredentialHash();
    error InvalidCredentialId();

    // ──────────────────────────────────────────────
    //  Functions
    // ──────────────────────────────────────────────

    function issueCredential(
        bytes32 credentialId,
        bytes32 issuerDID,
        bytes32 holderDID,
        bytes32 credentialHash,
        CredentialType cType,
        uint256 expiresAt,
        string calldata metadataURI
    ) external;

    function revokeCredential(bytes32 credentialId, bytes32 issuerDID) external;
    function verifyCredential(bytes32 credentialId) external view returns (VerificationResult memory);
    function getHolderCredentials(bytes32 holderDID) external view returns (bytes32[] memory);
    function getIssuerCredentials(bytes32 issuerDID) external view returns (bytes32[] memory);
    function getCredential(bytes32 credentialId) external view returns (Credential memory);
}
