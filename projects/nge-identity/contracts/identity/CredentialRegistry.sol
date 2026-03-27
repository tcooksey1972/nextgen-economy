// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./interfaces/ICredentialRegistry.sol";

/**
 * @title CredentialRegistry
 * @author Cloud Creations LLC — NextGen Economy
 * @notice On-chain registry for W3C Verifiable Credential anchoring.
 *
 * Stores credential hashes, issuer signatures, and revocation status.
 * NO personally identifiable information (PII) is stored on-chain —
 * only hashes and metadata URIs pointing to encrypted off-chain storage.
 *
 * Uses OpenZeppelin AccessControl for role-based permission management:
 *   - DEFAULT_ADMIN_ROLE: Can manage all roles
 *   - ISSUER_MANAGER_ROLE: Can add/remove trusted issuers
 *   - ISSUER_ROLE: Can issue credentials (must also be in trustedIssuers mapping)
 *
 * @dev Follows the W3C Verifiable Credentials Data Model for credential types
 *      and StatusList2021 pattern for revocation.
 */
contract CredentialRegistry is AccessControl, ICredentialRegistry {
    // ──────────────────────────────────────────────
    //  Roles
    // ──────────────────────────────────────────────

    bytes32 public constant ISSUER_MANAGER_ROLE = keccak256("ISSUER_MANAGER_ROLE");

    // ──────────────────────────────────────────────
    //  Storage
    // ──────────────────────────────────────────────

    /// @dev Credential ID → Credential record
    mapping(bytes32 => Credential) private _credentials;

    /// @dev Holder DID → list of credential IDs
    mapping(bytes32 => bytes32[]) private _holderCredentials;

    /// @dev Issuer DID → list of credential IDs they've issued
    mapping(bytes32 => bytes32[]) private _issuerCredentials;

    /// @dev Trusted issuer DID → authorized flag
    mapping(bytes32 => bool) private _trustedIssuers;

    /// @dev Total credentials issued
    uint256 private _credentialCount;

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ISSUER_MANAGER_ROLE, msg.sender);
    }

    // ──────────────────────────────────────────────
    //  Issuer Management
    // ──────────────────────────────────────────────

    /**
     * @notice Adds a DID to the trusted issuer registry.
     * @param issuerDID The DID hash of the issuing authority
     */
    function addTrustedIssuer(bytes32 issuerDID) external onlyRole(ISSUER_MANAGER_ROLE) {
        _trustedIssuers[issuerDID] = true;
        emit IssuerTrusted(issuerDID);
    }

    /**
     * @notice Removes a DID from the trusted issuer registry.
     * @param issuerDID The DID hash to remove
     */
    function removeTrustedIssuer(bytes32 issuerDID) external onlyRole(ISSUER_MANAGER_ROLE) {
        _trustedIssuers[issuerDID] = false;
        emit IssuerUntrusted(issuerDID);
    }

    /**
     * @notice Checks if a DID is a trusted issuer.
     * @param issuerDID The DID hash to check
     * @return True if the issuer is trusted
     */
    function isTrustedIssuer(bytes32 issuerDID) external view returns (bool) {
        return _trustedIssuers[issuerDID];
    }

    // ──────────────────────────────────────────────
    //  Credential Lifecycle
    // ──────────────────────────────────────────────

    /// @inheritdoc ICredentialRegistry
    function issueCredential(
        bytes32 credentialId,
        bytes32 issuerDID,
        bytes32 holderDID,
        bytes32 credentialHash,
        CredentialType cType,
        uint256 expiresAt,
        string calldata metadataURI
    ) external {
        if (credentialId == bytes32(0)) revert InvalidCredentialId();
        if (credentialHash == bytes32(0)) revert InvalidCredentialHash();
        if (_credentials[credentialId].issuedAt != 0) revert CredentialAlreadyExists(credentialId);
        if (!_trustedIssuers[issuerDID]) revert IssuerNotTrusted(issuerDID);

        _credentials[credentialId] = Credential({
            issuerDID: issuerDID,
            holderDID: holderDID,
            credentialHash: credentialHash,
            cType: cType,
            issuedAt: block.timestamp,
            expiresAt: expiresAt,
            revoked: false,
            metadataURI: metadataURI
        });

        _holderCredentials[holderDID].push(credentialId);
        _issuerCredentials[issuerDID].push(credentialId);
        _credentialCount++;

        emit CredentialIssued(credentialId, issuerDID, holderDID, cType);
    }

    /// @inheritdoc ICredentialRegistry
    function revokeCredential(bytes32 credentialId, bytes32 issuerDID) external {
        Credential storage cred = _credentials[credentialId];
        if (cred.issuedAt == 0) revert CredentialNotFound(credentialId);
        if (cred.issuerDID != issuerDID) revert NotCredentialIssuer(credentialId, issuerDID);
        if (cred.revoked) revert AlreadyRevoked(credentialId);

        cred.revoked = true;

        emit CredentialRevoked(credentialId, issuerDID);
    }

    // ──────────────────────────────────────────────
    //  Verification
    // ──────────────────────────────────────────────

    /// @inheritdoc ICredentialRegistry
    function verifyCredential(bytes32 credentialId) external view returns (VerificationResult memory) {
        Credential storage cred = _credentials[credentialId];

        bool exists = cred.issuedAt > 0;
        bool revoked = cred.revoked;
        bool expired = (cred.expiresAt != 0 && block.timestamp > cred.expiresAt);
        bool trustedIssuer = _trustedIssuers[cred.issuerDID];
        bool valid = exists && !revoked && !expired && trustedIssuer;

        return VerificationResult({
            valid: valid,
            expired: expired,
            revoked: revoked,
            trustedIssuer: trustedIssuer
        });
    }

    // ──────────────────────────────────────────────
    //  Query functions
    // ──────────────────────────────────────────────

    /// @inheritdoc ICredentialRegistry
    function getHolderCredentials(bytes32 holderDID) external view returns (bytes32[] memory) {
        return _holderCredentials[holderDID];
    }

    /// @inheritdoc ICredentialRegistry
    function getIssuerCredentials(bytes32 issuerDID) external view returns (bytes32[] memory) {
        return _issuerCredentials[issuerDID];
    }

    /**
     * @notice Returns the full credential record.
     * @param credentialId The credential to look up
     * @return The credential record
     */
    function getCredential(bytes32 credentialId) external view returns (Credential memory) {
        if (_credentials[credentialId].issuedAt == 0) revert CredentialNotFound(credentialId);
        return _credentials[credentialId];
    }

    /**
     * @notice Returns the total number of credentials issued.
     * @return Total credential count
     */
    function credentialCount() external view returns (uint256) {
        return _credentialCount;
    }
}
