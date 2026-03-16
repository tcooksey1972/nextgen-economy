import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import { Link } from "react-router-dom";
import config, { truncateAddress, addressUrl } from "../utils/config";
import { getTokenInfo, getBalance } from "../utils/api";
import TOKEN_ABI from "../abi/NGEToken.json";
import DEVICE_ABI from "../abi/DeviceRegistry.json";

/**
 * Dashboard — Platform overview with key metrics from all contracts.
 *
 * Shows: token supply, device count, wallet balance, and quick actions.
 * Data is fetched from the serverless API first (fast, cached), with
 * on-chain fallback if the API is not configured.
 */
export default function Dashboard({ wallet, auth }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchStats() {
      if (!wallet.provider) return;

      setLoading(true);
      const data = {};
      const tokens = auth?.tokens || null;

      // Token stats — try API first, fall back to on-chain
      if (config.contracts.token) {
        try {
          if (config.api.token) {
            const info = await getTokenInfo(tokens);
            data.token = {
              totalSupply: info.totalSupply || "0",
              supplyCap: info.supplyCap || "Unlimited",
              paused: info.paused || false,
            };
            if (wallet.account) {
              const bal = await getBalance(wallet.account, tokens);
              data.token.balance = bal.balance || "0";
              data.token.votingPower = bal.votingPower || "0";
            }
          } else {
            // On-chain fallback
            const token = new ethers.Contract(config.contracts.token, TOKEN_ABI, wallet.provider);
            const [totalSupply, supplyCap, paused] = await Promise.all([
              token.totalSupply(),
              token.supplyCap(),
              token.paused(),
            ]);
            data.token = {
              totalSupply: ethers.formatEther(totalSupply),
              supplyCap: supplyCap === 0n ? "Unlimited" : ethers.formatEther(supplyCap),
              paused,
            };
            if (wallet.account) {
              const [balance, votes] = await Promise.all([
                token.balanceOf(wallet.account),
                token.getVotes(wallet.account),
              ]);
              data.token.balance = ethers.formatEther(balance);
              data.token.votingPower = ethers.formatEther(votes);
            }
          }
        } catch {
          data.token = null;
        }
      }

      // IoT stats (on-chain only — no IoT API for listing yet)
      if (config.contracts.iot) {
        try {
          const registry = new ethers.Contract(config.contracts.iot, DEVICE_ABI, wallet.provider);
          const deviceCount = await registry.deviceCount();
          data.iot = { deviceCount: Number(deviceCount) };

          if (wallet.account) {
            const owned = await registry.balanceOf(wallet.account);
            data.iot.ownedDevices = Number(owned);
          }
        } catch {
          data.iot = null;
        }
      }

      // ETH balance
      if (wallet.account) {
        try {
          const ethBal = await wallet.provider.getBalance(wallet.account);
          data.ethBalance = ethers.formatEther(ethBal);
        } catch {
          data.ethBalance = "0";
        }
      }

      setStats(data);
      setLoading(false);
    }

    fetchStats();
  }, [wallet.provider, wallet.account, auth?.tokens]);

  if (!wallet.account) {
    return (
      <div className="empty-state">
        <h1 style={{ fontSize: "36px", marginBottom: "16px" }}>NextGen Economy</h1>
        <p style={{ fontSize: "18px", marginBottom: "32px" }}>
          Web3 platform for tokenomics, IoT device management, and governance.
        </p>
        <button className="btn-primary" onClick={wallet.connect} style={{ fontSize: "16px", padding: "14px 32px" }}>
          Connect Wallet to Get Started
        </button>
        <div style={{ marginTop: "48px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "24px", textAlign: "left" }}>
          <div className="card">
            <h3 style={{ marginBottom: "8px" }}>NGE Token</h3>
            <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>
              ERC-20 platform token with governance voting, gasless approvals, and configurable supply cap.
            </p>
          </div>
          <div className="card">
            <h3 style={{ marginBottom: "8px" }}>IoT Devices</h3>
            <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>
              ERC-721 device identity with tamper-proof data anchoring for IoT sensor networks.
            </p>
          </div>
          <div className="card">
            <h3 style={{ marginBottom: "8px" }}>Governance</h3>
            <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>
              Delegate voting power, participate in proposals, and shape the platform's future.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loading || !stats) {
    return <div className="loading">Loading platform data...</div>;
  }

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>
          Connected as{" "}
          <a href={addressUrl(wallet.account)} target="_blank" rel="noopener noreferrer" className="mono">
            {truncateAddress(wallet.account)}
          </a>{" "}
          on {config.chainName}
        </p>
      </div>

      {/* Wallet Stats */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">ETH Balance</div>
          <div className="value">{parseFloat(stats.ethBalance || 0).toFixed(4)}</div>
        </div>
        {stats.token && (
          <>
            <div className="stat-card">
              <div className="label">NGE Balance</div>
              <div className="value">{formatNumber(stats.token.balance)}</div>
            </div>
            <div className="stat-card">
              <div className="label">Voting Power</div>
              <div className="value">{formatNumber(stats.token.votingPower)}</div>
            </div>
          </>
        )}
        {stats.iot && (
          <div className="stat-card">
            <div className="label">My Devices</div>
            <div className="value">{stats.iot.ownedDevices ?? 0}</div>
          </div>
        )}
      </div>

      {/* Platform Stats */}
      <div className="section">
        <h2>Platform Overview</h2>
        <div className="stat-grid">
          {stats.token && (
            <>
              <div className="stat-card">
                <div className="label">Total NGE Supply</div>
                <div className="value">{formatNumber(stats.token.totalSupply)}</div>
              </div>
              <div className="stat-card">
                <div className="label">Supply Cap</div>
                <div className="value">{formatNumber(stats.token.supplyCap)}</div>
              </div>
              <div className="stat-card">
                <div className="label">Token Status</div>
                <div className={`value ${stats.token.paused ? "status-paused" : "status-active"}`}>
                  {stats.token.paused ? "Paused" : "Active"}
                </div>
              </div>
            </>
          )}
          {stats.iot && (
            <div className="stat-card">
              <div className="label">Registered Devices</div>
              <div className="value">{stats.iot.deviceCount}</div>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="section">
        <h2>Quick Actions</h2>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <Link to="/token">
            <button className="btn-primary">Manage Tokens</button>
          </Link>
          <Link to="/devices">
            <button className="btn-outline">View Devices</button>
          </Link>
          <Link to="/governance">
            <button className="btn-outline">Governance</button>
          </Link>
        </div>
      </div>

      {/* Contract Addresses */}
      <div className="section">
        <h2>Contract Addresses</h2>
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Contract</th>
                <th>Address</th>
                <th>Network</th>
              </tr>
            </thead>
            <tbody>
              {config.contracts.token && (
                <tr>
                  <td>NGE Token</td>
                  <td>
                    <a href={addressUrl(config.contracts.token)} target="_blank" rel="noopener noreferrer" className="mono truncate" style={{ display: "block" }}>
                      {config.contracts.token}
                    </a>
                  </td>
                  <td>{config.chainName}</td>
                </tr>
              )}
              {config.contracts.iot && (
                <tr>
                  <td>Device Registry</td>
                  <td>
                    <a href={addressUrl(config.contracts.iot)} target="_blank" rel="noopener noreferrer" className="mono truncate" style={{ display: "block" }}>
                      {config.contracts.iot}
                    </a>
                  </td>
                  <td>{config.chainName}</td>
                </tr>
              )}
              {config.contracts.sentinel && (
                <tr>
                  <td>Sentinel Vault</td>
                  <td>
                    <a href={addressUrl(config.contracts.sentinel)} target="_blank" rel="noopener noreferrer" className="mono truncate" style={{ display: "block" }}>
                      {config.contracts.sentinel}
                    </a>
                  </td>
                  <td>{config.chainName}</td>
                </tr>
              )}
              {!config.contracts.token && !config.contracts.iot && !config.contracts.sentinel && (
                <tr>
                  <td colSpan="3" className="empty-state" style={{ padding: "24px" }}>
                    No contracts configured. Set REACT_APP_TOKEN_ADDRESS, REACT_APP_IOT_ADDRESS, and REACT_APP_SENTINEL_ADDRESS in your .env file.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
