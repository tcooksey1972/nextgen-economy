import React from "react";
import { Link } from "react-router-dom";

/**
 * Landing — Executive summary and marketing home page.
 *
 * This is the public-facing entry point for visitors who haven't
 * connected a wallet. Presents the platform value proposition,
 * product pillars, and calls to action.
 */
export default function Landing() {
  return (
    <div>
      {/* Hero */}
      <section style={heroStyle}>
        <p style={taglineStyle}>Built by Cloud Creations LLC</p>
        <h1 style={heroHeadingStyle}>
          Blockchain Infrastructure<br />for the Physical World
        </h1>
        <p style={heroSubStyle}>
          NextGen Economy is an open Web3 platform that bridges smart contracts
          with real-world assets — securing digital vaults, authenticating IoT
          devices, and powering community governance with a single token.
        </p>
        <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap" }}>
          <Link to="/use-cases">
            <button className="btn-primary" style={heroBtnStyle}>
              See Use Cases
            </button>
          </Link>
          <Link to="/about">
            <button className="btn-outline" style={heroBtnStyle}>
              How It Works
            </button>
          </Link>
        </div>
      </section>

      {/* Executive Summary */}
      <section style={sectionStyle}>
        <h2 style={sectionHeadingStyle}>Executive Summary</h2>
        <div className="card" style={{ maxWidth: "900px", margin: "0 auto" }}>
          <p style={bodyTextStyle}>
            <strong>NextGen Economy</strong> is a composable Web3 platform that
            solves three interconnected problems enterprises face when adopting
            blockchain technology:
          </p>
          <ol style={orderedListStyle}>
            <li>
              <strong>Smart contract security is hard.</strong> A single
              vulnerability can drain millions. Our Sentinel toolkit provides
              battle-tested safety modules — heartbeat kill switches, rate
              limiters, multi-sig emergency recovery, and anomaly detection —
              that any contract can inherit in one line of code.
            </li>
            <li>
              <strong>IoT data is easy to falsify.</strong> Sensor readings
              stored in centralized databases can be altered without a trace.
              Our Device Registry assigns each IoT device a tamper-proof on-chain
              identity and anchors every data point to the Ethereum blockchain,
              creating an immutable audit trail.
            </li>
            <li>
              <strong>Platform governance is opaque.</strong> Users have no say
              in how systems evolve. The NGE token gives every stakeholder a
              voice — delegate voting power, participate in proposals, and
              shape the platform's direction through transparent, on-chain
              governance.
            </li>
          </ol>
          <p style={bodyTextStyle}>
            All three pillars are production-ready: 228+ automated tests,
            OpenZeppelin v5 security primitives, and AWS serverless backends
            that run on Free Tier. The platform is designed for enterprises,
            municipalities, and IoT operators who need blockchain's guarantees
            without blockchain's complexity.
          </p>
        </div>
      </section>

      {/* Product Pillars */}
      <section style={sectionStyle}>
        <h2 style={sectionHeadingStyle}>Four Products, One Platform</h2>
        <div style={pillarGridStyle}>
          {/* Sentinel */}
          <div className="card" style={pillarCardStyle}>
            <div style={pillarIconStyle}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <h3 style={pillarTitleStyle}>Sentinel</h3>
            <p style={pillarSubtitle}>Smart Contract Security</p>
            <p style={pillarBodyStyle}>
              Four composable security modules that protect any Solidity contract
              from exploits, insider threats, and owner key compromise. Drop-in
              protection with zero code changes to your core business logic.
            </p>
            <ul style={featureListStyle}>
              <li>Dead man's switch (auto-pause on inactivity)</li>
              <li>Rate-limited withdrawals</li>
              <li>Multi-sig emergency recovery</li>
              <li>Real-time anomaly detection</li>
              <li>AWS monitoring dashboard</li>
            </ul>
            <Link to="/use-cases" style={pillarLinkStyle}>
              See security scenarios &rarr;
            </Link>
          </div>

          {/* IoT */}
          <div className="card" style={pillarCardStyle}>
            <div style={pillarIconStyle}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="1.5">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            </div>
            <h3 style={pillarTitleStyle}>IoT Bridge</h3>
            <p style={{ ...pillarSubtitle, color: "var(--success)" }}>Device Identity & Data Integrity</p>
            <p style={pillarBodyStyle}>
              Every IoT device gets an ERC-721 token as its on-chain identity.
              Sensor data is hashed and anchored to Ethereum, creating a
              tamper-proof record that anyone can verify — no middleman required.
            </p>
            <ul style={featureListStyle}>
              <li>ERC-721 device identity (NFT per device)</li>
              <li>Keccak-256 data anchoring</li>
              <li>MQTT-to-blockchain bridge (AWS IoT)</li>
              <li>Firmware hash verification</li>
              <li>Public data verification API</li>
            </ul>
            <Link to="/use-cases" style={{ ...pillarLinkStyle, color: "var(--success)" }}>
              See IoT scenarios &rarr;
            </Link>
          </div>

          {/* Token & Governance */}
          <div className="card" style={pillarCardStyle}>
            <div style={pillarIconStyle}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </div>
            <h3 style={pillarTitleStyle}>NGE Token</h3>
            <p style={{ ...pillarSubtitle, color: "var(--warning)" }}>Governance & Tokenomics</p>
            <p style={pillarBodyStyle}>
              A full-featured ERC-20 token that unifies the platform. Holders
              delegate voting power, participate in governance proposals, and
              earn a stake in the ecosystem — all with gasless approvals and
              transparent on-chain voting.
            </p>
            <ul style={featureListStyle}>
              <li>ERC-20 with EIP-2612 permit (gasless)</li>
              <li>Voting power delegation (ERC20Votes)</li>
              <li>Configurable supply cap</li>
              <li>Burn, pause, and role-based minting</li>
              <li>Governor-ready (OpenZeppelin)</li>
            </ul>
            <Link to="/use-cases" style={{ ...pillarLinkStyle, color: "var(--warning)" }}>
              See governance scenarios &rarr;
            </Link>
          </div>
          {/* Asset Tokenization */}
          <div className="card" style={pillarCardStyle}>
            <div style={pillarIconStyle}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="1.5">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <path d="M8 21h8M12 17v4" />
                <path d="M7 8h2M7 11h4" />
              </svg>
            </div>
            <h3 style={pillarTitleStyle}>Asset Tokenization</h3>
            <p style={{ ...pillarSubtitle, color: "var(--error)" }}>Corporate Asset Management</p>
            <p style={pillarBodyStyle}>
              Tokenize every corporate asset as ERC-1155 tokens — equipment, inventory,
              ammunition, narcotics. Link physical items via QR codes, automate
              depreciation, and maintain immutable chain-of-custody records.
            </p>
            <ul style={featureListStyle}>
              <li>ERC-1155 multi-token registry (unique + fungible)</li>
              <li>On-chain accounting ledger with depreciation</li>
              <li>QR code / UPN / barcode identifier resolution</li>
              <li>Role-based controlled item management</li>
              <li>Physical count inspection with discrepancy alerts</li>
            </ul>
            <Link to="/assets" style={{ ...pillarLinkStyle, color: "var(--error)" }}>
              Try the asset demo &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* Why NGE */}
      <section style={sectionStyle}>
        <h2 style={sectionHeadingStyle}>Why NextGen Economy?</h2>
        <div style={whyGridStyle}>
          <div className="card" style={{ textAlign: "center", padding: "32px 24px" }}>
            <div style={whyNumberStyle}>228+</div>
            <div style={whyLabelStyle}>Automated Tests</div>
            <p style={whyBodyStyle}>
              Every contract is tested exhaustively. Sentinel alone has 135 tests covering
              edge cases, attack vectors, and composability.
            </p>
          </div>
          <div className="card" style={{ textAlign: "center", padding: "32px 24px" }}>
            <div style={whyNumberStyle}>$0</div>
            <div style={whyLabelStyle}>Monthly Cloud Cost</div>
            <p style={whyBodyStyle}>
              The entire serverless backend — Lambda, DynamoDB, API Gateway, S3 —
              runs within AWS Free Tier for development and low-traffic production.
            </p>
          </div>
          <div className="card" style={{ textAlign: "center", padding: "32px 24px" }}>
            <div style={whyNumberStyle}>100%</div>
            <div style={whyLabelStyle}>OpenZeppelin</div>
            <p style={whyBodyStyle}>
              Built entirely on battle-tested, audited OpenZeppelin v5 primitives.
              No custom cryptography. No reinvented wheels.
            </p>
          </div>
          <div className="card" style={{ textAlign: "center", padding: "32px 24px" }}>
            <div style={whyNumberStyle}>4</div>
            <div style={whyLabelStyle}>Security Layers</div>
            <p style={whyBodyStyle}>
              Heartbeat monitoring, rate limiting, multi-sig recovery, and anomaly
              detection — composable and stack-safe.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ ...sectionStyle, textAlign: "center", paddingBottom: "64px" }}>
        <h2 style={{ ...sectionHeadingStyle, marginBottom: "16px" }}>Ready to build on NGE?</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "16px", marginBottom: "32px", maxWidth: "600px", margin: "0 auto 32px" }}>
          Explore real-world scenarios, connect your wallet to try the live platform,
          or dive into the architecture.
        </p>
        <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap" }}>
          <Link to="/use-cases">
            <button className="btn-primary" style={{ fontSize: "16px", padding: "14px 28px" }}>
              Explore Use Cases
            </button>
          </Link>
          <Link to="/dashboard">
            <button className="btn-outline" style={{ fontSize: "16px", padding: "14px 28px" }}>
              Launch App
            </button>
          </Link>
          <Link to="/about">
            <button className="btn-outline" style={{ fontSize: "16px", padding: "14px 28px" }}>
              Platform Architecture
            </button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer style={footerStyle}>
        <p>&copy; {new Date().getFullYear()} Cloud Creations LLC. All rights reserved.</p>
        <p style={{ fontSize: "13px", marginTop: "4px" }}>
          NextGen Economy — Blockchain infrastructure for the physical world.
        </p>
      </footer>
    </div>
  );
}

/* ─── Styles ────────────────────────────── */

const heroStyle = {
  textAlign: "center",
  padding: "80px 24px 64px",
};

const taglineStyle = {
  fontSize: "13px",
  color: "var(--accent)",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  marginBottom: "16px",
  fontWeight: 600,
};

const heroHeadingStyle = {
  fontSize: "clamp(32px, 5vw, 52px)",
  fontWeight: 800,
  lineHeight: 1.15,
  marginBottom: "24px",
  background: "linear-gradient(135deg, var(--text) 0%, var(--accent) 100%)",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
};

const heroSubStyle = {
  fontSize: "18px",
  color: "var(--text-muted)",
  maxWidth: "680px",
  margin: "0 auto 40px",
  lineHeight: 1.7,
};

const heroBtnStyle = {
  fontSize: "16px",
  padding: "14px 32px",
};

const sectionStyle = {
  padding: "48px 0",
};

const sectionHeadingStyle = {
  fontSize: "28px",
  fontWeight: 700,
  textAlign: "center",
  marginBottom: "32px",
};

const bodyTextStyle = {
  color: "var(--text-muted)",
  fontSize: "15px",
  lineHeight: 1.8,
  marginBottom: "16px",
};

const orderedListStyle = {
  color: "var(--text-muted)",
  fontSize: "15px",
  lineHeight: 1.8,
  paddingLeft: "20px",
  marginBottom: "16px",
};

const pillarGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
  gap: "24px",
};

const pillarCardStyle = {
  padding: "32px",
  display: "flex",
  flexDirection: "column",
};

const pillarIconStyle = {
  marginBottom: "16px",
};

const pillarTitleStyle = {
  fontSize: "22px",
  fontWeight: 700,
  marginBottom: "4px",
};

const pillarSubtitle = {
  fontSize: "13px",
  color: "var(--accent)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: "16px",
  fontWeight: 600,
};

const pillarBodyStyle = {
  color: "var(--text-muted)",
  fontSize: "14px",
  lineHeight: 1.7,
  marginBottom: "16px",
};

const featureListStyle = {
  listStyle: "none",
  padding: 0,
  marginBottom: "20px",
  flex: 1,
  color: "var(--text-muted)",
  fontSize: "13px",
  lineHeight: 2,
};

const pillarLinkStyle = {
  fontSize: "14px",
  fontWeight: 600,
  color: "var(--accent)",
};

const whyGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "20px",
};

const whyNumberStyle = {
  fontSize: "40px",
  fontWeight: 800,
  color: "var(--accent)",
  marginBottom: "4px",
};

const whyLabelStyle = {
  fontSize: "14px",
  fontWeight: 600,
  marginBottom: "12px",
};

const whyBodyStyle = {
  color: "var(--text-muted)",
  fontSize: "13px",
  lineHeight: 1.6,
};

const footerStyle = {
  borderTop: "1px solid var(--border)",
  padding: "32px 0",
  textAlign: "center",
  color: "var(--text-muted)",
  fontSize: "14px",
};
