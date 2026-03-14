import React, { useState } from "react";
import useTokenContract from "../hooks/useTokenContract";
import config, { txUrl, truncateAddress } from "../utils/config";

/**
 * Token page — NGE token management: balance, transfer, delegate, burn.
 */
export default function Token({ wallet }) {
  const { tokenInfo, balance, votingPower, delegate, loading, error, transfer, delegateVotes, burn, refresh } =
    useTokenContract(wallet.provider, wallet.signer, wallet.account);

  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [delegateTo, setDelegateTo] = useState("");
  const [burnAmount, setBurnAmount] = useState("");
  const [txHash, setTxHash] = useState(null);

  if (!wallet.account) {
    return (
      <div className="empty-state">
        <h2>Connect your wallet to manage NGE tokens</h2>
        <p style={{ marginTop: "8px", color: "var(--text-muted)" }}>
          Transfer tokens, delegate voting power, and burn tokens.
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

  async function handleTransfer(e) {
    e.preventDefault();
    setTxHash(null);
    const hash = await transfer(transferTo, transferAmount);
    setTxHash(hash);
    setTransferTo("");
    setTransferAmount("");
  }

  async function handleDelegate(e) {
    e.preventDefault();
    setTxHash(null);
    const hash = await delegateVotes(delegateTo || wallet.account);
    setTxHash(hash);
    setDelegateTo("");
  }

  async function handleBurn(e) {
    e.preventDefault();
    setTxHash(null);
    const hash = await burn(burnAmount);
    setTxHash(hash);
    setBurnAmount("");
  }

  return (
    <div>
      <div className="page-header">
        <h1>NGE Token</h1>
        <p>Manage your NextGen Economy tokens — transfer, delegate, and burn.</p>
      </div>

      {error && <div className="error-message">{error}</div>}
      {txHash && (
        <div style={{ background: "rgba(34, 197, 94, 0.1)", border: "1px solid rgba(34, 197, 94, 0.3)", borderRadius: "8px", padding: "12px 16px", marginBottom: "16px" }}>
          Transaction confirmed:{" "}
          <a href={txUrl(txHash)} target="_blank" rel="noopener noreferrer" className="mono">
            {truncateAddress(txHash)}
          </a>
        </div>
      )}

      {/* Token Info */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Your Balance</div>
          <div className="value">{formatNumber(balance)} NGE</div>
        </div>
        <div className="stat-card">
          <div className="label">Voting Power</div>
          <div className="value">{formatNumber(votingPower)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Delegate</div>
          <div className="value mono" style={{ fontSize: "14px" }}>
            {delegate && delegate !== "0x0000000000000000000000000000000000000000"
              ? truncateAddress(delegate)
              : "None"}
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Token Status</div>
          <div className={`value ${tokenInfo?.paused ? "status-paused" : "status-active"}`}>
            {tokenInfo?.paused ? "Paused" : "Active"}
          </div>
        </div>
      </div>

      {/* Platform token stats */}
      {tokenInfo && (
        <div className="stat-grid">
          <div className="stat-card">
            <div className="label">Total Supply</div>
            <div className="value">{formatNumber(tokenInfo.totalSupply)}</div>
          </div>
          <div className="stat-card">
            <div className="label">Supply Cap</div>
            <div className="value">{formatNumber(tokenInfo.supplyCap)}</div>
          </div>
        </div>
      )}

      {/* Transfer */}
      <div className="section">
        <h2>Transfer</h2>
        <form onSubmit={handleTransfer} className="card">
          <div className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label>Recipient Address</label>
              <input
                placeholder="0x..."
                value={transferTo}
                onChange={(e) => setTransferTo(e.target.value)}
                required
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Amount (NGE)</label>
              <input
                type="number"
                step="any"
                min="0"
                placeholder="0.0"
                value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Sending..." : "Transfer"}
            </button>
          </div>
        </form>
      </div>

      {/* Delegate */}
      <div className="section">
        <h2>Delegate Voting Power</h2>
        <form onSubmit={handleDelegate} className="card">
          <div className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label>Delegatee Address (leave empty to self-delegate)</label>
              <input
                placeholder={wallet.account}
                value={delegateTo}
                onChange={(e) => setDelegateTo(e.target.value)}
              />
            </div>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Delegating..." : "Delegate"}
            </button>
          </div>
        </form>
      </div>

      {/* Burn */}
      <div className="section">
        <h2>Burn Tokens</h2>
        <form onSubmit={handleBurn} className="card">
          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label>Amount to Burn (NGE)</label>
              <input
                type="number"
                step="any"
                min="0"
                placeholder="0.0"
                value={burnAmount}
                onChange={(e) => setBurnAmount(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn-danger" disabled={loading}>
              {loading ? "Burning..." : "Burn"}
            </button>
          </div>
        </form>
      </div>

      <div style={{ textAlign: "right", marginTop: "16px" }}>
        <button className="btn-outline" onClick={refresh} disabled={loading}>
          Refresh Data
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
