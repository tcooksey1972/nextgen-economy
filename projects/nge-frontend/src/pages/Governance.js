import React, { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import config, { truncateAddress, addressUrl, txUrl } from "../utils/config";
import useGovernorContract from "../hooks/useGovernorContract";
import TOKEN_ABI from "../abi/NGEToken.json";

/**
 * Governance page — Full proposal lifecycle: delegate, propose, vote, queue, execute.
 *
 * Rendering modes:
 *   1. No wallet connected → "Connect Wallet" prompt
 *   2. No token configured → "Set REACT_APP_TOKEN_ADDRESS" notice
 *   3. Token only (no Governor) → DelegationOnly view (delegation + "How Governance Works")
 *   4. Token + Governor deployed → FullGovernance view (delegation + proposals + voting)
 *
 * Data flow:
 *   - Delegation: reads from token contract on-chain (balance, votes, delegates)
 *   - Proposals:  tries Token API first (DynamoDB), falls back to on-chain event queries
 *   - Writes:     always on-chain via signer (delegate, propose, vote, queue, execute)
 *
 * Environment variables:
 *   - REACT_APP_TOKEN_ADDRESS   — Required for delegation
 *   - REACT_APP_GOVERNOR_ADDRESS — Required for full governance UI
 *   - REACT_APP_TOKEN_API       — Optional; enables cached API reads for proposals
 */
export default function Governance({ wallet }) {
  const hasGovernor = !!config.contracts.governor;

  if (!wallet.account) {
    return (
      <div className="empty-state">
        <h2>Connect your wallet to participate in governance</h2>
        <p style={{ marginTop: "8px", color: "var(--text-muted)" }}>
          Delegate voting power, create proposals, and vote on platform changes.
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

  return hasGovernor ? (
    <FullGovernance wallet={wallet} />
  ) : (
    <DelegationOnly wallet={wallet} />
  );
}

// ─── Full Governance (Governor deployed) ────────────────────────

function FullGovernance({ wallet }) {
  const {
    proposals,
    governorInfo,
    loading,
    error,
    propose,
    castVote,
    queue,
    execute,
    refresh,
  } = useGovernorContract(wallet.provider, wallet.signer, wallet.account);

  const [votingPower, setVotingPower] = useState("0");
  const [balance, setBalance] = useState("0");
  const [currentDelegate, setCurrentDelegate] = useState(null);
  const [txHash, setTxHash] = useState(null);
  const [delegateInput, setDelegateInput] = useState("");
  const [delegateLoading, setDelegateLoading] = useState(false);

  // New proposal form
  const [showProposalForm, setShowProposalForm] = useState(false);
  const [proposalDesc, setProposalDesc] = useState("");
  const [proposalTarget, setProposalTarget] = useState("");
  const [proposalValue, setProposalValue] = useState("0");

  // Fetch delegation data from token
  const fetchDelegationData = useCallback(async () => {
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
      console.error("Failed to fetch delegation data:", err);
    }
  }, [wallet.provider, wallet.account]);

  useEffect(() => {
    fetchDelegationData();
  }, [fetchDelegationData]);

  async function handleDelegate(e) {
    e.preventDefault();
    if (!wallet.signer) return;
    setDelegateLoading(true);
    setTxHash(null);
    try {
      const token = new ethers.Contract(config.contracts.token, TOKEN_ABI, wallet.signer);
      const delegatee = delegateInput || wallet.account;
      const tx = await token.delegate(delegatee);
      await tx.wait();
      setTxHash(tx.hash);
      setDelegateInput("");
      await fetchDelegationData();
    } catch (err) {
      console.error("Delegate failed:", err);
    } finally {
      setDelegateLoading(false);
    }
  }

  async function handlePropose(e) {
    e.preventDefault();
    setTxHash(null);
    try {
      // Simple proposal: send ETH from timelock or call a contract
      const targets = [proposalTarget || config.contracts.token];
      const values = [ethers.parseEther(proposalValue || "0")];
      // Empty calldata = simple ETH transfer; for token proposals use encoded function call
      const calldatas = ["0x"];
      const hash = await propose(targets, values, calldatas, proposalDesc);
      setTxHash(hash);
      setShowProposalForm(false);
      setProposalDesc("");
      setProposalTarget("");
      setProposalValue("0");
    } catch {
      // Error already set in hook
    }
  }

  async function handleVote(proposalId, support) {
    setTxHash(null);
    try {
      const hash = await castVote(proposalId, support);
      setTxHash(hash);
    } catch {
      // Error already set in hook
    }
  }

  async function handleQueue(proposal) {
    setTxHash(null);
    try {
      const descHash = ethers.id(proposal.description);
      const hash = await queue(
        proposal.targets,
        proposal.values.map((v) => BigInt(v)),
        proposal.calldatas,
        descHash
      );
      setTxHash(hash);
    } catch {
      // Error already set in hook
    }
  }

  async function handleExecute(proposal) {
    setTxHash(null);
    try {
      const descHash = ethers.id(proposal.description);
      const hash = await execute(
        proposal.targets,
        proposal.values.map((v) => BigInt(v)),
        proposal.calldatas,
        descHash
      );
      setTxHash(hash);
    } catch {
      // Error already set in hook
    }
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
        <p>Create proposals, vote, and execute on-chain governance for the NGE platform.</p>
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

      {/* Stats */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Your NGE Balance</div>
          <div className="value">{formatNumber(balance)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Voting Power</div>
          <div className={`value ${votesNum > 0 ? "status-active" : "status-inactive"}`}>
            {formatNumber(votingPower)}
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Delegation</div>
          <div className="value" style={{ fontSize: "16px" }}>
            {hasNoDelegate ? (
              <span className="status-warning">Not Delegated</span>
            ) : isSelfDelegated ? (
              <span className="status-active">Self-Delegated</span>
            ) : (
              <span className="status-active">
                <a href={addressUrl(currentDelegate)} target="_blank" rel="noopener noreferrer" className="mono">
                  {truncateAddress(currentDelegate)}
                </a>
              </span>
            )}
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Active Proposals</div>
          <div className="value">{proposals.filter((p) => p.state === 1).length}</div>
        </div>
      </div>

      {/* Governor Info */}
      {governorInfo && (
        <div className="stat-grid">
          <div className="stat-card">
            <div className="label">Voting Delay</div>
            <div className="value" style={{ fontSize: "16px" }}>{governorInfo.votingDelay} blocks</div>
          </div>
          <div className="stat-card">
            <div className="label">Voting Period</div>
            <div className="value" style={{ fontSize: "16px" }}>{governorInfo.votingPeriod} blocks</div>
          </div>
          <div className="stat-card">
            <div className="label">Proposal Threshold</div>
            <div className="value" style={{ fontSize: "16px" }}>{governorInfo.proposalThreshold} NGE</div>
          </div>
        </div>
      )}

      {/* Activate voting power notice */}
      {hasNoDelegate && balanceNum > 0 && (
        <div className="card" style={{ borderColor: "rgba(245, 158, 11, 0.3)", background: "rgba(245, 158, 11, 0.05)", marginBottom: "24px" }}>
          <h3 style={{ marginBottom: "8px", color: "var(--warning)" }}>Voting Power Not Activated</h3>
          <p style={{ color: "var(--text-muted)", marginBottom: "16px" }}>
            You hold {formatNumber(balance)} NGE but haven't delegated. Delegate to yourself to activate voting power.
          </p>
          <button className="btn-primary" onClick={() => handleDelegate({ preventDefault: () => {} })} disabled={delegateLoading}>
            {delegateLoading ? "Activating..." : "Activate (Self-Delegate)"}
          </button>
        </div>
      )}

      {/* Delegate Form */}
      <div className="section">
        <h2>Delegate Voting Power</h2>
        <form onSubmit={handleDelegate} className="card">
          <p style={{ color: "var(--text-muted)", marginBottom: "16px", fontSize: "14px" }}>
            Delegate to another address, or leave empty to self-delegate. Delegation does not transfer tokens.
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
            <button type="submit" className="btn-primary" disabled={delegateLoading}>
              {delegateLoading ? "Delegating..." : "Delegate"}
            </button>
          </div>
        </form>
      </div>

      {/* Create Proposal */}
      <div className="section">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>Proposals</h2>
          <button className="btn-primary" onClick={() => setShowProposalForm(!showProposalForm)}>
            {showProposalForm ? "Cancel" : "New Proposal"}
          </button>
        </div>

        {showProposalForm && (
          <form onSubmit={handlePropose} className="card" style={{ marginTop: "16px" }}>
            <div className="form-group">
              <label>Description</label>
              <textarea
                placeholder="Describe what this proposal does and why..."
                value={proposalDesc}
                onChange={(e) => setProposalDesc(e.target.value)}
                required
                style={{ minHeight: "80px", width: "100%", resize: "vertical", fontFamily: "inherit", padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
              />
            </div>
            <div className="form-row">
              <div className="form-group" style={{ flex: 2 }}>
                <label>Target Contract Address</label>
                <input
                  placeholder={config.contracts.token || "0x..."}
                  value={proposalTarget}
                  onChange={(e) => setProposalTarget(e.target.value)}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>ETH Value</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0"
                  value={proposalValue}
                  onChange={(e) => setProposalValue(e.target.value)}
                />
              </div>
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? "Submitting..." : "Submit Proposal"}
              </button>
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: "12px", marginTop: "8px" }}>
              Proposals target a contract address with an optional ETH value.
              After the voting delay, token holders vote For/Against/Abstain during the voting period.
            </p>
          </form>
        )}
      </div>

      {/* Proposals List */}
      {proposals.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "48px", color: "var(--text-muted)" }}>
          <p>No proposals found. Create the first proposal to start governance.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {proposals.map((p) => (
            <ProposalCard
              key={p.id}
              proposal={p}
              account={wallet.account}
              loading={loading}
              onVote={handleVote}
              onQueue={handleQueue}
              onExecute={handleExecute}
            />
          ))}
        </div>
      )}

      <div style={{ textAlign: "right", marginTop: "24px" }}>
        <button className="btn-outline" onClick={() => { refresh(); fetchDelegationData(); }} disabled={loading}>
          Refresh
        </button>
      </div>
    </div>
  );
}

// ─── Proposal Card ──────────────────────────────────────────────

function ProposalCard({ proposal, account, loading, onVote, onQueue, onExecute }) {
  const p = proposal;

  const stateColors = {
    Pending: "var(--text-muted)",
    Active: "var(--accent)",
    Canceled: "var(--text-muted)",
    Defeated: "#ef4444",
    Succeeded: "#22c55e",
    Queued: "#f59e0b",
    Expired: "var(--text-muted)",
    Executed: "#22c55e",
  };

  const totalVotes = parseFloat(p.forVotes) + parseFloat(p.againstVotes) + parseFloat(p.abstainVotes);
  const forPct = totalVotes > 0 ? ((parseFloat(p.forVotes) / totalVotes) * 100).toFixed(1) : "0";
  const againstPct = totalVotes > 0 ? ((parseFloat(p.againstVotes) / totalVotes) * 100).toFixed(1) : "0";

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
        <div>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Proposal #{p.id.slice(0, 8)}...
          </span>
          <p style={{ marginTop: "4px", fontWeight: 600 }}>
            {p.description.length > 120 ? p.description.slice(0, 120) + "..." : p.description}
          </p>
        </div>
        <span
          style={{
            fontSize: "12px",
            fontWeight: 600,
            padding: "4px 10px",
            borderRadius: "12px",
            background: `${stateColors[p.stateLabel]}20`,
            color: stateColors[p.stateLabel],
            whiteSpace: "nowrap",
          }}
        >
          {p.stateLabel}
        </span>
      </div>

      {/* Vote tally */}
      <div style={{ display: "flex", gap: "16px", marginBottom: "12px", fontSize: "13px" }}>
        <span style={{ color: "#22c55e" }}>For: {formatNumber(p.forVotes)} ({forPct}%)</span>
        <span style={{ color: "#ef4444" }}>Against: {formatNumber(p.againstVotes)} ({againstPct}%)</span>
        <span style={{ color: "var(--text-muted)" }}>Abstain: {formatNumber(p.abstainVotes)}</span>
      </div>

      {/* Vote progress bar */}
      {totalVotes > 0 && (
        <div style={{ display: "flex", height: "6px", borderRadius: "3px", overflow: "hidden", marginBottom: "12px", background: "var(--bg)" }}>
          <div style={{ width: `${forPct}%`, background: "#22c55e" }} />
          <div style={{ width: `${againstPct}%`, background: "#ef4444" }} />
        </div>
      )}

      {/* Proposer */}
      <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "12px" }}>
        Proposed by{" "}
        <a href={addressUrl(p.proposer)} target="_blank" rel="noopener noreferrer" className="mono">
          {truncateAddress(p.proposer)}
        </a>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {/* Vote buttons (Active state only) */}
        {p.state === 1 && !p.hasVoted && (
          <>
            <button
              className="btn-primary"
              onClick={() => onVote(p.id, 1)}
              disabled={loading}
              style={{ fontSize: "13px", padding: "6px 16px" }}
            >
              Vote For
            </button>
            <button
              className="btn-danger"
              onClick={() => onVote(p.id, 0)}
              disabled={loading}
              style={{ fontSize: "13px", padding: "6px 16px" }}
            >
              Vote Against
            </button>
            <button
              className="btn-outline"
              onClick={() => onVote(p.id, 2)}
              disabled={loading}
              style={{ fontSize: "13px", padding: "6px 16px" }}
            >
              Abstain
            </button>
          </>
        )}
        {p.state === 1 && p.hasVoted && (
          <span style={{ fontSize: "13px", color: "var(--text-muted)", padding: "6px 0" }}>
            You have voted on this proposal
          </span>
        )}

        {/* Queue button (Succeeded state) */}
        {p.state === 4 && (
          <button
            className="btn-primary"
            onClick={() => onQueue(p)}
            disabled={loading}
            style={{ fontSize: "13px", padding: "6px 16px" }}
          >
            Queue for Execution
          </button>
        )}

        {/* Execute button (Queued state) */}
        {p.state === 5 && (
          <button
            className="btn-primary"
            onClick={() => onExecute(p)}
            disabled={loading}
            style={{ fontSize: "13px", padding: "6px 16px" }}
          >
            Execute
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Delegation-Only View (no Governor deployed) ────────────────

function DelegationOnly({ wallet }) {
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
            {balanceNum > 0 ? `${((votesNum / balanceNum) * 100).toFixed(0)}%` : "\u2014"}
          </div>
        </div>
      </div>

      {hasNoDelegate && balanceNum > 0 && (
        <div className="card" style={{ borderColor: "rgba(245, 158, 11, 0.3)", background: "rgba(245, 158, 11, 0.05)", marginBottom: "24px" }}>
          <h3 style={{ marginBottom: "8px", color: "var(--warning)" }}>Voting Power Not Activated</h3>
          <p style={{ color: "var(--text-muted)", marginBottom: "16px" }}>
            You hold {formatNumber(balance)} NGE tokens but haven't delegated.
            Delegate to yourself to activate voting power for governance.
          </p>
          <button className="btn-primary" onClick={handleDelegate} disabled={loading}>
            {loading ? "Activating..." : "Activate Voting Power (Self-Delegate)"}
          </button>
        </div>
      )}

      <div className="section">
        <h2>Delegate Voting Power</h2>
        <form onSubmit={handleDelegate} className="card">
          <p style={{ color: "var(--text-muted)", marginBottom: "16px", fontSize: "14px" }}>
            Delegate to another address, or leave empty to self-delegate.
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

      {/* Governor not deployed notice */}
      <div className="card" style={{ textAlign: "center", padding: "32px", marginTop: "24px" }}>
        <h3 style={{ marginBottom: "8px", color: "var(--text-muted)" }}>Governor Contract Not Yet Deployed</h3>
        <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>
          The full proposal and voting system will be available once the NGE Governor
          contract is deployed. For now, delegate your voting power to prepare for governance.
        </p>
        <p style={{ color: "var(--text-muted)", fontSize: "12px", marginTop: "8px" }}>
          Set REACT_APP_GOVERNOR_ADDRESS in your .env file after deploying.
        </p>
      </div>

      <div className="section">
        <h2>How Governance Works</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
          {[
            { step: "1", title: "Hold NGE Tokens", desc: "NGE tokens represent your stake. More tokens = more voting power." },
            { step: "2", title: "Delegate", desc: "Delegate to yourself or a representative. This activates voting power without transferring tokens." },
            { step: "3", title: "Propose", desc: "Anyone meeting the threshold can submit proposals for platform changes." },
            { step: "4", title: "Vote", desc: "Vote For, Against, or Abstain during the voting period (~1 week)." },
            { step: "5", title: "Execute", desc: "Passed proposals are queued in the timelock, then executed after the delay." },
          ].map(({ step, title, desc }) => (
            <div className="card" key={step}>
              <h3 style={{ marginBottom: "8px", fontSize: "14px", color: "var(--accent)" }}>{step}. {title}</h3>
              <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>{desc}</p>
            </div>
          ))}
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
  if (!value || value === "Unlimited") return value || "\u2014";
  const num = parseFloat(value);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
  return num.toFixed(4);
}
