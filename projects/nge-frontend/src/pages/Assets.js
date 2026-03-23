import React, { useState, useCallback } from "react";
import { ethers } from "ethers";

/**
 * Assets — Interactive demo of the Asset Tokenization system.
 *
 * Scenario: A military supply depot managing controlled items (ammunition,
 * equipment, narcotics). Demonstrates the full lifecycle:
 *   1. Register assets with classification and metadata
 *   2. Link QR codes / serial numbers to on-chain tokens
 *   3. Issue and return controlled items with chain-of-custody
 *   4. Record depreciation and accounting entries
 *   5. Run physical count inspections
 *   6. Scan identifiers to resolve asset details
 *
 * When contracts are deployed, swap demo logic for real contract calls
 * using the asset API endpoints.
 */

// ─── Demo helpers ──────────────────────────────────────

function randomHash() {
  return ethers.hexlify(ethers.randomBytes(32));
}

function shortHash(h) {
  return h ? `${h.slice(0, 10)}...${h.slice(-6)}` : "";
}

function shortAddr(a) {
  return a ? `${a.slice(0, 8)}...${a.slice(-4)}` : "";
}

const ASSET_CLASSES = ["Unique Equipment", "Fungible Inventory", "Intellectual Property", "Financial Instrument"];
const ASSET_STATUSES = ["Active", "Inactive", "In Transit", "Under Review", "Disposed"];
const ID_TYPES = ["QR Code", "UPN", "Serial Number", "Barcode", "Custom"];
const ENTRY_TYPES = ["Acquisition", "Depreciation", "Revaluation", "Impairment", "Disposal", "Transfer"];

const DEMO_DEPARTMENTS = ["Armory", "Motor Pool", "Medical Supply", "Communications", "Quartermaster"];
const DEMO_LOCATIONS = ["Building 42", "Warehouse Alpha", "Secure Vault B", "Field Storage 7", "HQ Annex"];

// ─── Section Component ─────────────────────────────────

function DemoSection({ number, title, subtitle, description, children, status }) {
  const [expanded, setExpanded] = useState(number <= 2);
  const statusColors = { ready: "var(--accent)", complete: "var(--success)", active: "var(--warning)" };

  return (
    <div className="card" style={{ marginBottom: "16px", borderColor: statusColors[status] || "var(--border)" }}>
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{
            width: "36px", height: "36px", borderRadius: "50%",
            background: status === "complete" ? "rgba(34,197,94,0.15)" : "rgba(59,130,246,0.15)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "14px", fontWeight: 700,
            color: status === "complete" ? "var(--success)" : "var(--accent)",
          }}>
            {status === "complete" ? "\u2713" : number}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: "15px" }}>{title}</div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{subtitle}</div>
          </div>
        </div>
        <span style={{ fontSize: "18px", color: "var(--text-muted)" }}>{expanded ? "\u25B2" : "\u25BC"}</span>
      </div>
      {expanded && (
        <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--border)" }}>
          <p style={{ color: "var(--text-muted)", fontSize: "13px", lineHeight: 1.7, marginBottom: "16px" }}>
            {description}
          </p>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Result Row ────────────────────────────────────────

function ResultRow({ label, value, mono }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontSize: "13px", fontWeight: 500, fontFamily: mono ? "monospace" : "inherit" }}>{value}</span>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────

export default function Assets({ wallet }) {
  // Demo state
  const [assets, setAssets] = useState([]);
  const [identifiers, setIdentifiers] = useState([]);
  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [issuances, setIssuances] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [resolveResult, setResolveResult] = useState(null);

  // ─── 1. Register Asset ────────────────────────────────

  const handleRegister = useCallback(() => {
    const dept = DEMO_DEPARTMENTS[Math.floor(Math.random() * DEMO_DEPARTMENTS.length)];
    const loc = DEMO_LOCATIONS[Math.floor(Math.random() * DEMO_LOCATIONS.length)];
    const isUnique = Math.random() > 0.5;
    const cost = isUnique ? (50000 + Math.floor(Math.random() * 200000)) : (100 + Math.floor(Math.random() * 5000));
    const amount = isUnique ? 1 : (100 + Math.floor(Math.random() * 10000));
    const asset = {
      tokenId: assets.length,
      assetClass: isUnique ? 0 : 1,
      status: 0,
      amount,
      acquisitionCost: cost,
      usefulLifeMonths: isUnique ? 60 : 0,
      department: dept,
      location: loc,
      owner: wallet?.account || ethers.hexlify(ethers.randomBytes(20)),
      bookValue: cost,
      accumulatedDepreciation: 0,
      depreciationPeriods: 0,
      totalSupply: amount,
    };
    setAssets((prev) => [...prev, asset]);

    // Auto-record acquisition
    setLedgerEntries((prev) => [...prev, {
      entryId: prev.length,
      tokenId: asset.tokenId,
      entryType: 0,
      debitAmount: cost,
      creditAmount: 0,
      memo: "Asset acquired",
      timestamp: Date.now(),
    }]);
  }, [assets, wallet]);

  // ─── 2. Link Identifier ───────────────────────────────

  const handleLink = useCallback(() => {
    if (assets.length === 0) return;
    const tokenId = assets.length - 1;
    const idType = Math.floor(Math.random() * 4); // QR, UPN, Serial, Barcode
    const rawId = idType === 0
      ? `QR:ASSET-${String(tokenId).padStart(3, "0")}-${assets[tokenId].department.toUpperCase().replace(/\s/g, "")}`
      : idType === 1
        ? `UPN:${String(100000000000 + Math.floor(Math.random() * 899999999999))}`
        : idType === 2
          ? `SN:${["XYZ", "MIL", "GOV"][Math.floor(Math.random() * 3)]}-2026-${String(Math.floor(Math.random() * 99999)).padStart(5, "0")}`
          : `BC:${String(Math.floor(Math.random() * 9999999999999)).padStart(13, "0")}`;

    const hash = ethers.keccak256(ethers.toUtf8Bytes(rawId));
    setIdentifiers((prev) => [...prev, {
      hash,
      rawId,
      tokenId,
      idType,
      registeredAt: Date.now(),
    }]);
  }, [assets]);

  // ─── 3. Issue Items ───────────────────────────────────

  const handleIssue = useCallback(() => {
    const fungible = assets.filter((a) => a.assetClass === 1 && a.totalSupply > 0);
    if (fungible.length === 0) return;
    const asset = fungible[fungible.length - 1];
    const amount = Math.min(Math.floor(Math.random() * 500) + 50, asset.totalSupply);
    const recipient = ethers.hexlify(ethers.randomBytes(20));
    const memos = ["Training exercise", "Field deployment", "Range day", "Maintenance rotation", "Emergency resupply"];

    setIssuances((prev) => [...prev, {
      tokenId: asset.tokenId,
      from: shortAddr(asset.owner),
      to: shortAddr(recipient),
      amount,
      memo: memos[Math.floor(Math.random() * memos.length)],
      timestamp: Date.now(),
    }]);

    // Update supply
    setAssets((prev) => prev.map((a) =>
      a.tokenId === asset.tokenId ? { ...a, totalSupply: a.totalSupply - amount } : a
    ));
  }, [assets]);

  // ─── 4. Depreciate ────────────────────────────────────

  const handleDepreciate = useCallback(() => {
    const depreciable = assets.filter((a) => a.usefulLifeMonths > 0 && a.bookValue > 0 && a.depreciationPeriods < a.usefulLifeMonths);
    if (depreciable.length === 0) return;
    const asset = depreciable[depreciable.length - 1];
    const monthly = Math.floor(asset.acquisitionCost / asset.usefulLifeMonths);
    const isLast = asset.depreciationPeriods + 1 === asset.usefulLifeMonths;
    const amount = isLast ? asset.bookValue : Math.min(monthly, asset.bookValue);

    setAssets((prev) => prev.map((a) =>
      a.tokenId === asset.tokenId ? {
        ...a,
        bookValue: a.bookValue - amount,
        accumulatedDepreciation: a.accumulatedDepreciation + amount,
        depreciationPeriods: a.depreciationPeriods + 1,
      } : a
    ));

    setLedgerEntries((prev) => [...prev, {
      entryId: prev.length,
      tokenId: asset.tokenId,
      entryType: 1,
      debitAmount: 0,
      creditAmount: amount,
      memo: `Month ${asset.depreciationPeriods + 1} depreciation`,
      timestamp: Date.now(),
    }]);
  }, [assets]);

  // ─── 5. Inspect ───────────────────────────────────────

  const handleInspect = useCallback(() => {
    if (assets.length === 0) return;
    const asset = assets[Math.floor(Math.random() * assets.length)];
    const hasDiscrepancy = Math.random() > 0.7;
    const physicalCount = hasDiscrepancy
      ? asset.totalSupply - Math.floor(Math.random() * 10) - 1
      : asset.totalSupply;

    setInspections((prev) => [...prev, {
      tokenId: asset.tokenId,
      department: asset.department,
      physicalCount,
      onChainBalance: asset.totalSupply,
      discrepancy: physicalCount !== asset.totalSupply,
      timestamp: Date.now(),
    }]);
  }, [assets]);

  // ─── 6. Resolve Identifier ────────────────────────────

  const handleResolve = useCallback(() => {
    if (identifiers.length === 0) {
      setResolveResult(null);
      return;
    }
    const id = identifiers[Math.floor(Math.random() * identifiers.length)];
    const asset = assets[id.tokenId];
    setResolveResult({ identifier: id, asset });
  }, [identifiers, assets]);

  // ─── Render ───────────────────────────────────────────

  return (
    <div>
      {/* Hero */}
      <section style={{ textAlign: "center", padding: "48px 0 32px" }}>
        <p style={{ fontSize: "13px", color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, marginBottom: "12px" }}>
          Asset Tokenization Demo
        </p>
        <h1 style={{ fontSize: "clamp(28px, 4vw, 42px)", fontWeight: 800, lineHeight: 1.15, marginBottom: "16px",
          background: "linear-gradient(135deg, var(--text) 0%, var(--accent) 100%)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          Corporate Asset Management<br />on the Blockchain
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "16px", maxWidth: "640px", margin: "0 auto 16px", lineHeight: 1.7 }}>
          Tokenize every corporate asset — from ammunition lots to office equipment.
          Link physical items via QR codes, automate depreciation, and maintain an
          immutable chain of custody.
        </p>
        <div style={{ display: "flex", gap: "24px", justifyContent: "center", flexWrap: "wrap", marginTop: "24px" }}>
          <div style={statBoxStyle}><div style={statNumberStyle}>{assets.length}</div><div style={statLabelStyle}>Assets</div></div>
          <div style={statBoxStyle}><div style={statNumberStyle}>{identifiers.length}</div><div style={statLabelStyle}>Identifiers</div></div>
          <div style={statBoxStyle}><div style={statNumberStyle}>{ledgerEntries.length}</div><div style={statLabelStyle}>Ledger Entries</div></div>
          <div style={statBoxStyle}><div style={statNumberStyle}>{inspections.length}</div><div style={statLabelStyle}>Inspections</div></div>
        </div>
      </section>

      {/* Demo Sections */}
      <DemoSection
        number={1} title="Register Corporate Asset" subtitle="AssetRegistry (ERC-1155)"
        status={assets.length > 0 ? "complete" : "ready"}
        description="Each asset is tokenized as an ERC-1155 token. Unique equipment (vehicles, machinery) gets supply=1. Fungible inventory (ammunition, supplies) gets supply=N. Full metadata is stored on-chain: classification, cost, department, location, and depreciation schedule."
      >
        <button className="btn-primary" onClick={handleRegister} style={btnStyle}>Register New Asset</button>
        {assets.length > 0 && (
          <div style={{ marginTop: "12px" }}>
            {assets.slice(-3).reverse().map((a) => (
              <div key={a.tokenId} className="card" style={{ padding: "12px", marginBottom: "8px", background: "var(--bg)" }}>
                <ResultRow label="Token ID" value={`#${a.tokenId}`} />
                <ResultRow label="Class" value={ASSET_CLASSES[a.assetClass]} />
                <ResultRow label="Department" value={a.department} />
                <ResultRow label="Location" value={a.location} />
                <ResultRow label="Supply" value={a.totalSupply.toLocaleString()} />
                <ResultRow label="Acquisition Cost" value={`$${a.acquisitionCost.toLocaleString()}`} />
                <ResultRow label="Book Value" value={`$${a.bookValue.toLocaleString()}`} />
                <ResultRow label="Status" value={ASSET_STATUSES[a.status]} />
              </div>
            ))}
          </div>
        )}
      </DemoSection>

      <DemoSection
        number={2} title="Link QR Code / Identifier" subtitle="IdentifierResolver"
        status={identifiers.length > 0 ? "complete" : "ready"}
        description="Physical assets are linked to the blockchain via QR codes, UPNs (Universal Product Numbers), serial numbers, or barcodes. Identifiers are stored as keccak256 hashes for constant gas cost. Multiple identifiers can point to the same asset."
      >
        <button className="btn-primary" onClick={handleLink} style={btnStyle} disabled={assets.length === 0}>
          Link Identifier to Last Asset
        </button>
        {identifiers.length > 0 && (
          <div style={{ marginTop: "12px" }}>
            {identifiers.slice(-3).reverse().map((id, i) => (
              <div key={i} className="card" style={{ padding: "12px", marginBottom: "8px", background: "var(--bg)" }}>
                <ResultRow label="Type" value={ID_TYPES[id.idType]} />
                <ResultRow label="Raw ID" value={id.rawId} mono />
                <ResultRow label="Hash" value={shortHash(id.hash)} mono />
                <ResultRow label="Token ID" value={`#${id.tokenId}`} />
              </div>
            ))}
          </div>
        )}
      </DemoSection>

      <DemoSection
        number={3} title="Issue Controlled Items" subtitle="ControlledAssetManager — Custodian Role"
        status={issuances.length > 0 ? "complete" : "ready"}
        description="Controlled items (ammunition, narcotics, hazmat) are issued from storage to authorized recipients. Each issuance is an ERC-1155 token transfer with an on-chain event recording the chain of custody. Only addresses with the CUSTODIAN role can issue or receive returns."
      >
        <button className="btn-primary" onClick={handleIssue} style={btnStyle}
          disabled={assets.filter((a) => a.assetClass === 1 && a.totalSupply > 0).length === 0}>
          Issue Items to Unit
        </button>
        {issuances.length > 0 && (
          <div style={{ marginTop: "12px" }}>
            {issuances.slice(-3).reverse().map((iss, i) => (
              <div key={i} className="card" style={{ padding: "12px", marginBottom: "8px", background: "var(--bg)" }}>
                <ResultRow label="Asset" value={`#${iss.tokenId}`} />
                <ResultRow label="From" value={iss.from} mono />
                <ResultRow label="To" value={iss.to} mono />
                <ResultRow label="Amount" value={iss.amount.toLocaleString()} />
                <ResultRow label="Memo" value={iss.memo} />
              </div>
            ))}
          </div>
        )}
      </DemoSection>

      <DemoSection
        number={4} title="Record Depreciation" subtitle="AssetLedger — Straight-Line"
        status={ledgerEntries.filter((e) => e.entryType === 1).length > 0 ? "complete" : "ready"}
        description="Unique equipment depreciates monthly using straight-line method: monthly_amount = cost / useful_life_months. Each depreciation event creates an immutable journal entry. The final period absorbs any rounding remainder for exact zero book value."
      >
        <button className="btn-primary" onClick={handleDepreciate} style={btnStyle}
          disabled={assets.filter((a) => a.usefulLifeMonths > 0 && a.bookValue > 0).length === 0}>
          Record Monthly Depreciation
        </button>
        {ledgerEntries.filter((e) => e.entryType === 1).length > 0 && (
          <div style={{ marginTop: "12px" }}>
            {ledgerEntries.filter((e) => e.entryType === 1).slice(-3).reverse().map((e, i) => (
              <div key={i} className="card" style={{ padding: "12px", marginBottom: "8px", background: "var(--bg)" }}>
                <ResultRow label="Asset" value={`#${e.tokenId}`} />
                <ResultRow label="Type" value={ENTRY_TYPES[e.entryType]} />
                <ResultRow label="Credit" value={`$${e.creditAmount.toLocaleString()}`} />
                <ResultRow label="Memo" value={e.memo} />
              </div>
            ))}
          </div>
        )}
      </DemoSection>

      <DemoSection
        number={5} title="Physical Count Inspection" subtitle="ControlledAssetManager — Inspector Role"
        status={inspections.length > 0 ? "complete" : "ready"}
        description="Inspectors verify physical counts against on-chain balances. Discrepancies are immediately flagged with an on-chain event and SNS alert. This replaces the manual paper-based inventory counts that organizations like DFAS struggle with."
      >
        <button className="btn-primary" onClick={handleInspect} style={btnStyle} disabled={assets.length === 0}>
          Run Inspection
        </button>
        {inspections.length > 0 && (
          <div style={{ marginTop: "12px" }}>
            {inspections.slice(-3).reverse().map((ins, i) => (
              <div key={i} className="card" style={{
                padding: "12px", marginBottom: "8px", background: "var(--bg)",
                borderColor: ins.discrepancy ? "var(--error)" : "var(--success)",
              }}>
                <ResultRow label="Asset" value={`#${ins.tokenId} (${ins.department})`} />
                <ResultRow label="Physical Count" value={ins.physicalCount.toLocaleString()} />
                <ResultRow label="On-Chain Balance" value={ins.onChainBalance.toLocaleString()} />
                <ResultRow label="Result" value={ins.discrepancy
                  ? `DISCREPANCY (${ins.onChainBalance - ins.physicalCount} missing)`
                  : "MATCH"
                } />
              </div>
            ))}
          </div>
        )}
      </DemoSection>

      <DemoSection
        number={6} title="Scan & Resolve Identifier" subtitle="IdentifierResolver — QR Lookup"
        status={resolveResult ? "complete" : "ready"}
        description="Scan a QR code or barcode, hash the raw identifier, and call resolve() to get the token ID. Then query the registry for full asset details and the ledger for financial history. This bridges the physical-to-digital gap."
      >
        <button className="btn-primary" onClick={handleResolve} style={btnStyle} disabled={identifiers.length === 0}>
          Simulate QR Scan
        </button>
        {resolveResult && (
          <div style={{ marginTop: "12px" }}>
            <div className="card" style={{ padding: "12px", background: "var(--bg)" }}>
              <ResultRow label="Scanned ID" value={resolveResult.identifier.rawId} mono />
              <ResultRow label="Hash" value={shortHash(resolveResult.identifier.hash)} mono />
              <div style={{ height: "1px", background: "var(--accent)", margin: "8px 0", opacity: 0.3 }} />
              <ResultRow label="Resolved Token" value={`#${resolveResult.asset.tokenId}`} />
              <ResultRow label="Class" value={ASSET_CLASSES[resolveResult.asset.assetClass]} />
              <ResultRow label="Department" value={resolveResult.asset.department} />
              <ResultRow label="Location" value={resolveResult.asset.location} />
              <ResultRow label="Supply" value={resolveResult.asset.totalSupply.toLocaleString()} />
              <ResultRow label="Book Value" value={`$${resolveResult.asset.bookValue.toLocaleString()}`} />
              <ResultRow label="Status" value={ASSET_STATUSES[resolveResult.asset.status]} />
            </div>
          </div>
        )}
      </DemoSection>

      {/* Ledger Summary */}
      {ledgerEntries.length > 0 && (
        <div className="card" style={{ marginTop: "24px", padding: "24px" }}>
          <h3 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "16px" }}>Journal Ledger</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>#</th>
                  <th style={thStyle}>Asset</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Debit</th>
                  <th style={thStyle}>Credit</th>
                  <th style={thStyle}>Memo</th>
                </tr>
              </thead>
              <tbody>
                {ledgerEntries.slice(-10).reverse().map((e) => (
                  <tr key={e.entryId}>
                    <td style={tdStyle}>{e.entryId}</td>
                    <td style={tdStyle}>#{e.tokenId}</td>
                    <td style={tdStyle}>{ENTRY_TYPES[e.entryType]}</td>
                    <td style={tdStyle}>{e.debitAmount > 0 ? `$${e.debitAmount.toLocaleString()}` : "-"}</td>
                    <td style={tdStyle}>{e.creditAmount > 0 ? `$${e.creditAmount.toLocaleString()}` : "-"}</td>
                    <td style={tdStyle}>{e.memo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Styles ──────────────────────────── */

const btnStyle = { fontSize: "14px", padding: "10px 20px" };

const statBoxStyle = {
  textAlign: "center",
  padding: "12px 24px",
  borderRadius: "8px",
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  minWidth: "100px",
};

const statNumberStyle = {
  fontSize: "28px",
  fontWeight: 800,
  color: "var(--accent)",
};

const statLabelStyle = {
  fontSize: "12px",
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "13px",
};

const thStyle = {
  textAlign: "left",
  padding: "8px 12px",
  borderBottom: "2px solid var(--border)",
  color: "var(--text-muted)",
  fontSize: "12px",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const tdStyle = {
  padding: "8px 12px",
  borderBottom: "1px solid var(--border)",
};
