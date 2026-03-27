import React, { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import config, { truncateAddress } from "../utils/config";
import DID_ABI from "../abi/DIDRegistry.json";

/**
 * Identity page — DID management, resolution, and biometric binding.
 *
 * Allows users to create decentralized identifiers, resolve existing DIDs,
 * and bind biometric hashes for identity verification.
 */
export default function Identity({ wallet }) {
  const [didCount, setDidCount] = useState(0);
  const [myDIDs, setMyDIDs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [txStatus, setTxStatus] = useState(null);

  // Create DID form
  const [documentHash, setDocumentHash] = useState("");

  // Resolve DID form
  const [resolveHash, setResolveHash] = useState("");
  const [resolvedDID, setResolvedDID] = useState(null);

  // Biometric binding form
  const [bioDIDHash, setBioDIDHash] = useState("");
  const [bioHash, setBioHash] = useState("");

  const getContract = useCallback(
    (useSigner = false) => {
      if (!config.contracts.didRegistry) return null;
      const providerOrSigner = useSigner ? wallet.signer : wallet.provider;
      if (!providerOrSigner) return null;
      return new ethers.Contract(config.contracts.didRegistry, DID_ABI, providerOrSigner);
    },
    [wallet.provider, wallet.signer]
  );

  const fetchData = useCallback(async () => {
    const contract = getContract();
    if (!contract) return;

    setLoading(true);
    try {
      const count = await contract.didCount();
      setDidCount(Number(count));

      if (wallet.account) {
        const dids = await contract.getDIDsByController(wallet.account);
        setMyDIDs(dids.map((d) => d));
      }
    } catch (err) {
      console.error("Failed to fetch DID data:", err);
    }
    setLoading(false);
  }, [getContract, wallet.account]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleCreateDID(e) {
    e.preventDefault();
    setTxStatus(null);
    const contract = getContract(true);
    if (!contract) return;

    try {
      setTxStatus({ type: "pending", message: "Creating DID..." });
      const tx = await contract.createDID(documentHash);
      setTxStatus({ type: "pending", message: `Transaction submitted: ${tx.hash}` });
      await tx.wait();
      setTxStatus({ type: "success", message: "DID created successfully." });
      setDocumentHash("");
      fetchData();
    } catch (err) {
      setTxStatus({ type: "error", message: err.reason || err.message });
    }
  }

  async function handleResolve(e) {
    e.preventDefault();
    setResolvedDID(null);
    const contract = getContract();
    if (!contract || !resolveHash) return;

    try {
      const result = await contract.resolve(resolveHash);
      setResolvedDID({
        controller: result[0],
        documentHash: result[1],
        created: new Date(Number(result[2]) * 1000).toISOString(),
        updated: new Date(Number(result[3]) * 1000).toISOString(),
        active: result[4],
      });
    } catch (err) {
      setResolvedDID({ error: err.reason || err.message });
    }
  }

  async function handleBindBiometric(e) {
    e.preventDefault();
    setTxStatus(null);
    const contract = getContract(true);
    if (!contract) return;

    try {
      setTxStatus({ type: "pending", message: "Binding biometric..." });
      const tx = await contract.bindBiometric(bioDIDHash, bioHash);
      setTxStatus({ type: "pending", message: `Transaction submitted: ${tx.hash}` });
      await tx.wait();
      setTxStatus({ type: "success", message: "Biometric bound successfully." });
      setBioDIDHash("");
      setBioHash("");
    } catch (err) {
      setTxStatus({ type: "error", message: err.reason || err.message });
    }
  }

  if (!wallet.account) {
    return (
      <div className="empty-state">
        <h2>Connect your wallet to manage your identity</h2>
        <p style={{ marginTop: "8px", color: "var(--text-muted)" }}>
          Create and manage decentralized identifiers, resolve DIDs, and bind biometrics.
        </p>
        <button className="btn-primary" onClick={wallet.connect} style={{ marginTop: "24px" }}>
          Connect Wallet
        </button>
      </div>
    );
  }

  if (!config.contracts.didRegistry) {
    return (
      <div className="empty-state">
        <h2>DID Registry not configured</h2>
        <p style={{ marginTop: "8px", color: "var(--text-muted)" }}>
          Set REACT_APP_DID_REGISTRY_ADDRESS in your .env file after deploying the contract.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Identity</h1>
        <p>
          Manage decentralized identifiers on {config.chainName} &mdash;{" "}
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
          <div className="label">Total DIDs</div>
          <div className="value">{loading ? "..." : didCount}</div>
        </div>
        <div className="stat-card">
          <div className="label">My DIDs</div>
          <div className="value">{loading ? "..." : myDIDs.length}</div>
        </div>
      </div>

      {/* Create DID */}
      <div className="section">
        <h2>Create DID</h2>
        <form onSubmit={handleCreateDID} className="card">
          <div className="form-group">
            <label>Document Hash (bytes32)</label>
            <input
              placeholder="0x..."
              value={documentHash}
              onChange={(e) => setDocumentHash(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn-primary">
            Create DID
          </button>
        </form>
      </div>

      {/* My DIDs */}
      {myDIDs.length > 0 && (
        <div className="section">
          <h2>My DIDs</h2>
          <div className="card" style={{ padding: 0, overflow: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>DID Hash</th>
                </tr>
              </thead>
              <tbody>
                {myDIDs.map((did, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td className="mono truncate" title={did} style={{ maxWidth: "400px" }}>
                      {did}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Resolve DID */}
      <div className="section">
        <h2>Resolve DID</h2>
        <form onSubmit={handleResolve} className="card">
          <div className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label>DID Hash (bytes32)</label>
              <input
                placeholder="0x..."
                value={resolveHash}
                onChange={(e) => setResolveHash(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn-primary">
              Resolve
            </button>
          </div>
        </form>

        {resolvedDID && (
          <div
            className="card"
            style={{
              marginTop: "16px",
              borderColor: resolvedDID.error
                ? "rgba(239, 68, 68, 0.3)"
                : "rgba(34, 197, 94, 0.3)",
            }}
          >
            {resolvedDID.error ? (
              <p className="status-error" style={{ fontWeight: 600 }}>
                {resolvedDID.error}
              </p>
            ) : (
              <>
                <p style={{ fontWeight: 600, marginBottom: "12px" }}>
                  Status:{" "}
                  <span className={resolvedDID.active ? "status-active" : "status-inactive"}>
                    {resolvedDID.active ? "Active" : "Deactivated"}
                  </span>
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px" }}>
                      Controller
                    </div>
                    <div className="mono" style={{ fontSize: "13px" }}>
                      {truncateAddress(resolvedDID.controller)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px" }}>
                      Document Hash
                    </div>
                    <div className="mono" style={{ fontSize: "13px", wordBreak: "break-all" }}>
                      {resolvedDID.documentHash}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px" }}>
                      Created
                    </div>
                    <div style={{ fontSize: "14px" }}>{resolvedDID.created}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px" }}>
                      Updated
                    </div>
                    <div style={{ fontSize: "14px" }}>{resolvedDID.updated}</div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Biometric Binding */}
      <div className="section">
        <h2>Biometric Binding</h2>
        <form onSubmit={handleBindBiometric} className="card">
          <div className="form-group">
            <label>DID Hash (bytes32)</label>
            <input
              placeholder="0x..."
              value={bioDIDHash}
              onChange={(e) => setBioDIDHash(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>Biometric Hash (bytes32)</label>
            <input
              placeholder="0x..."
              value={bioHash}
              onChange={(e) => setBioHash(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn-primary">
            Bind Biometric
          </button>
        </form>
      </div>

      <div style={{ textAlign: "right", marginTop: "16px" }}>
        <button className="btn-outline" onClick={fetchData} disabled={loading}>
          Refresh
        </button>
      </div>
    </div>
  );
}
