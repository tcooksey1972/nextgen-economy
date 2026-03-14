import React, { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import config, { truncateAddress, addressUrl, txUrl } from "../utils/config";
import TOKEN_ABI from "../abi/NGEToken.json";

/**
 * Governance page — Delegate voting power and view delegation stats.
 *
 * The NGE token uses ERC20Votes (OpenZeppelin) for governance voting.
 * Users must delegate (even to themselves) to activate voting power.
 * This page manages delegation and shows voting power distribution.
 *
 * Note: Full proposal/voting UI requires a Governor contract (future work).
 * This page focuses on the delegation layer that underpins governance.
 */
export default function Governance({ wallet }) {
  const [votingPower, setVotingPower] = useState("0");
  const [balance, setBalance] = useState("0");
  const [currentDelegate, setCurrentDelegate] = useState(null);
  const [delegateInput, setDelegateInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState(null);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    if (!wallet.provider || !wallet.account || !config.contracts.token) return;

    try {
      const token = new ethers.Contract(config.contracts.token, TOKEN_ABI, wallet.provider);
      const [votes, bal, del] = await Promise.all([
        token.getVotes(wallet.account),
        token.balanceOf(wallet.account),
        token.delegates(wallet.account),
      ]);
      setVotingPower(ethers.formatEther(votes));
      setBalance(ethers.formatEther(bal));
      setCurrentDelegate(del);
    } catch (err) {
      console.error("Failed to fetch governance data:", err);
    }
  }, [wallet.provider, wallet.account]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleDelegate(e) {
    e.preventDefault();
    if (!wallet.signer || !config.contracts.token) return;

    setLoading(true);
    setError(null);
    setTxHash(null);

    try {
      const token = new ethers.Contract(config.contracts.token, TOKEN_ABI, wallet.signer);
      const delegatee = delegateInput || wallet.account;
      const tx = await token.delegate(delegatee);
      await tx.wait();
      setTxHash(tx.hash);
      setDelegateInput("");
      await fetchData();
    } catch (err) {
      setError(err.reason || err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSelfDelegate() {
    if (!wallet.signer || !config.contracts.token) return;

    setLoading(true);
    setError(null);
    setTxHash(null);

    try {
      const token = new ethers.Contract(config.contracts.token, TOKEN_ABI, wallet.signer);
      const tx = await token.delegate(wallet.account);
      await tx.wait();
      setTxHash(tx.hash);
      await fetchData();
    } catch (err) {
      setError(err.reason || err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!wallet.account) {
    return (
      <div className="empty-state">
        <h2>Connect your wallet to participate in governance</h2>
        <p style={{ marginTop: "8px", color: "var(--text-muted)" }}>
          Delegate voting power, view your governance stats, and prepare for proposals.
        </p>
        <button className="btn-primary" onClick={wallet.connect} style={{ marginTop: "24px" }}>
          Connect Wallet
        </button>
      </div>
    );
  }

  if (!config.contracts.token) {
    return (
      <div className="empty-state">
        <h2>Token contract not configured</h2>
        <p style={{ marginTop: "8px", color: "var(--text-muted)" }}>
          Set REACT_APP_TOKEN_ADDRESS in your .env file after deploying the contract.
        </p>
      </div>
    );
  }

  const hasNoDelegate =
    !currentDelegate || currentDelegate === "0x0000000000000000000000000000000000000000";
  const isSelfDelegated = currentDelegate?.toLowerCase() === wallet.account?.toLowerCase();
  const balanceNum = parseFloat(balance);
  const votesNum = parseFloat(votingPower);

  return (
    <div>
      <div className="page-header">
        <h1>Governance</h1>
        <p>Delegate your voting power and participate in NGE governance.</p>
      </div>

      {error && <div className="error-message">{error}</div>}
      {txHash && (
        <div style={{ background: "rgba(34, 197, 94, 0.1)", border: "1px solid rgba(34, 197, 94, 0.3)", borderRadius: "8px", padding: "12px 16px", marginBottom: "16px" }}>
          Delegation confirmed:{" "}
          <a href={txUrl(txHash)} target="_blank" rel="noopener noreferrer" className="mono">
            {truncateAddress(txHash)}
          </a>
        </div>
      )}

      {/* Voting Stats */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Your NGE Balance</div>
          <div className="value">{formatNumber(balance)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Active Voting Power</div>
          <div className={`value ${votesNum > 0 ? "status-active" : "status-inactive"}`}>
            {formatNumber(votingPower)}
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Delegation Status</div>
          <div className="value" style={{ fontSize: "16px" }}>
            {hasNoDelegate ? (
              <span className="status-warning">Not Delegated</span>
            ) : isSelfDelegated ? (
              <span className="status-active">Self-Delegated</span>
            ) : (
              <span className="status-active">
                Delegated to{" "}
                <a href={addressUrl(currentDelegate)} target="_blank" rel="noopener noreferrer" className="mono">
                  {truncateAddress(currentDelegate)}
                </a>
              </span>
            )}
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Participation</div>
          <div className="value">
            {balanceNum > 0 ? `${((votesNum / balanceNum) * 100).toFixed(0)}%` : "—"}
          </div>
        </div>
      </div>

      {/* Activation Notice */}
      {hasNoDelegate && balanceNum > 0 && (
        <div
          className="card"
          style={{
            borderColor: "rgba(245, 158, 11, 0.3)",
            background: "rgba(245, 158, 11, 0.05)",
            marginBottom: "24px",
          }}
        >
          <h3 style={{ marginBottom: "8px", color: "var(--warning)" }}>
            Voting Power Not Activated
          </h3>
          <p style={{ color: "var(--text-muted)", marginBottom: "16px" }}>
            You hold {formatNumber(balance)} NGE tokens but haven't delegated yet.
            You must delegate (even to yourself) to activate voting power.
            Without delegation, your tokens cannot participate in governance votes.
          </p>
          <button className="btn-primary" onClick={handleSelfDelegate} disabled={loading}>
            {loading ? "Activating..." : "Activate Voting Power (Self-Delegate)"}
          </button>
        </div>
      )}

      {/* Delegate Form */}
      <div className="section">
        <h2>Delegate Voting Power</h2>
        <form onSubmit={handleDelegate} className="card">
          <p style={{ color: "var(--text-muted)", marginBottom: "16px", fontSize: "14px" }}>
            Delegate your voting power to another address, or leave empty to self-delegate.
            Delegation does not transfer tokens — only voting rights.
          </p>
          <div className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label>Delegatee Address</label>
              <input
                placeholder={`${truncateAddress(wallet.account)} (self)`}
                value={delegateInput}
                onChange={(e) => setDelegateInput(e.target.value)}
              />
            </div>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Delegating..." : "Delegate"}
            </button>
          </div>
        </form>
      </div>

      {/* How Governance Works */}
      <div className="section">
        <h2>How Governance Works</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "16px" }}>
          <div className="card">
            <h3 style={{ marginBottom: "8px", fontSize: "14px", color: "var(--accent)" }}>1. Hold NGE Tokens</h3>
            <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>
              NGE tokens represent your stake in the platform. More tokens = more voting power.
            </p>
          </div>
          <div className="card">
            <h3 style={{ marginBottom: "8px", fontSize: "14px", color: "var(--accent)" }}>2. Delegate</h3>
            <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>
              Delegate to yourself or a trusted representative. This activates your voting power without transferring tokens.
            </p>
          </div>
          <div className="card">
            <h3 style={{ marginBottom: "8px", fontSize: "14px", color: "var(--accent)" }}>3. Vote on Proposals</h3>
            <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>
              When a Governor contract is deployed, vote on proposals that shape the platform's direction.
            </p>
          </div>
        </div>
      </div>

      <div style={{ textAlign: "right", marginTop: "16px" }}>
        <button className="btn-outline" onClick={fetchData} disabled={loading}>
          Refresh
        </button>
      </div>
    </div>
  );
}

function formatNumber(value) {
  if (!value || value === "Unlimited") return value || "—";
  const num = parseFloat(value);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
  return num.toFixed(4);
}
