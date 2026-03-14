import React, { useState } from "react";
import { Link } from "react-router-dom";

/**
 * UseCases — Scenario-based product explanations.
 *
 * Each scenario tells a story: a real-world problem, how NGE solves it,
 * and which platform components are involved. Written for business
 * decision-makers, not just developers.
 */

const CATEGORIES = ["All", "Security", "IoT", "Governance"];

const SCENARIOS = [
  // ─── Security (Sentinel) ────────────────────────
  {
    id: "defi-vault",
    category: "Security",
    title: "DeFi Vault Protection",
    subtitle: "A treasury vault that protects itself — even from a compromised admin key.",
    problem:
      "Your organization holds $2M in a smart contract treasury. If the admin's private key is compromised through phishing or a laptop breach, an attacker could drain the entire vault in a single transaction.",
    solution:
      "Deploy a FullSentinelVault with all four security modules. The RateLimiter caps withdrawals at $50K per 24-hour window — even the owner can't exceed it. WatchdogAlert flags any transfer over $10K and rapid successive withdrawals. If the admin key is compromised and no one is responding, the DeadManSwitch auto-pauses the contract after 72 hours of missed heartbeats. As a last resort, the BreakGlass module lets three pre-designated guardians recover the vault through a 48-hour timelocked multi-sig vote.",
    outcome:
      "Maximum loss in a worst-case key compromise: $50K (one rate-limit window) instead of $2M. The monitoring dashboard sends email alerts within 60 seconds of suspicious activity. The guardians have 48 hours of advance notice before any recovery action executes.",
    components: ["Sentinel Vault", "Rate Limiter", "Dead Man Switch", "Break Glass", "Watchdog", "AWS Monitor"],
    color: "var(--accent)",
  },
  {
    id: "dao-treasury",
    category: "Security",
    title: "DAO Treasury Governance",
    subtitle: "Protecting community funds from insider threats and governance attacks.",
    problem:
      "A DAO treasury holds community funds managed by elected multi-sig holders. History shows that multi-sig signers can collude, go rogue, or get socially engineered. Flash loan governance attacks can pass malicious proposals in a single block.",
    solution:
      "Wrap the DAO treasury in a SentinelVault with RateLimiter and WatchdogAlert. Rate limiting ensures no single proposal can drain more than a percentage of the treasury per period. The Watchdog detects unusually large or rapid withdrawals and emits on-chain alerts that the monitoring backend escalates to community leaders via SNS email. The DeadManSwitch ensures the treasury auto-pauses if all multi-sig holders simultaneously go inactive.",
    outcome:
      "Even if a governance attack passes a malicious proposal, the rate limiter caps the damage. Community leaders get real-time alerts and have time to respond. The treasury is protected by code, not just trust.",
    components: ["Sentinel Vault", "Rate Limiter", "Watchdog", "Dead Man Switch", "AWS Monitor"],
    color: "var(--accent)",
  },
  {
    id: "key-rotation",
    category: "Security",
    title: "Emergency Key Rotation",
    subtitle: "Recovering a contract when the owner's key is lost or compromised.",
    problem:
      "The sole owner of a production smart contract loses their hardware wallet in a house fire. Or worse — they're a departing employee who refuses to hand over the key. The contract holds live funds and active user deposits. Traditional smart contracts have no recovery mechanism.",
    solution:
      "The BreakGlass module designates 5 recovery guardians at deployment time (board members, legal counsel, a cold-storage backup). Any guardian can propose a new owner. If 3 of 5 approve, the proposal enters a mandatory 48-hour timelock. After the delay, any guardian can execute the ownership transfer. The entire lifecycle — proposal, approvals, execution — is recorded on-chain and visible on the monitoring dashboard.",
    outcome:
      "Ownership is recovered in 48-72 hours without any centralized authority. The timelock gives the community and legal team time to verify the transfer is legitimate. All actions are permanently auditable on the blockchain.",
    components: ["Break Glass", "AWS Monitor"],
    color: "var(--accent)",
  },

  // ─── IoT ─────────────────────────────────────────
  {
    id: "cold-chain",
    category: "IoT",
    title: "Cold Chain Compliance",
    subtitle: "Proving pharmaceutical shipments stayed within temperature range — tamper-proof.",
    problem:
      "A pharmaceutical distributor ships vaccines that must stay between 2-8\u00B0C. Regulators require proof of continuous cold chain compliance. Current systems use centralized databases that drivers or warehouse staff can edit after the fact. A single data falsification incident can cost $10M+ in regulatory fines and product recalls.",
    solution:
      "Install NGE-registered IoT sensors in each shipping container. Each sensor is minted as an ERC-721 token (its on-chain identity) and paired with a physical device via AWS IoT Core. Every 5 minutes, the sensor publishes a temperature reading to the MQTT broker. The IoT bridge Lambda hashes the reading (sensor ID + timestamp + value) and anchors it to the blockchain via the DataAnchor contract. The sensor's firmware hash is also recorded on-chain at registration, so any firmware tampering is detectable.",
    outcome:
      "At the receiving dock, scan the shipment's device ID and verify on-chain that every reading was within range — no database access needed. Regulators get a blockchain-verified audit trail that cannot be altered retroactively. The anchoring cost is fractions of a cent per reading on L2, and the verification API is free (view call, no gas).",
    components: ["Device Registry", "Data Anchor", "AWS IoT Bridge", "Verification API"],
    color: "var(--success)",
  },
  {
    id: "smart-grid",
    category: "IoT",
    title: "Smart Grid Energy Metering",
    subtitle: "Tamper-proof energy production records for solar panel owners.",
    problem:
      "A community solar program compensates homeowners for excess energy fed back to the grid. Utility companies and homeowners dispute meter readings — each side claims the other's data is inaccurate. Legacy meters can be physically tampered with, and centralized meter data is controlled by one party.",
    solution:
      "Each smart meter is registered as an ERC-721 device on the NGE platform. Hourly energy production and consumption readings are published via MQTT, hashed, and anchored on-chain by the IoT bridge. Both the homeowner and the utility can independently verify any reading by checking the blockchain anchor. The device's status (active, suspended) and firmware version are visible on-chain, preventing disputes about meter legitimacy.",
    outcome:
      "Billing disputes are resolved instantly — both parties check the same immutable record. Tampering with a meter's firmware changes its on-chain hash, immediately flagging the device. Monthly settlement can be automated: verified production readings feed directly into a payment smart contract.",
    components: ["Device Registry", "Data Anchor", "AWS IoT Bridge", "Verification API"],
    color: "var(--success)",
  },
  {
    id: "environmental",
    category: "IoT",
    title: "Environmental Monitoring & Carbon Credits",
    subtitle: "Verifiable air quality data that backs tradeable carbon credits.",
    problem:
      "Carbon credit markets are plagued by fraud. Companies claim emissions reductions based on self-reported data. Environmental monitoring stations are operated by the same entities being measured. There's no independent, tamper-proof verification layer.",
    solution:
      "Deploy a network of NGE-registered air quality sensors across industrial zones. Each sensor is an ERC-721 device with a verified firmware hash. Readings (PM2.5, CO2, NOx) are anchored to the blockchain every 15 minutes via the IoT bridge. Carbon credit issuance is tied directly to verified on-chain data — credits can only be minted when anchored sensor readings prove actual emissions reductions over a baseline period.",
    outcome:
      "Carbon credits are backed by cryptographically verified, tamper-proof sensor data. Auditors verify claims by querying the blockchain — no site visits needed for routine checks. Fraudulent credits become structurally impossible because the underlying data is immutable and publicly verifiable.",
    components: ["Device Registry", "Data Anchor", "AWS IoT Bridge", "NGE Token", "Verification API"],
    color: "var(--success)",
  },

  // ─── Governance ──────────────────────────────────
  {
    id: "platform-governance",
    category: "Governance",
    title: "Platform Governance",
    subtitle: "Token holders vote on protocol upgrades, fee structures, and treasury allocations.",
    problem:
      "Web3 platforms are often governed by a small team making unilateral decisions about protocol changes, fee structures, and treasury spending. Users have no voice, creating the same centralization problems that blockchain was designed to solve.",
    solution:
      "NGE token holders delegate their voting power (to themselves or representatives) and participate in on-chain governance. The ERC20Votes extension tracks voting power with historical checkpoints — votes are counted at the block a proposal was created, preventing flash-loan manipulation. A Governor contract (OpenZeppelin) manages the proposal lifecycle: submit, vote (for/against/abstain), queue through the TimelockController, and execute. A 4% quorum ensures meaningful participation.",
    outcome:
      "Fee changes, treasury allocations, and protocol upgrades require community approval. Voting power is proportional to token holdings but can be delegated to domain experts. The timelock delay gives the community time to react before any approved change takes effect. All votes are permanently recorded on-chain.",
    components: ["NGE Token", "ERC20Votes", "Governor", "Timelock"],
    color: "var(--warning)",
  },
  {
    id: "iot-device-approval",
    category: "Governance",
    title: "Device Certification Voting",
    subtitle: "Community-approved IoT device manufacturers join the trusted registry.",
    problem:
      "An open IoT platform needs a way to vet which device manufacturers are trusted. Centralized approval creates bottlenecks and conflicts of interest. But allowing any device to register without review opens the door to malicious or faulty hardware polluting the data network.",
    solution:
      "New device manufacturers submit a governance proposal to be added to the platform's trusted manufacturer list. NGE token holders review the manufacturer's specifications, security audit results, and track record, then vote on-chain. Approved manufacturers receive a role in the AccessControl contract that allows their devices to be registered. The community can also vote to revoke a manufacturer's access if quality degrades.",
    outcome:
      "Device quality is community-governed rather than centrally decided. Manufacturers have a transparent, meritocratic path to platform access. Bad actors can be removed through the same democratic process. The entire approval history is on-chain and auditable.",
    components: ["NGE Token", "Governor", "Device Registry", "Access Control"],
    color: "var(--warning)",
  },
  {
    id: "staking-rewards",
    category: "Governance",
    title: "Staking & Data Validation Rewards",
    subtitle: "Token holders earn rewards for validating IoT data quality.",
    problem:
      "Anchoring IoT data on-chain proves it hasn't been modified, but it doesn't prove the original reading was accurate. A faulty sensor or a deliberately miscalibrated device can anchor garbage data that looks legitimate on-chain.",
    solution:
      "NGE token holders stake tokens to become data validators. Validators are randomly assigned to cross-check IoT readings against reference data, neighboring sensors, and historical baselines. Validators who correctly flag anomalous data earn staking rewards from the protocol fee pool. Validators who are idle or make false flags lose a portion of their stake (slashing). This creates an economic incentive layer on top of the cryptographic integrity layer.",
    outcome:
      "IoT data is protected at two levels: cryptographic integrity (on-chain anchoring) and economic validation (staked human review). Data consumers get a confidence score based on validation history. The token has real utility — it powers the validation economy, not just governance votes.",
    components: ["NGE Token", "Device Registry", "Data Anchor", "Staking Contract"],
    color: "var(--warning)",
  },
];

export default function UseCases() {
  const [activeCategory, setActiveCategory] = useState("All");

  const filtered =
    activeCategory === "All"
      ? SCENARIOS
      : SCENARIOS.filter((s) => s.category === activeCategory);

  return (
    <div>
      <div className="page-header" style={{ textAlign: "center", paddingTop: "32px" }}>
        <h1 style={{ fontSize: "36px" }}>Use Cases</h1>
        <p style={{ fontSize: "16px", maxWidth: "600px", margin: "8px auto 0" }}>
          Real-world scenarios showing how NextGen Economy solves problems
          across security, IoT, and governance.
        </p>
      </div>

      {/* Category Filter */}
      <div style={filterBarStyle}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={cat === activeCategory ? filterActiveBtnStyle : filterBtnStyle}
          >
            {cat}
            {cat !== "All" && (
              <span style={filterCountStyle}>
                {SCENARIOS.filter((s) => cat === "All" || s.category === cat).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Scenario Cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
        {filtered.map((scenario) => (
          <ScenarioCard key={scenario.id} scenario={scenario} />
        ))}
      </div>

      {/* Bottom CTA */}
      <div style={{ textAlign: "center", padding: "64px 0 32px" }}>
        <h2 style={{ fontSize: "24px", marginBottom: "16px" }}>See it in action</h2>
        <p style={{ color: "var(--text-muted)", marginBottom: "24px" }}>
          Connect your wallet to explore the live platform, or learn more about
          the architecture.
        </p>
        <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap" }}>
          <Link to="/dashboard">
            <button className="btn-primary" style={{ fontSize: "15px", padding: "12px 24px" }}>
              Launch App
            </button>
          </Link>
          <Link to="/about">
            <button className="btn-outline" style={{ fontSize: "15px", padding: "12px 24px" }}>
              Platform Architecture
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function ScenarioCard({ scenario }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="card"
      style={{ borderLeft: `3px solid ${scenario.color}`, cursor: "pointer" }}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
        <div>
          <span style={{ ...categoryBadgeStyle, color: scenario.color, borderColor: scenario.color }}>
            {scenario.category}
          </span>
          <h3 style={{ fontSize: "20px", fontWeight: 700, marginTop: "8px" }}>{scenario.title}</h3>
          <p style={{ color: "var(--text-muted)", fontSize: "15px", marginTop: "4px" }}>
            {scenario.subtitle}
          </p>
        </div>
        <span style={{ color: "var(--text-muted)", fontSize: "20px", flexShrink: 0, marginLeft: "16px" }}>
          {expanded ? "\u25B2" : "\u25BC"}
        </span>
      </div>

      {expanded && (
        <div style={{ marginTop: "16px" }}>
          {/* Problem */}
          <div style={scenarioSectionStyle}>
            <h4 style={scenarioLabelStyle}>
              <span style={{ color: "var(--danger)" }}>The Problem</span>
            </h4>
            <p style={scenarioBodyStyle}>{scenario.problem}</p>
          </div>

          {/* Solution */}
          <div style={scenarioSectionStyle}>
            <h4 style={scenarioLabelStyle}>
              <span style={{ color: "var(--success)" }}>The NGE Solution</span>
            </h4>
            <p style={scenarioBodyStyle}>{scenario.solution}</p>
          </div>

          {/* Outcome */}
          <div style={scenarioSectionStyle}>
            <h4 style={scenarioLabelStyle}>
              <span style={{ color: "var(--accent)" }}>The Outcome</span>
            </h4>
            <p style={scenarioBodyStyle}>{scenario.outcome}</p>
          </div>

          {/* Components */}
          <div style={{ marginTop: "16px" }}>
            <h4 style={{ ...scenarioLabelStyle, marginBottom: "8px" }}>Platform Components Used</h4>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {scenario.components.map((comp) => (
                <span key={comp} style={componentBadgeStyle}>
                  {comp}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Styles ────────────────────────────── */

const filterBarStyle = {
  display: "flex",
  gap: "8px",
  justifyContent: "center",
  marginBottom: "40px",
  flexWrap: "wrap",
};

const filterBtnStyle = {
  background: "transparent",
  color: "var(--text-muted)",
  border: "1px solid var(--border)",
  borderRadius: "20px",
  padding: "8px 20px",
  fontSize: "14px",
  fontWeight: 500,
  display: "flex",
  alignItems: "center",
  gap: "6px",
};

const filterActiveBtnStyle = {
  ...filterBtnStyle,
  background: "rgba(59, 130, 246, 0.1)",
  color: "var(--accent)",
  borderColor: "var(--accent)",
};

const filterCountStyle = {
  fontSize: "11px",
  background: "rgba(255,255,255,0.1)",
  padding: "1px 6px",
  borderRadius: "10px",
};

const categoryBadgeStyle = {
  fontSize: "11px",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  border: "1px solid",
  borderRadius: "4px",
  padding: "2px 8px",
};

const scenarioSectionStyle = {
  marginBottom: "16px",
};

const scenarioLabelStyle = {
  fontSize: "13px",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: "6px",
};

const scenarioBodyStyle = {
  color: "var(--text-muted)",
  fontSize: "14px",
  lineHeight: 1.7,
};

const componentBadgeStyle = {
  fontSize: "12px",
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: "6px",
  padding: "4px 10px",
  color: "var(--text-muted)",
};
