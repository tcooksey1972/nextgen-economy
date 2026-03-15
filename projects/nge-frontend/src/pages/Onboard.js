import React, { useState } from "react";
import { ethers } from "ethers";
import config, { txUrl } from "../utils/config";
import DEVICE_ABI from "../abi/DeviceRegistry.json";

/**
 * Device Onboarding Wizard — Step-by-step flow for registering new IoT devices.
 *
 * Steps:
 *   1. Enter device details (thing name, firmware hash, metadata URI)
 *   2. Review and confirm
 *   3. Submit transaction
 *   4. Success — show device ID and tx hash
 *
 * This page registers devices directly on-chain via MetaMask. For
 * production use without MetaMask, the AWS IoT bridge handles registration
 * via MQTT topics (Lambda signs the transaction server-side).
 */
export default function Onboard({ wallet }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    thingName: "",
    ownerAddress: "",
    firmwareHash: "",
    metadataUri: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError("");
  }

  function validateStep1() {
    if (!form.thingName.trim()) return "Device name is required";
    if (!form.ownerAddress || !ethers.isAddress(form.ownerAddress))
      return "Valid Ethereum address is required";
    if (!form.firmwareHash || !form.firmwareHash.match(/^0x[0-9a-fA-F]{64}$/))
      return "Firmware hash must be a valid bytes32 hex string";
    if (!form.metadataUri.trim()) return "Metadata URI is required";
    return null;
  }

  function handleNext() {
    const err = validateStep1();
    if (err) {
      setError(err);
      return;
    }
    setStep(2);
  }

  async function handleSubmit() {
    if (!wallet.signer) {
      setError("Wallet not connected");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const registry = new ethers.Contract(
        config.contracts.iot,
        DEVICE_ABI,
        wallet.signer
      );

      const tx = await registry.registerDevice(
        form.ownerAddress,
        form.firmwareHash,
        form.metadataUri
      );

      const receipt = await tx.wait();

      // Extract deviceId from DeviceRegistered event
      const event = receipt.logs
        .map((log) => {
          try {
            return registry.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((e) => e && e.name === "DeviceRegistered");

      setResult({
        deviceId: event ? Number(event.args.deviceId) : null,
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      });
      setStep(4);
    } catch (err) {
      setError(err.reason || err.message || "Transaction failed");
    }
    setSubmitting(false);
  }

  function handleAutoFirmware() {
    // Generate a random firmware hash for demo purposes
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const hash = "0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
    update("firmwareHash", hash);
  }

  if (!wallet.account) {
    return (
      <div className="empty-state">
        <h2>Connect your wallet to onboard devices</h2>
        <p style={{ marginTop: "8px", color: "var(--text-muted)" }}>
          Register new IoT devices on the blockchain.
        </p>
        <button
          className="btn-primary"
          onClick={wallet.connect}
          style={{ marginTop: "24px" }}
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  if (!config.contracts.iot) {
    return (
      <div className="empty-state">
        <h2>Device Registry not configured</h2>
        <p style={{ marginTop: "8px", color: "var(--text-muted)" }}>
          Set REACT_APP_IOT_ADDRESS in your .env file after deploying the
          contract.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Register New Device</h1>
        <p>Step-by-step device onboarding wizard</p>
      </div>

      {/* Progress Steps */}
      <div style={styles.progress}>
        {["Device Details", "Review", "Submitting", "Complete"].map((label, i) => (
          <div key={label} style={styles.stepItem}>
            <div
              style={{
                ...styles.stepCircle,
                background: step > i + 1 ? "var(--success)" : step === i + 1 ? "var(--accent)" : "var(--border)",
              }}
            >
              {step > i + 1 ? "\u2713" : i + 1}
            </div>
            <span style={{ color: step >= i + 1 ? "var(--text)" : "var(--text-muted)", fontSize: "13px" }}>
              {label}
            </span>
          </div>
        ))}
      </div>

      {error && <div className="error-message" style={{ marginBottom: "16px" }}>{error}</div>}

      {/* Step 1: Device Details */}
      {step === 1 && (
        <div className="card" style={{ padding: "24px" }}>
          <div style={styles.field}>
            <label style={styles.label}>Device Name</label>
            <input
              placeholder="e.g., cold-chain-sensor-001"
              value={form.thingName}
              onChange={(e) => update("thingName", e.target.value)}
            />
            <span style={styles.hint}>
              This will be the AWS IoT Thing name. Use lowercase with hyphens.
            </span>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Owner Address</label>
            <input
              placeholder="0x..."
              value={form.ownerAddress}
              onChange={(e) => update("ownerAddress", e.target.value)}
            />
            <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
              <button
                className="btn-outline"
                style={{ fontSize: "12px", padding: "4px 10px" }}
                onClick={() => update("ownerAddress", wallet.account)}
              >
                Use connected wallet
              </button>
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Firmware Hash (bytes32)</label>
            <input
              placeholder="0x..."
              value={form.firmwareHash}
              onChange={(e) => update("firmwareHash", e.target.value)}
              style={{ fontFamily: "var(--mono, monospace)", fontSize: "13px" }}
            />
            <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
              <button
                className="btn-outline"
                style={{ fontSize: "12px", padding: "4px 10px" }}
                onClick={handleAutoFirmware}
              >
                Generate random hash (demo)
              </button>
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Metadata URI</label>
            <input
              placeholder="ipfs://... or https://api.example.com/devices/001.json"
              value={form.metadataUri}
              onChange={(e) => update("metadataUri", e.target.value)}
            />
            <span style={styles.hint}>
              Link to device metadata (specs, calibration data, location).
            </span>
          </div>

          <button className="btn-primary" style={{ width: "100%", marginTop: "16px" }} onClick={handleNext}>
            Review &rarr;
          </button>
        </div>
      )}

      {/* Step 2: Review */}
      {step === 2 && (
        <div className="card" style={{ padding: "24px" }}>
          <h3 style={{ marginBottom: "16px" }}>Review Device Details</h3>
          <div style={styles.reviewGrid}>
            <ReviewRow label="Device Name" value={form.thingName} />
            <ReviewRow label="Owner" value={form.ownerAddress} mono />
            <ReviewRow label="Firmware Hash" value={form.firmwareHash} mono />
            <ReviewRow label="Metadata URI" value={form.metadataUri} />
            <ReviewRow label="Network" value={config.chainName} />
            <ReviewRow label="Contract" value={config.contracts.iot} mono />
          </div>

          <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: "16px 0" }}>
            This will send a transaction to the DeviceRegistry contract. You will need to confirm in MetaMask and pay gas fees.
          </p>

          <div style={{ display: "flex", gap: "12px" }}>
            <button className="btn-outline" style={{ flex: 1 }} onClick={() => setStep(1)}>
              &larr; Back
            </button>
            <button className="btn-primary" style={{ flex: 2 }} onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Submitting..." : "Register Device"}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Submitting (auto-advances to 4 via handleSubmit) */}
      {step === 3 && (
        <div className="card" style={{ padding: "24px", textAlign: "center" }}>
          <div className="loading">Submitting transaction...</div>
          <p style={{ color: "var(--text-muted)", marginTop: "8px" }}>Confirm in MetaMask and wait for confirmation.</p>
        </div>
      )}

      {/* Step 4: Success */}
      {step === 4 && result && (
        <div className="card" style={{ padding: "24px", borderColor: "rgba(34, 197, 94, 0.3)" }}>
          <div style={{ textAlign: "center", marginBottom: "16px" }}>
            <div style={{ fontSize: "48px", marginBottom: "8px" }}>&#x2705;</div>
            <h3 style={{ color: "var(--success)" }}>Device Registered Successfully</h3>
          </div>

          <div style={styles.reviewGrid}>
            <ReviewRow label="Device ID" value={`#${result.deviceId}`} />
            <ReviewRow label="Device Name" value={form.thingName} />
            <ReviewRow label="Transaction" value={result.transactionHash} mono link={txUrl(result.transactionHash)} />
            <ReviewRow label="Block" value={`${result.blockNumber}`} />
          </div>

          <div style={{ display: "flex", gap: "12px", marginTop: "20px" }}>
            <button
              className="btn-outline"
              style={{ flex: 1 }}
              onClick={() => {
                setStep(1);
                setForm({ thingName: "", ownerAddress: "", firmwareHash: "", metadataUri: "" });
                setResult(null);
              }}
            >
              Register Another
            </button>
            <a href="/devices" className="btn-primary" style={{ flex: 1, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", borderRadius: "8px" }}>
              View All Devices
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewRow({ label, value, mono, link }) {
  const val = link ? (
    <a href={link} target="_blank" rel="noopener noreferrer" style={{ wordBreak: "break-all" }}>
      {value}
    </a>
  ) : (
    <span style={{ wordBreak: "break-all" }}>{value}</span>
  );

  return (
    <div style={styles.reviewRow}>
      <span style={styles.reviewLabel}>{label}</span>
      <span style={{ ...styles.reviewValue, ...(mono ? styles.mono : {}) }}>{val}</span>
    </div>
  );
}

const styles = {
  progress: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "24px",
    padding: "16px 0",
  },
  stepItem: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "6px",
    flex: 1,
  },
  stepCircle: {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontWeight: 700,
    fontSize: "14px",
  },
  field: { marginBottom: "20px" },
  label: {
    display: "block",
    fontSize: "13px",
    fontWeight: 600,
    marginBottom: "6px",
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  hint: { fontSize: "12px", color: "var(--text-muted)", marginTop: "4px", display: "block" },
  reviewGrid: { display: "flex", flexDirection: "column", gap: "1px" },
  reviewRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "10px 12px",
    background: "var(--bg, #0a0e17)",
    borderRadius: "4px",
  },
  reviewLabel: { fontWeight: 600, fontSize: "13px", color: "var(--text-muted)" },
  reviewValue: { fontSize: "13px", textAlign: "right", maxWidth: "60%" },
  mono: { fontFamily: '"SF Mono", "Fira Code", "Consolas", monospace', fontSize: "12px" },
};
