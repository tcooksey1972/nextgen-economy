import React, { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import config, { truncateAddress } from "../utils/config";
import CREDENTIAL_ABI from "../abi/CredentialRegistry.json";

const CREDENTIAL_TYPES = [
  "Identity",
  "Education",
  "Employment",
  "Certification",
  "Membership",
  "License",
  "Achievement",
];

/**
 * Credentials page — Issue, verify, and manage verifiable credentials.
 *
 * Features: credential wallet (holder view), issue credential form,
 * verify credential by ID, and revoke credentials.
 */
export default function Credentials({ wallet }) {
  const [credentialCount, setCredentialCount] = useState(0);
  const [holderCredentials, setHolderCredentials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [txStatus, setTxStatus] = useState(null);

  // Issue form
  const [issuerDID, setIssuerDID] = useState("");
  const [holderDID, setHolderDID] = useState("");
  const [credType, setCredType] = useState(0);
  const [metadataURI, setMetadataURI] = useState("");

  // Verify form
  const [verifyId, setVerifyId] = useState("");
  const [verifyResult, setVerifyResult] = useState(null);

  // Holder DID for wallet lookup
  const [walletDID, setWalletDID] = useState("");

  const getContract = useCallback(
    (useSigner = false) => {
      if (!config.contracts.credentialRegistry) return null;
      const providerOrSigner = useSigner ? wallet.signer : wallet.provider;
      if (!providerOrSigner) return null;
      return new ethers.Contract(config.contracts.credentialRegistry, CREDENTIAL_ABI, providerOrSigner);
    },
    [wallet.provider, wallet.signer]
  );

  const fetchData = useCallback(async () => {
    const contract = getContract();
    if (!contract) return;

    setLoading(true);
    try {
      const count = await contract.credentialCount();
      setCredentialCount(Number(count));
    } catch (err) {
      console.error("Failed to fetch credential count:", err);
    }
    setLoading(false);
  }, [getContract]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleLoadWallet(e) {
    e.preventDefault();
    const contract = getContract();
    if (!contract || !walletDID) return;

    setLoading(true);
    try {
      const ids = await contract.getHolderCredentials(walletDID);
      const credentials = [];
      for (const id of ids) {
        const cred = await contract.getCredential(id);
        credentials.push({
          id: Number(id),
          issuerDID: cred[0],
          holderDID: cred[1],
          credentialType: Number(cred[2]),
          metadataURI: cred[3],
          issuedAt: new Date(Number(cred[4]) * 1000).toISOString(),
          revoked: cred[5],
        });
      }
      setHolderCredentials(credentials);
    } catch (err) {
      console.error("Failed to load credentials:", err);
    }
    setLoading(false);
  }

  async function handleIssue(e) {
    e.preventDefault();
    setTxStatus(null);
    const contract = getContract(true);
    if (!contract) return;

    try {
      setTxStatus({ type: "pending", message: "Issuing credential..." });
      const tx = await contract.issueCredential(issuerDID, holderDID, credType, metadataURI);
      setTxStatus({ type: "pending", message: `Transaction submitted: ${tx.hash}` });
      await tx.wait();
      setTxStatus({ type: "success", message: "Credential issued successfully." });
      setIssuerDID("");
      setHolderDID("");
      setCredType(0);
      setMetadataURI("");
      fetchData();
    } catch (err) {
      setTxStatus({ type: "error", message: err.reason || err.message });
    }
  }

  async function handleVerify(e) {
    e.preventDefault();
    setVerifyResult(null);
    const contract = getContract();
    if (!contract || !verifyId) return;

    try {
      const result = await contract.verifyCredential(verifyId);
      const cred = await contract.getCredential(verifyId);
      setVerifyResult({
        valid: result[0],
        expired: result[1],
        revoked: result[2],
        trustedIssuer: result[3],
        credentialType: Number(cred[2]),
        metadataURI: cred[3],
        issuedAt: new Date(Number(cred[4]) * 1000).toISOString(),
      });
    } catch (err) {
      setVerifyResult({ error: err.reason || err.message });
    }
  }

  async function handleRevoke(credentialId) {
    setTxStatus(null);
    const contract = getContract(true);
    if (!contract) return;

    try {
      setTxStatus({ type: "pending", message: `Revoking credential #${credentialId}...` });
      const tx = await contract.revokeCredential(credentialId);
      setTxStatus({ type: "pending", message: `Transaction submitted: ${tx.hash}` });
      await tx.wait();
      setTxStatus({ type: "success", message: `Credential #${credentialId} revoked.` });
      fetchData();
      // Refresh wallet if loaded
      if (walletDID) {
        handleLoadWallet({ preventDefault: () => {} });
      }
    } catch (err) {
      setTxStatus({ type: "error", message: err.reason || err.message });
    }
  }

  if (!wallet.account) {
    return (
      <div className="empty-state">
        <h2>Connect your wallet to manage credentials</h2>
        <p style={{ marginTop: "8px", color: "var(--text-muted)" }}>
          Issue, verify, and manage verifiable credentials on-chain.
        </p>
        <button className="btn-primary" onClick={wallet.connect} style={{ marginTop: "24px" }}>
          Connect Wallet
        </button>
      </div>
    );
  }

  if (!config.contracts.credentialRegistry) {
    return (
      <div className="empty-state">
        <h2>Credential Registry not configured</h2>
        <p style={{ marginTop: "8px", color: "var(--text-muted)" }}>
          Set REACT_APP_CREDENTIAL_REGISTRY_ADDRESS in your .env file after deploying the contract.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Credentials</h1>
        <p>
          Verifiable credentials on {config.chainName} &mdash;{" "}
          {truncateAddress(wallet.account)}
        </p>
      </div>

      {/* Transaction Status */}
      {txStatus && (
        <div
          className={txStatus.type === "error" ? "error-message" : "card"}
          style={{
            marginBottom: "16px",
            borderColor:
              txStatus.type === "success"
                ? "rgba(34, 197, 94, 0.3)"
                : txStatus.type === "pending"
                ? "rgba(59, 130, 246, 0.3)"
                : undefined,
          }}
        >
          <p
            style={{
              color:
                txStatus.type === "success"
                  ? "var(--success)"
                  : txStatus.type === "pending"
                  ? "var(--accent)"
                  : "var(--danger)",
              fontWeight: 600,
            }}
          >
            {txStatus.message}
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Total Credentials</div>
          <div className="value">{loading ? "..." : credentialCount}</div>
        </div>
        <div className="stat-card">
          <div className="label">Wallet Credentials</div>
          <div className="value">{holderCredentials.length}</div>
        </div>
      </div>

      {/* Credential Wallet */}
      <div className="section">
        <h2>Credential Wallet</h2>
        <form onSubmit={handleLoadWallet} className="card" style={{ marginBottom: "16px" }}>
          <div className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label>Holder DID Hash (bytes32)</label>
              <input
                placeholder="0x..."
                value={walletDID}
                onChange={(e) => setWalletDID(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn-primary">
              Load Credentials
            </button>
          </div>
        </form>

        {holderCredentials.length > 0 && (
          <div className="card" style={{ padding: 0, overflow: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Type</th>
                  <th>Issuer DID</th>
                  <th>Issued</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {holderCredentials.map((cred) => (
                  <tr key={cred.id}>
                    <td className="mono">#{cred.id}</td>
                    <td>{CREDENTIAL_TYPES[cred.credentialType] || `Type ${cred.credentialType}`}</td>
                    <td className="mono truncate" title={cred.issuerDID}>
                      {cred.issuerDID.slice(0, 10)}...
                    </td>
                    <td style={{ fontSize: "13px" }}>{cred.issuedAt}</td>
                    <td>
                      <span className={cred.revoked ? "status-inactive" : "status-active"}>
                        {cred.revoked ? "Revoked" : "Active"}
                      </span>
                    </td>
                    <td>
                      {!cred.revoked && (
                        <button
                          className="btn-danger"
                          style={{ fontSize: "12px", padding: "4px 12px" }}
                          onClick={() => handleRevoke(cred.id)}
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {walletDID && holderCredentials.length === 0 && !loading && (
          <div className="card">
            <p className="empty-state" style={{ padding: "16px" }}>No credentials found for this DID.</p>
          </div>
        )}
      </div>

      {/* Issue Credential */}
      <div className="section">
        <h2>Issue Credential</h2>
        <form onSubmit={handleIssue} className="card">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div className="form-group">
              <label>Issuer DID Hash (bytes32)</label>
              <input
                placeholder="0x..."
                value={issuerDID}
                onChange={(e) => setIssuerDID(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Holder DID Hash (bytes32)</label>
              <input
                placeholder="0x..."
                value={holderDID}
                onChange={(e) => setHolderDID(e.target.value)}
                required
              />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div className="form-group">
              <label>Credential Type</label>
              <select
                value={credType}
                onChange={(e) => setCredType(Number(e.target.value))}
                style={{
                  width: "100%",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  color: "var(--text)",
                  fontSize: "14px",
                }}
              >
                {CREDENTIAL_TYPES.map((type, i) => (
                  <option key={i} value={i}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Metadata URI</label>
              <input
                placeholder="ipfs://... or https://..."
                value={metadataURI}
                onChange={(e) => setMetadataURI(e.target.value)}
                required
              />
            </div>
          </div>
          <button type="submit" className="btn-primary">
            Issue Credential
          </button>
        </form>
      </div>

      {/* Verify Credential */}
      <div className="section">
        <h2>Verify Credential</h2>
        <form onSubmit={handleVerify} className="card">
          <div className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label>Credential ID</label>
              <input
                type="number"
                placeholder="0"
                value={verifyId}
                onChange={(e) => setVerifyId(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn-primary">
              Verify
            </button>
          </div>
        </form>

        {verifyResult && (
          <div
            className="card"
            style={{
              marginTop: "16px",
              borderColor: verifyResult.error
                ? "rgba(239, 68, 68, 0.3)"
                : verifyResult.valid
                ? "rgba(34, 197, 94, 0.3)"
                : "rgba(245, 158, 11, 0.3)",
            }}
          >
            {verifyResult.error ? (
              <p className="status-error" style={{ fontWeight: 600 }}>
                {verifyResult.error}
              </p>
            ) : (
              <>
                <p style={{ fontWeight: 600, marginBottom: "12px" }}>
                  Verification Result:{" "}
                  <span className={verifyResult.valid ? "status-active" : "status-inactive"}>
                    {verifyResult.valid ? "Valid" : "Invalid"}
                  </span>
                </p>
                <div className="stat-grid" style={{ marginBottom: 0 }}>
                  <div className="stat-card">
                    <div className="label">Expired</div>
                    <div className={`value ${verifyResult.expired ? "status-warning" : "status-active"}`}>
                      {verifyResult.expired ? "Yes" : "No"}
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="label">Revoked</div>
                    <div className={`value ${verifyResult.revoked ? "status-inactive" : "status-active"}`}>
                      {verifyResult.revoked ? "Yes" : "No"}
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="label">Trusted Issuer</div>
                    <div className={`value ${verifyResult.trustedIssuer ? "status-active" : "status-warning"}`}>
                      {verifyResult.trustedIssuer ? "Yes" : "No"}
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="label">Type</div>
                    <div className="value" style={{ fontSize: "16px" }}>
                      {CREDENTIAL_TYPES[verifyResult.credentialType] || `Type ${verifyResult.credentialType}`}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div style={{ textAlign: "right", marginTop: "16px" }}>
        <button className="btn-outline" onClick={fetchData} disabled={loading}>
          Refresh
        </button>
      </div>
    </div>
  );
}
