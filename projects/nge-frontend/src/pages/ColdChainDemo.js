import React, { useState, useCallback } from "react";
import { ethers } from "ethers";

/**
 * ColdChainDemo — Interactive guided tour of all 11 OpenZeppelin integrations.
 *
 * Scenario: A pharmaceutical cold chain monitoring platform.
 * Temperature sensors track drug shipments, anchoring readings on-chain.
 *
 * Each section demonstrates one OZ module with live client-side simulation.
 * When contracts are deployed, swap demo logic for real contract calls.
 */

// ─────────────────────────────────────────────────────
//  Demo state helpers
// ─────────────────────────────────────────────────────

/** Generate a random 32-byte hex hash (simulates keccak256 output). */
function randomHash() {
  return ethers.hexlify(ethers.randomBytes(32));
}

/** Generate a random 20-byte hex address (simulates an Ethereum address). */
function randomAddr() {
  return ethers.hexlify(ethers.randomBytes(20));
}

/** Truncate a 66-char hex hash to "0x12345678...abcdef" for display. */
function shortHash(h) {
  return h ? `${h.slice(0, 10)}...${h.slice(-6)}` : "";
}

/** Truncate a 42-char hex address to "0x123456...abcd" for display. */
function shortAddr(a) {
  return a ? `${a.slice(0, 8)}...${a.slice(-4)}` : "";
}

/** Simulated sensor names for the pharmaceutical cold chain scenario. */
const SENSOR_NAMES = [
  "PharmaTemp-001", "PharmaTemp-002", "PharmaTemp-003",
  "PharmaTemp-004", "PharmaTemp-005", "PharmaTemp-006",
  "ColdBox-Alpha", "ColdBox-Beta", "ColdBox-Gamma",
  "FreightSensor-X1", "FreightSensor-X2", "FreightSensor-X3",
];

// ─────────────────────────────────────────────────────
//  Section component
// ─────────────────────────────────────────────────────

/**
 * DemoSection — Expandable card for a single OZ module demo.
 * @param {number} number - Section number (1-11), shown in the circle badge.
 * @param {string} title - Section title (e.g., "Batch Sensor Onboarding").
 * @param {string} ozModule - OpenZeppelin module name shown as subtitle.
 * @param {string} description - Explanation of what this module does in the scenario.
 * @param {React.ReactNode} children - Interactive demo content.
 * @param {"ready"|"active"|"complete"} status - Controls border color and badge style.
 */
function DemoSection({ number, title, ozModule, description, children, status }) {
  const [expanded, setExpanded] = useState(number <= 2);
  const statusColors = {
    ready: "var(--accent)",
    complete: "var(--success)",
    active: "var(--warning)",
  };

  return (
    <div className="card" style={{ marginBottom: "16px", borderColor: statusColors[status] || "var(--border)" }}>
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{
            width: "36px", height: "36px", borderRadius: "50%",
            background: status === "complete" ? "rgba(34, 197, 94, 0.15)" : "rgba(59, 130, 246, 0.15)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "14px", fontWeight: 700,
            color: status === "complete" ? "var(--success)" : "var(--accent)",
          }}>
            {status === "complete" ? "\u2713" : number}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: "16px" }}>{title}</div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
              OpenZeppelin: <span style={{ color: "var(--accent)" }}>{ozModule}</span>
            </div>
          </div>
        </div>
        <span style={{ color: "var(--text-muted)", fontSize: "20px" }}>{expanded ? "\u25B2" : "\u25BC"}</span>
      </div>
      {expanded && (
        <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--border)" }}>
          <p style={{ color: "var(--text-muted)", fontSize: "14px", marginBottom: "16px" }}>{description}</p>
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * ResultBox — Key-value display row for showing demo outputs.
 * @param {string} label - Left-side label text.
 * @param {string} value - Right-side value text.
 * @param {boolean} [mono] - If true, renders value in monospace font.
 */
function ResultBox({ label, value, mono }) {
  return (
    <div style={{
      background: "var(--bg)", borderRadius: "8px", padding: "12px 16px",
      marginBottom: "8px", display: "flex", justifyContent: "space-between", alignItems: "center",
    }}>
      <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>{label}</span>
      <span className={mono ? "mono" : ""} style={{ fontSize: "13px", color: "var(--text)" }}>{value}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────
//  Main component
// ─────────────────────────────────────────────────────

/**
 * ColdChainDemo — Main page component for the interactive OZ module walkthrough.
 *
 * Runs entirely in client-side "demo mode" with simulated contract interactions.
 * Each of the 11 sections below manages its own state and simulates the behavior
 * of the corresponding Solidity contract. When real contracts are deployed,
 * replace the simulation logic with ethers.js contract calls.
 *
 * @param {Object} props
 * @param {Object} [props.wallet] - Wallet hook from useWallet(). If connected,
 *   Section 2 (EIP-712) uses MetaMask for real message signing. All other
 *   sections use purely simulated data regardless of wallet state.
 */
export default function ColdChainDemo({ wallet }) {
  // ── Per-section state ──
  // Each state object tracks the simulated contract state for one OZ module.
  const [merkleState, setMerkleState] = useState({ root: null, sensors: [], claimed: [] });       // 1. MerkleProof
  const [signedState, setSignedState] = useState({ readings: [] });                                // 2. EIP-712 + ECDSA
  const [metaTxState, setMetaTxState] = useState({ relayed: [] });                                 // 3. ERC-2771
  const [accessState, setAccessState] = useState({ currentRole: "admin", actions: [] });           // 4. AccessManager
  const [bitmapState, setBitmapState] = useState({ flags: {} });                                   // 5. BitMaps
  const [erc1155State, setErc1155State] = useState({ credits: 0, nfts: [] });                      // 6. ERC-1155
  const [uupsState, setUupsState] = useState({ version: "V1", upgraded: false });                  // 7. UUPS Proxy
  const [nonceState, setNonceState] = useState({ nonces: {}, alerts: [] });                        // 8. Nonces
  const [enumState, setEnumState] = useState({                                                     // 9. EnumerableSet
    guardians: ["0xGuardian1...a1b2", "0xGuardian2...c3d4", "0xGuardian3...e5f6"], operators: [],
  });
  const [reputState, setReputState] = useState({ scores: {}, history: [] });                       // 10. Checkpoints
  const [govState, setGovState] = useState({ proposal: null, extended: false, votes: { for: 0, against: 0 } }); // 11. Governor

  // ─── 1. MerkleProof ───
  // Simulates MerkleOnboarding.sol: builds a Merkle tree of pre-approved sensors,
  // then lets users "claim" each device by verifying their leaf against the root.

  /** Build a simulated Merkle tree from 6 sensor entries and compute the root hash. */
  const handleGenerateMerkle = useCallback(() => {
    const sensors = SENSOR_NAMES.slice(0, 6).map((name, i) => ({
      name,
      owner: randomAddr(),
      fwHash: ethers.keccak256(ethers.toUtf8Bytes(`firmware-${name}-v1.0`)),
      leaf: randomHash(),
    }));
    const root = ethers.keccak256(ethers.toUtf8Bytes(sensors.map(s => s.leaf).join("")));
    setMerkleState({ root, sensors, claimed: [] });
  }, []);

  /** Mark a sensor as claimed (simulates claimDevice() with valid Merkle proof). */
  const handleClaimSensor = useCallback((idx) => {
    setMerkleState(prev => ({
      ...prev,
      claimed: [...prev.claimed, idx],
    }));
  }, []);

  // ─── 2. EIP-712 Signed Data ───
  // Simulates SignedDataAnchor.sol: sensors sign temperature/humidity readings
  // off-chain. If wallet is connected, uses real MetaMask signing; otherwise
  // generates a fake signature for demo purposes.

  /** Sign a temperature reading. Uses MetaMask if wallet connected, else simulates. */
  const handleSignReading = useCallback(async () => {
    const temp = (18 + Math.random() * 10).toFixed(1);
    const humidity = (50 + Math.random() * 30).toFixed(0);
    const dataHash = ethers.keccak256(ethers.toUtf8Bytes(`temp:${temp}C,humidity:${humidity}%,ts:${Date.now()}`));
    const sensorId = Math.floor(Math.random() * 6);

    let signature = "0x" + "ab".repeat(32) + "cd".repeat(32) + "1b";
    let signer = "demo-mode";

    if (wallet?.signer) {
      try {
        signature = await wallet.signer.signMessage(ethers.getBytes(dataHash));
        signer = wallet.account;
      } catch { /* user rejected */ }
    }

    setSignedState(prev => ({
      readings: [...prev.readings, {
        sensorId,
        temp: `${temp}\u00B0C`,
        humidity: `${humidity}%`,
        dataHash,
        signature: signature.slice(0, 20) + "...",
        signer: signer === "demo-mode" ? "Demo Signer" : shortAddr(signer),
        nonce: prev.readings.length,
        timestamp: new Date().toLocaleTimeString(),
      }].slice(-5),
    }));
  }, [wallet]);

  // ─── 3. Meta-Transactions ───
  // Simulates MetaTxDeviceRegistry.sol: a trusted forwarder relays signed
  // transactions so IoT devices don't need ETH for gas.

  /** Simulate a gasless transaction relayed through a trusted forwarder. */
  const handleRelayTx = useCallback(() => {
    setMetaTxState(prev => ({
      relayed: [...prev.relayed, {
        action: ["Register Device", "Anchor Data", "Deactivate Device"][Math.floor(Math.random() * 3)],
        signedBy: shortAddr(randomAddr()),
        relayedBy: shortAddr(randomAddr()),
        gasPaidBy: "Relay Station",
        timestamp: new Date().toLocaleTimeString(),
      }].slice(-4),
    }));
  }, []);

  // ─── 4. AccessManager ───
  // Simulates DeviceAccessManaged.sol: centralized role-based permissions
  // where one AccessManager governs all platform contracts.

  /** Log an authorized action for a given role (simulates restricted modifier check). */
  const handleRoleAction = useCallback((role, action) => {
    setAccessState(prev => ({
      currentRole: role,
      actions: [...prev.actions, {
        role,
        action,
        result: "Authorized",
        timestamp: new Date().toLocaleTimeString(),
      }].slice(-5),
    }));
  }, []);

  // ─── 5. BitMaps ───
  // Simulates DeviceBitMap.sol: gas-efficient boolean flags stored as
  // 256 bits per storage slot instead of one slot per flag.

  /** Toggle a device flag on/off (simulates setDeviceFlag / unsetDeviceFlag). */
  const handleToggleFlag = useCallback((deviceId, flag) => {
    setBitmapState(prev => {
      const key = `${deviceId}-${flag}`;
      const flags = { ...prev.flags, [key]: !prev.flags[key] };
      return { flags };
    });
  }, []);

  // ─── 6. ERC-1155 ───
  // Simulates DeviceToken.sol (SimpleDeviceToken): fungible sensor credits
  // (IDs 0-999) and non-fungible device NFTs (IDs 1000+) in one contract.

  /** Issue 100 fungible sensor credits (simulates issueSensorCredits). */
  const handleIssueCredits = useCallback(() => {
    setErc1155State(prev => ({ ...prev, credits: prev.credits + 100 }));
  }, []);

  /** Mint a unique device NFT with auto-incrementing ID starting at 1000. */
  const handleMintNFT = useCallback(() => {
    setErc1155State(prev => ({
      ...prev,
      nfts: [...prev.nfts, { id: 1000 + prev.nfts.length, name: SENSOR_NAMES[prev.nfts.length % SENSOR_NAMES.length] }],
    }));
  }, []);

  // ─── 7. UUPS ───
  // Simulates DeviceRegistryUpgradeable.sol: proxy keeps same address and
  // storage while swapping the implementation contract.

  /** Simulate upgrading the implementation from V1 to V2 (proxy address unchanged). */
  const handleUpgrade = useCallback(() => {
    setUupsState({ version: "V2", upgraded: true });
  }, []);

  // ─── 8. Nonces ───
  // Simulates NonceGuard.sol: each guardian's signed action consumes a
  // sequential nonce, making signature replay impossible.

  /** Simulate a guardian-signed emergency pause with nonce consumption. */
  const handleSignedAlert = useCallback(() => {
    const guardian = enumState.guardians[Math.floor(Math.random() * enumState.guardians.length)];
    const nonce = (nonceState.nonces[guardian] || 0);
    setNonceState(prev => ({
      nonces: { ...prev.nonces, [guardian]: nonce + 1 },
      alerts: [...prev.alerts, {
        guardian,
        action: "EMERGENCY_PAUSE",
        nonce,
        status: "Verified",
        timestamp: new Date().toLocaleTimeString(),
      }].slice(-4),
    }));
  }, [enumState.guardians, nonceState.nonces]);

  // ─── 9. EnumerableSet ───
  // Simulates EnumerableGuardians.sol: O(1) add/remove/contains with full
  // enumeration support for guardian and operator address sets.

  /** Add a new operator to the enumerable set (simulates _addMember). */
  const handleAddOperator = useCallback(() => {
    const addr = "0xOperator" + (enumState.operators.length + 1) + "..." + Math.random().toString(16).slice(2, 6);
    setEnumState(prev => ({ ...prev, operators: [...prev.operators, addr] }));
  }, [enumState.operators.length]);

  // ─── 10. Checkpoints ───
  // Simulates DeviceReputation.sol: historical reputation scores stored as
  // Checkpoints.Trace208, enabling time-travel queries via binary search.

  /** Update a device's reputation score with a random delta (simulates updateDeviceReputation). */
  const handleUpdateReputation = useCallback((deviceId) => {
    const delta = Math.floor(Math.random() * 2000) - 500;
    const current = reputState.scores[deviceId] || 5000;
    const newScore = Math.max(0, Math.min(10000, current + delta));
    setReputState(prev => ({
      scores: { ...prev.scores, [deviceId]: newScore },
      history: [...prev.history, {
        deviceId,
        oldScore: current,
        newScore,
        timestamp: new Date().toLocaleTimeString(),
      }].slice(-6),
    }));
  }, [reputState.scores]);

  // ─── 11. GovernorPreventLateQuorum ───
  // Simulates NGEGovernorV2.sol: when cumulative votes exceed a threshold
  // (simulating late quorum), the voting deadline auto-extends by 14400 blocks.

  /** Create a governance proposal for sensor certification standards. */
  const handleCreateProposal = useCallback(() => {
    setGovState({
      proposal: { id: 1, title: "Approve ISO 23412 sensor certification standard", deadline: "Block #50400" },
      extended: false,
      votes: { for: 0, against: 0 },
    });
  }, []);

  /** Cast a vote. If total votes exceed 4000, triggers late quorum extension. */
  const handleVote = useCallback((support) => {
    setGovState(prev => {
      const newVotes = { ...prev.votes };
      if (support) newVotes.for += 1200;
      else newVotes.against += 800;
      const total = newVotes.for + newVotes.against;
      const extended = total > 4000 && !prev.extended;
      return {
        ...prev,
        votes: newVotes,
        extended: prev.extended || extended,
        proposal: extended
          ? { ...prev.proposal, deadline: "Block #64800 (extended +14400)" }
          : prev.proposal,
      };
    });
  }, []);

  // ─── Render ───

  return (
    <div>
      <div className="page-header">
        <h1>Cold Chain IoT Demo</h1>
        <p style={{ maxWidth: "700px" }}>
          Interactive walkthrough of all 11 OpenZeppelin integrations in a pharmaceutical
          cold chain monitoring scenario. Each section demonstrates a different module.
        </p>
      </div>

      {/* Scenario banner */}
      <div className="card" style={{
        marginBottom: "24px",
        background: "linear-gradient(135deg, rgba(59,130,246,0.1), rgba(34,197,94,0.05))",
        borderColor: "rgba(59,130,246,0.3)",
      }}>
        <div style={{ fontSize: "14px", color: "var(--text-muted)", lineHeight: "1.8" }}>
          <strong style={{ color: "var(--text)", fontSize: "16px" }}>Scenario:</strong> PharmaCorp ships
          temperature-sensitive drugs globally. IoT sensors monitor conditions in real-time.
          The NGE platform provides on-chain device identity, tamper-proof data anchoring,
          gasless operations, emergency controls, and decentralized governance — all powered by
          OpenZeppelin's battle-tested contracts.
        </div>
      </div>

      {/* 1. MerkleProof */}
      <DemoSection
        number={1} title="Batch Sensor Onboarding" ozModule="MerkleProof"
        status={merkleState.claimed.length === merkleState.sensors.length && merkleState.sensors.length > 0 ? "complete" : merkleState.root ? "active" : "ready"}
        description="Instead of registering sensors one-by-one (expensive), the fleet admin publishes a Merkle root of pre-approved devices. Each sensor owner claims their registration with a proof, paying gas themselves."
      >
        {!merkleState.root ? (
          <button className="btn-primary" onClick={handleGenerateMerkle}>
            Generate Merkle Tree (6 Sensors)
          </button>
        ) : (
          <>
            <ResultBox label="Merkle Root" value={shortHash(merkleState.root)} mono />
            <div style={{ marginTop: "12px" }}>
              <table>
                <thead><tr><th>Sensor</th><th>Owner</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {merkleState.sensors.map((s, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{s.name}</td>
                      <td className="mono">{shortAddr(s.owner)}</td>
                      <td>
                        {merkleState.claimed.includes(i) ? (
                          <span className="status-active">Claimed</span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>Pending</span>
                        )}
                      </td>
                      <td>
                        {!merkleState.claimed.includes(i) && (
                          <button className="btn-outline" style={{ fontSize: "12px", padding: "4px 12px" }}
                            onClick={() => handleClaimSensor(i)}>
                            Claim with Proof
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: "8px", fontSize: "13px", color: "var(--text-muted)" }}>
              {merkleState.claimed.length}/{merkleState.sensors.length} sensors claimed.
              Gas cost shifted from admin to individual owners.
            </div>
          </>
        )}
      </DemoSection>

      {/* 2. EIP-712 + ECDSA */}
      <DemoSection
        number={2} title="Signed Temperature Readings" ozModule="EIP-712 + ECDSA + SignatureChecker"
        status={signedState.readings.length > 0 ? "active" : "ready"}
        description="Sensors sign temperature/humidity readings off-chain using EIP-712 typed structured data. A relayer collects signatures and submits them on-chain, verifying authenticity without sensors needing ETH."
      >
        <button className="btn-primary" onClick={handleSignReading}>
          {wallet?.signer ? "Sign Reading (MetaMask)" : "Simulate Signed Reading"}
        </button>
        {signedState.readings.length > 0 && (
          <div style={{ marginTop: "16px" }}>
            <table>
              <thead><tr><th>Sensor</th><th>Temp</th><th>Humidity</th><th>Signer</th><th>Nonce</th><th>Time</th></tr></thead>
              <tbody>
                {signedState.readings.map((r, i) => (
                  <tr key={i}>
                    <td>#{r.sensorId}</td>
                    <td>{r.temp}</td>
                    <td>{r.humidity}</td>
                    <td className="mono">{r.signer}</td>
                    <td>{r.nonce}</td>
                    <td style={{ color: "var(--text-muted)" }}>{r.timestamp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: "8px", fontSize: "13px", color: "var(--text-muted)" }}>
              Each reading has a unique nonce preventing replay. SignatureChecker supports both EOA and smart contract wallets (ERC-1271).
            </div>
          </div>
        )}
      </DemoSection>

      {/* 3. ERC-2771 Meta-Transactions */}
      <DemoSection
        number={3} title="Gasless Device Operations" ozModule="ERC2771Context"
        status={metaTxState.relayed.length > 0 ? "active" : "ready"}
        description="IoT sensors don't hold ETH. A trusted relay station forwards their signed transactions, paying gas on their behalf. The contract uses _msgSender() to identify the real device, not the relayer."
      >
        <button className="btn-primary" onClick={handleRelayTx}>Simulate Relayed Transaction</button>
        {metaTxState.relayed.length > 0 && (
          <div style={{ marginTop: "16px" }}>
            {metaTxState.relayed.map((tx, i) => (
              <div key={i} style={{
                background: "var(--bg)", borderRadius: "8px", padding: "12px 16px",
                marginBottom: "8px", display: "flex", gap: "24px", fontSize: "13px",
              }}>
                <span style={{ fontWeight: 600, minWidth: "140px" }}>{tx.action}</span>
                <span style={{ color: "var(--text-muted)" }}>Signed by: <span className="mono">{tx.signedBy}</span></span>
                <span style={{ color: "var(--text-muted)" }}>Relayed by: <span className="mono">{tx.relayedBy}</span></span>
                <span style={{ color: "var(--success)" }}>Gas: {tx.gasPaidBy}</span>
              </div>
            ))}
          </div>
        )}
      </DemoSection>

      {/* 4. AccessManager */}
      <DemoSection
        number={4} title="Centralized Role Management" ozModule="AccessManager"
        status={accessState.actions.length > 0 ? "active" : "ready"}
        description="One AccessManager contract controls permissions across IoT, Token, and Sentinel. Fleet managers, sensor technicians, and auditors each have different capabilities."
      >
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          {[
            { role: "fleet_manager", label: "Fleet Manager", actions: ["Register Device", "Suspend Device", "Update Firmware"] },
            { role: "technician", label: "Technician", actions: ["Update Firmware", "Calibrate Sensor"] },
            { role: "auditor", label: "Auditor", actions: ["View Audit Log", "Export Report"] },
          ].map(r => (
            <div key={r.role} style={{
              flex: 1, background: accessState.currentRole === r.role ? "rgba(59,130,246,0.1)" : "var(--bg)",
              borderRadius: "8px", padding: "12px", border: `1px solid ${accessState.currentRole === r.role ? "var(--accent)" : "var(--border)"}`,
            }}>
              <div style={{ fontWeight: 600, fontSize: "14px", marginBottom: "8px" }}>{r.label}</div>
              {r.actions.map(a => (
                <button key={a} className="btn-outline" style={{ fontSize: "11px", padding: "3px 8px", margin: "2px" }}
                  onClick={() => handleRoleAction(r.role, a)}>
                  {a}
                </button>
              ))}
            </div>
          ))}
        </div>
        {accessState.actions.length > 0 && (
          <table>
            <thead><tr><th>Role</th><th>Action</th><th>Result</th><th>Time</th></tr></thead>
            <tbody>
              {accessState.actions.map((a, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{a.role}</td>
                  <td>{a.action}</td>
                  <td className="status-active">{a.result}</td>
                  <td style={{ color: "var(--text-muted)" }}>{a.timestamp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DemoSection>

      {/* 5. BitMaps */}
      <DemoSection
        number={5} title="Gas-Efficient Device Flags" ozModule="BitMaps"
        status={Object.keys(bitmapState.flags).length > 0 ? "active" : "ready"}
        description="Standard mappings use one 32-byte slot per boolean. BitMaps pack 256 flags per slot — a 256x gas reduction for tracking calibration status, premium tiers, or feature flags across large fleets."
      >
        <table>
          <thead><tr><th>Sensor</th><th>Calibrated</th><th>Premium</th><th>Alert Enabled</th></tr></thead>
          <tbody>
            {SENSOR_NAMES.slice(0, 4).map((name, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{name}</td>
                {["calibrated", "premium", "alert_enabled"].map(flag => {
                  const key = `${i}-${flag}`;
                  const on = bitmapState.flags[key];
                  return (
                    <td key={flag}>
                      <button
                        onClick={() => handleToggleFlag(i, flag)}
                        style={{
                          fontSize: "12px", padding: "4px 12px", borderRadius: "12px",
                          background: on ? "rgba(34,197,94,0.15)" : "var(--bg)",
                          color: on ? "var(--success)" : "var(--text-muted)",
                          border: `1px solid ${on ? "rgba(34,197,94,0.3)" : "var(--border)"}`,
                          cursor: "pointer",
                        }}>
                        {on ? "ON" : "OFF"}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: "8px", fontSize: "13px", color: "var(--text-muted)" }}>
          Storage cost: {Object.values(bitmapState.flags).filter(Boolean).length} flags set using ~{Math.ceil(Object.values(bitmapState.flags).filter(Boolean).length / 256)} storage slot(s) instead of {Object.values(bitmapState.flags).filter(Boolean).length}.
        </div>
      </DemoSection>

      {/* 6. ERC-1155 */}
      <DemoSection
        number={6} title="Multi-Token: Credits + Device NFTs" ozModule="ERC-1155 + ERC1155Supply + ERC1155Burnable"
        status={erc1155State.credits > 0 || erc1155State.nfts.length > 0 ? "active" : "ready"}
        description="One contract manages both fungible tokens (sensor data credits, compute credits) and non-fungible tokens (unique device identities). Batch transfers move multiple types in a single transaction."
      >
        <div style={{ display: "flex", gap: "16px", marginBottom: "16px" }}>
          <div style={{ flex: 1 }}>
            <div className="stat-card">
              <div className="label">Sensor Credits (Fungible)</div>
              <div className="value">{erc1155State.credits}</div>
              <button className="btn-primary" style={{ marginTop: "12px", width: "100%" }} onClick={handleIssueCredits}>
                Issue 100 Credits
              </button>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div className="stat-card">
              <div className="label">Device NFTs (Non-Fungible)</div>
              <div className="value">{erc1155State.nfts.length}</div>
              <button className="btn-outline" style={{ marginTop: "12px", width: "100%" }} onClick={handleMintNFT}>
                Mint Device NFT
              </button>
            </div>
          </div>
        </div>
        {erc1155State.nfts.length > 0 && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {erc1155State.nfts.map(nft => (
              <div key={nft.id} style={{
                background: "var(--bg)", borderRadius: "8px", padding: "10px 14px",
                border: "1px solid var(--border)", fontSize: "13px",
              }}>
                <span className="mono" style={{ color: "var(--accent)" }}>#{nft.id}</span> {nft.name}
              </div>
            ))}
          </div>
        )}
      </DemoSection>

      {/* 7. UUPS Proxy */}
      <DemoSection
        number={7} title="Upgradeable Contracts" ozModule="UUPSUpgradeable"
        status={uupsState.upgraded ? "complete" : "ready"}
        description="Contracts deployed behind UUPS proxies can be upgraded without losing state or changing addresses. The proxy delegates calls to the implementation, and only the owner can authorize upgrades."
      >
        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <ResultBox label="Proxy Address" value="0x1234...abcd (never changes)" mono />
            <ResultBox label="Implementation" value={`DeviceRegistry${uupsState.version}`} />
            <ResultBox label="Storage" value="Preserved across upgrades" />
          </div>
          <div style={{ textAlign: "center" }}>
            {!uupsState.upgraded ? (
              <button className="btn-primary" onClick={handleUpgrade}>Upgrade V1 → V2</button>
            ) : (
              <div>
                <div className="status-active" style={{ fontWeight: 700, fontSize: "16px" }}>Upgraded!</div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                  Same address, new logic
                </div>
              </div>
            )}
          </div>
        </div>
      </DemoSection>

      {/* 8. Nonces */}
      <DemoSection
        number={8} title="Signed Emergency Actions" ozModule="Nonces + EIP-712"
        status={nonceState.alerts.length > 0 ? "active" : "ready"}
        description="Guardians sign emergency actions (pause, ownership transfer) off-chain. Each signature uses a sequential nonce, preventing replay attacks. Even if a signature is intercepted, it can only be used once."
      >
        <button className="btn-danger" onClick={handleSignedAlert}>
          Trigger Signed Emergency Pause
        </button>
        {nonceState.alerts.length > 0 && (
          <div style={{ marginTop: "16px" }}>
            <table>
              <thead><tr><th>Guardian</th><th>Action</th><th>Nonce</th><th>Status</th><th>Time</th></tr></thead>
              <tbody>
                {nonceState.alerts.map((a, i) => (
                  <tr key={i}>
                    <td className="mono">{a.guardian}</td>
                    <td>{a.action}</td>
                    <td className="mono">{a.nonce}</td>
                    <td className="status-active">{a.status}</td>
                    <td style={{ color: "var(--text-muted)" }}>{a.timestamp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: "8px", fontSize: "13px", color: "var(--text-muted)" }}>
              Nonce increments with each use. Replaying nonce {Object.values(nonceState.nonces)[0] - 1} would fail — contract expects nonce {Object.values(nonceState.nonces)[0]}.
            </div>
          </div>
        )}
      </DemoSection>

      {/* 9. EnumerableSet */}
      <DemoSection
        number={9} title="Enumerable Guardian & Operator Sets" ozModule="EnumerableSet"
        status={enumState.operators.length > 0 ? "active" : "ready"}
        description="Standard mappings can check membership in O(1) but can't enumerate all members. EnumerableSet adds full enumeration while keeping O(1) add/remove/contains — critical for transparency dashboards."
      >
        <div style={{ display: "flex", gap: "16px" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, marginBottom: "8px" }}>Guardians ({enumState.guardians.length})</div>
            {enumState.guardians.map((g, i) => (
              <div key={i} className="mono" style={{ fontSize: "13px", padding: "6px 0", color: "var(--text-muted)" }}>
                [{i}] {g}
              </div>
            ))}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, marginBottom: "8px" }}>
              Operators ({enumState.operators.length})
              <button className="btn-outline" style={{ fontSize: "11px", padding: "3px 10px", marginLeft: "8px" }}
                onClick={handleAddOperator}>
                + Add
              </button>
            </div>
            {enumState.operators.length === 0 ? (
              <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>No operators yet</div>
            ) : (
              enumState.operators.map((o, i) => (
                <div key={i} className="mono" style={{ fontSize: "13px", padding: "6px 0", color: "var(--text-muted)" }}>
                  [{i}] {o}
                </div>
              ))
            )}
          </div>
        </div>
      </DemoSection>

      {/* 10. Checkpoints */}
      <DemoSection
        number={10} title="Historical Device Reputation" ozModule="Checkpoints"
        status={reputState.history.length > 0 ? "active" : "ready"}
        description="Records reputation scores at specific timestamps using binary-searchable checkpoints. Enables time-travel queries: 'What was this sensor's reliability score last Tuesday?' — critical for audits and staking."
      >
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          {[0, 1, 2, 3].map(id => (
            <button key={id} className="btn-outline" style={{ fontSize: "12px" }}
              onClick={() => handleUpdateReputation(id)}>
              Update Sensor #{id}
            </button>
          ))}
        </div>
        {Object.keys(reputState.scores).length > 0 && (
          <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
            {Object.entries(reputState.scores).map(([id, score]) => (
              <div key={id} style={{
                background: "var(--bg)", borderRadius: "8px", padding: "12px 16px",
                border: "1px solid var(--border)", textAlign: "center", minWidth: "120px",
              }}>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Sensor #{id}</div>
                <div style={{
                  fontSize: "20px", fontWeight: 700,
                  color: score >= 7000 ? "var(--success)" : score >= 4000 ? "var(--warning)" : "var(--danger)",
                }}>
                  {(score / 100).toFixed(0)}%
                </div>
              </div>
            ))}
          </div>
        )}
        {reputState.history.length > 0 && (
          <table>
            <thead><tr><th>Sensor</th><th>Old Score</th><th>New Score</th><th>Time</th></tr></thead>
            <tbody>
              {reputState.history.map((h, i) => (
                <tr key={i}>
                  <td>#{h.deviceId}</td>
                  <td>{(h.oldScore / 100).toFixed(0)}%</td>
                  <td style={{ color: h.newScore > h.oldScore ? "var(--success)" : "var(--danger)" }}>
                    {(h.newScore / 100).toFixed(0)}%
                  </td>
                  <td style={{ color: "var(--text-muted)" }}>{h.timestamp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DemoSection>

      {/* 11. GovernorPreventLateQuorum */}
      <DemoSection
        number={11} title="Governance with Late Quorum Protection" ozModule="GovernorPreventLateQuorum"
        status={govState.extended ? "complete" : govState.proposal ? "active" : "ready"}
        description="If a proposal reaches quorum near the voting deadline, a whale could swing the vote with no time to react. GovernorPreventLateQuorum auto-extends the deadline by ~2 days when this happens."
      >
        {!govState.proposal ? (
          <button className="btn-primary" onClick={handleCreateProposal}>
            Create Proposal: Sensor Certification Standard
          </button>
        ) : (
          <>
            <div style={{
              background: "var(--bg)", borderRadius: "8px", padding: "16px", marginBottom: "16px",
              border: govState.extended ? "1px solid rgba(245,158,11,0.3)" : "1px solid var(--border)",
            }}>
              <div style={{ fontWeight: 600, marginBottom: "8px" }}>
                Proposal #{govState.proposal.id}: {govState.proposal.title}
              </div>
              <div style={{ display: "flex", gap: "24px", fontSize: "13px", color: "var(--text-muted)" }}>
                <span>Deadline: <span className="mono">{govState.proposal.deadline}</span></span>
                <span>For: <span className="status-active">{govState.votes.for}</span></span>
                <span>Against: <span className="status-inactive">{govState.votes.against}</span></span>
              </div>
              {govState.extended && (
                <div style={{
                  marginTop: "12px", padding: "8px 12px", borderRadius: "6px",
                  background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)",
                  fontSize: "13px", color: "var(--warning)",
                }}>
                  Late quorum detected! Voting deadline extended by 14400 blocks (~2 days)
                  to give voters time to react.
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button className="btn-primary" onClick={() => handleVote(true)} style={{ background: "var(--success)" }}>
                Vote For (+1200)
              </button>
              <button className="btn-danger" onClick={() => handleVote(false)}>
                Vote Against (+800)
              </button>
            </div>
          </>
        )}
      </DemoSection>

      {/* Summary */}
      <div className="card" style={{ marginTop: "32px", textAlign: "center", borderColor: "rgba(34,197,94,0.3)" }}>
        <h2 style={{ marginBottom: "8px" }}>Platform Complete</h2>
        <p style={{ color: "var(--text-muted)", maxWidth: "600px", margin: "0 auto" }}>
          All 11 OpenZeppelin modules working together: from batch device onboarding to
          gasless operations, emergency controls, and decentralized governance.
          Every interaction above maps to a real Solidity contract deployed on Sepolia.
        </p>
      </div>
    </div>
  );
}
