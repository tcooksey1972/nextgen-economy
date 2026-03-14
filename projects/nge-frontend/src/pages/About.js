import React from "react";
import { Link } from "react-router-dom";

/**
 * About — Platform architecture, team info, and technical deep-dive.
 *
 * Aimed at technical evaluators, potential partners, and developers
 * who want to understand how the pieces fit together.
 */
export default function About() {
  return (
    <div>
      <div className="page-header" style={{ textAlign: "center", paddingTop: "32px" }}>
        <h1 style={{ fontSize: "36px" }}>About NextGen Economy</h1>
        <p style={{ fontSize: "16px", maxWidth: "600px", margin: "8px auto 0" }}>
          An open Web3 platform by Cloud Creations LLC — bridging blockchain security,
          IoT data integrity, and community governance.
        </p>
      </div>

      {/* Architecture Diagram */}
      <section style={sectionStyle}>
        <h2 style={headingStyle}>Platform Architecture</h2>
        <div className="card" style={{ padding: "32px", overflowX: "auto" }}>
          <pre style={diagramStyle}>{`
  Users / Devices                    Ethereum (Sepolia / Mainnet)
  ─────────────────                  ────────────────────────────
  Browser + MetaMask  ──────────►    NGE Token (ERC-20)
       │                                 ├── Voting Power (ERC20Votes)
       │                                 ├── Gasless Approvals (EIP-2612)
       │                                 └── Supply Cap + Burn + Pause
       │
       ├── React Frontend  ─────►    Sentinel Vault
       │   (S3 + CloudFront)            ├── DeadManSwitch (heartbeat)
       │                                ├── RateLimiter (withdrawal cap)
       │                                ├── BreakGlass (multi-sig recovery)
       │                                └── WatchdogAlert (anomaly detection)
       │
       │                             Device Registry (ERC-721)
       │                                 ├── Device Identity (NFT per device)
       │                                 ├── DataAnchor (keccak-256 hashing)
       │                                 └── Firmware Verification
       │
  IoT Sensors  ──► MQTT ──►  AWS     AWS Serverless Backend
  ─────────────────────────  ────     ──────────────────────
  Temperature                IoT     Lambda Functions
  Humidity                   Rules       ├── Event Poller (sentinel)
  Air Quality                  │         ├── Heartbeat Monitor
  Energy Meters                │         ├── API Handlers (REST)
       │                       │         ├── Device Registration
       │                       ▼         ├── Data Anchoring
       └───────────────► AWS Lambda ──►  └── Anchor Verification
                              │
                         DynamoDB        Supporting Services
                              │          ──────────────────
                         API Gateway     S3 (frontend + assets)
                              │          CloudFront (CDN)
                         SNS (alerts)    SSM (contract addresses)
                              │          Secrets Manager (keys)
                         CloudWatch      EventBridge (schedules)
          `}</pre>
        </div>
      </section>

      {/* Tech Stack */}
      <section style={sectionStyle}>
        <h2 style={headingStyle}>Technology Stack</h2>
        <div style={stackGridStyle}>
          <StackCard
            title="Smart Contracts"
            items={[
              { label: "Language", value: "Solidity ^0.8.26" },
              { label: "Framework", value: "Hardhat 2.28" },
              { label: "Libraries", value: "OpenZeppelin v5.6.1" },
              { label: "Standards", value: "ERC-20, ERC-721, EIP-2612" },
              { label: "Tests", value: "228+ (Chai + Hardhat)" },
            ]}
          />
          <StackCard
            title="Backend"
            items={[
              { label: "Runtime", value: "Node.js 18 (Lambda)" },
              { label: "Blockchain", value: "ethers.js v6" },
              { label: "Database", value: "DynamoDB (pay-per-request)" },
              { label: "API", value: "API Gateway (REST + HTTP)" },
              { label: "IoT", value: "AWS IoT Core (MQTT)" },
            ]}
          />
          <StackCard
            title="Frontend"
            items={[
              { label: "Framework", value: "React 18" },
              { label: "Routing", value: "React Router v6" },
              { label: "Web3", value: "ethers.js v6 + MetaMask" },
              { label: "Hosting", value: "S3 + CloudFront" },
              { label: "Design", value: "CSS custom properties" },
            ]}
          />
          <StackCard
            title="Infrastructure"
            items={[
              { label: "IaC", value: "CloudFormation + SAM" },
              { label: "CI/CD", value: "GitHub Actions" },
              { label: "Monitoring", value: "CloudWatch + SNS" },
              { label: "Secrets", value: "SSM + Secrets Manager" },
              { label: "Cost", value: "$0/month (Free Tier)" },
            ]}
          />
        </div>
      </section>

      {/* Security Philosophy */}
      <section style={sectionStyle}>
        <h2 style={headingStyle}>Security Philosophy</h2>
        <div className="card" style={{ maxWidth: "900px", margin: "0 auto" }}>
          <p style={bodyStyle}>
            NextGen Economy treats smart contract security as a first-class
            architectural concern — not an afterthought. Our approach is built
            on five principles:
          </p>
          <div style={principleGridStyle}>
            <PrincipleCard
              number="1"
              title="Defense in Depth"
              body="Four independent security modules (heartbeat, rate limit, multi-sig, anomaly detection) that stack without conflicts. Compromising one layer doesn't defeat the others."
            />
            <PrincipleCard
              number="2"
              title="Battle-Tested Primitives"
              body="100% built on OpenZeppelin v5 — the most audited smart contract library in the ecosystem. We don't write custom cryptography or access control. We compose proven building blocks."
            />
            <PrincipleCard
              number="3"
              title="Pull Over Push"
              body="Users withdraw their own funds (pull pattern). A single failing recipient can never block disbursements to others. This eliminates a major class of denial-of-service vulnerabilities."
            />
            <PrincipleCard
              number="4"
              title="Assume Compromise"
              body="Every security module is designed for the scenario where the admin key is already compromised. Rate limiters cap losses. Break Glass enables recovery. Dead Man Switch auto-pauses. The system protects itself."
            />
            <PrincipleCard
              number="5"
              title="Transparency by Default"
              body="All contracts are public and verifiable on Etherscan. All governance actions happen on-chain. All monitoring data is accessible via REST API. Trust is earned through transparency, not obscurity."
            />
          </div>
        </div>
      </section>

      {/* Project Stats */}
      <section style={sectionStyle}>
        <h2 style={headingStyle}>By the Numbers</h2>
        <div style={statsGridStyle}>
          <StatBlock value="5" label="Projects" sub="Sentinel, Monitor, IoT, Token, Frontend" />
          <StatBlock value="228+" label="Automated Tests" sub="Unit + integration, 100% offline capable" />
          <StatBlock value="8" label="Smart Contracts" sub="4 security modules + token + device registry" />
          <StatBlock value="10" label="Lambda Functions" sub="Event polling, monitoring, APIs, IoT bridge" />
          <StatBlock value="3" label="CloudFormation Stacks" sub="Monitor, IoT bridge, frontend hosting" />
          <StatBlock value="$0" label="Monthly Cost" sub="Full platform on AWS Free Tier" />
        </div>
      </section>

      {/* Roadmap */}
      <section style={sectionStyle}>
        <h2 style={headingStyle}>Roadmap</h2>
        <div className="card" style={{ maxWidth: "900px", margin: "0 auto" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
            <RoadmapItem
              phase="Delivered"
              status="completed"
              items={[
                "Sentinel security modules (4 composable contracts)",
                "AWS serverless monitoring backend",
                "IoT device registry + data anchoring",
                "NGE platform token (ERC-20 with governance)",
                "React frontend with wallet integration",
                "CI/CD pipeline (GitHub Actions)",
                "Deploy scripts + SSM wiring",
              ]}
            />
            <RoadmapItem
              phase="Next"
              status="active"
              items={[
                "Governor contract deployment (on-chain proposal voting)",
                "Testnet deployment (Sepolia) with public demo",
                "Token staking and validator rewards",
                "L2 deployment (Base/Arbitrum) for lower gas costs",
              ]}
            />
            <RoadmapItem
              phase="Future"
              status="planned"
              items={[
                "Mainnet launch with professional security audit",
                "Cross-chain bridge for multi-network deployment",
                "Mobile app (React Native) with WalletConnect",
                "Enterprise SDK for custom integrations",
                "Decentralized storage integration (IPFS/Arweave)",
              ]}
            />
          </div>
        </div>
      </section>

      {/* Cloud Creations */}
      <section style={{ ...sectionStyle, textAlign: "center" }}>
        <h2 style={headingStyle}>Built by Cloud Creations LLC</h2>
        <p style={{ ...bodyStyle, maxWidth: "640px", margin: "0 auto 32px", textAlign: "center" }}>
          Cloud Creations LLC builds Web3 infrastructure for real-world
          applications. We believe blockchain technology should solve tangible
          problems — securing assets, verifying data, and empowering communities —
          not just create speculative tokens.
        </p>
        <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap" }}>
          <Link to="/use-cases">
            <button className="btn-primary" style={{ fontSize: "15px", padding: "12px 24px" }}>
              Explore Use Cases
            </button>
          </Link>
          <Link to="/dashboard">
            <button className="btn-outline" style={{ fontSize: "15px", padding: "12px 24px" }}>
              Launch App
            </button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer style={footerStyle}>
        <p>&copy; {new Date().getFullYear()} Cloud Creations LLC. All rights reserved.</p>
      </footer>
    </div>
  );
}

/* ─── Sub-components ────────────────────── */

function StackCard({ title, items }) {
  return (
    <div className="card" style={{ padding: "24px" }}>
      <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px", color: "var(--accent)" }}>
        {title}
      </h3>
      {items.map(({ label, value }) => (
        <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
          <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>{label}</span>
          <span style={{ fontSize: "13px", fontWeight: 500 }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

function PrincipleCard({ number, title, body }) {
  return (
    <div style={{ display: "flex", gap: "16px", padding: "16px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ fontSize: "28px", fontWeight: 800, color: "var(--accent)", flexShrink: 0, width: "36px" }}>
        {number}
      </div>
      <div>
        <h4 style={{ fontSize: "15px", fontWeight: 600, marginBottom: "4px" }}>{title}</h4>
        <p style={{ color: "var(--text-muted)", fontSize: "13px", lineHeight: 1.6 }}>{body}</p>
      </div>
    </div>
  );
}

function StatBlock({ value, label, sub }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: "36px", fontWeight: 800, color: "var(--accent)" }}>{value}</div>
      <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>{label}</div>
      <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{sub}</div>
    </div>
  );
}

function RoadmapItem({ phase, status, items }) {
  const dotColor = status === "completed" ? "var(--success)" : status === "active" ? "var(--accent)" : "var(--text-muted)";
  const lineOpacity = status === "planned" ? 0.3 : 0.6;

  return (
    <div style={{ display: "flex", gap: "20px", paddingBottom: "24px" }}>
      {/* Timeline dot + line */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
        <div style={{ width: "14px", height: "14px", borderRadius: "50%", background: dotColor, border: status === "active" ? "3px solid var(--bg)" : "none", boxShadow: status === "active" ? `0 0 0 2px ${dotColor}` : "none" }} />
        <div style={{ width: "2px", flex: 1, background: dotColor, opacity: lineOpacity }} />
      </div>
      {/* Content */}
      <div style={{ paddingBottom: "8px" }}>
        <h4 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "8px", color: dotColor }}>
          {phase}
        </h4>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {items.map((item, i) => (
            <li key={i} style={{ color: "var(--text-muted)", fontSize: "13px", lineHeight: 1.8, paddingLeft: "16px", position: "relative" }}>
              <span style={{ position: "absolute", left: 0 }}>
                {status === "completed" ? "\u2713" : status === "active" ? "\u25CB" : "\u25CB"}
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ─── Styles ────────────────────────────── */

const sectionStyle = {
  padding: "48px 0",
};

const headingStyle = {
  fontSize: "24px",
  fontWeight: 700,
  textAlign: "center",
  marginBottom: "28px",
};

const bodyStyle = {
  color: "var(--text-muted)",
  fontSize: "15px",
  lineHeight: 1.8,
  marginBottom: "16px",
};

const diagramStyle = {
  fontFamily: '"SF Mono", "Fira Code", "Courier New", monospace',
  fontSize: "12px",
  lineHeight: 1.6,
  color: "var(--text-muted)",
  whiteSpace: "pre",
  margin: 0,
};

const stackGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: "20px",
};

const principleGridStyle = {
  marginTop: "16px",
};

const statsGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "24px",
};

const footerStyle = {
  borderTop: "1px solid var(--border)",
  padding: "32px 0",
  textAlign: "center",
  color: "var(--text-muted)",
  fontSize: "14px",
};
