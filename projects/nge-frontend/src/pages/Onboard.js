import React, { useState } from "react";
import { ethers } from "ethers";
import config, { txUrl } from "../utils/config";
import DEVICE_ABI from "../abi/DeviceRegistry.json";

/**
 * Onboard page — handles both platform sign-in/sign-up (Cognito) and
 * device registration (on-chain via MetaMask).
 *
 * If Cognito is configured and user is not authenticated, shows auth forms.
 * Otherwise shows the device registration wizard.
 */

function AuthSection({ auth }) {
  const [mode, setMode] = useState("signin"); // "signin" | "signup" | "confirm"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  async function handleSignIn(e) {
    e.preventDefault();
    await auth.signIn(email, password);
  }

  async function handleSignUp(e) {
    e.preventDefault();
    await auth.signUp(email, password);
  }

  async function handleConfirm(e) {
    e.preventDefault();
    await auth.confirmSignUp(auth.pendingEmail || email, code);
    if (!auth.error) setMode("signin");
  }

  if (auth.needsConfirmation || mode === "confirm") {
    return (
      <div className="card" style={{ maxWidth: "420px", margin: "0 auto", padding: "32px" }}>
        <h2 style={{ marginBottom: "8px" }}>Confirm Your Email</h2>
        <p style={{ color: "var(--text-muted)", marginBottom: "20px", fontSize: "14px" }}>
          We sent a verification code to <strong>{auth.pendingEmail || email}</strong>
        </p>
        {auth.error && <div className="error-message" style={{ marginBottom: "16px" }}>{auth.error}</div>}
        <form onSubmit={handleConfirm}>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>Verification Code</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" required />
          </div>
          <button className="btn-primary" style={{ width: "100%" }} disabled={auth.loading}>
            {auth.loading ? "Confirming..." : "Confirm Email"}
          </button>
        </form>
        <p style={{ textAlign: "center", marginTop: "16px", fontSize: "13px", color: "var(--text-muted)" }}>
          <button onClick={() => { setMode("signin"); }} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: "13px" }}>
            Back to Sign In
          </button>
        </p>
      </div>
    );
  }

  if (mode === "signup") {
    return (
      <div className="card" style={{ maxWidth: "420px", margin: "0 auto", padding: "32px" }}>
        <h2 style={{ marginBottom: "8px" }}>Create Account</h2>
        <p style={{ color: "var(--text-muted)", marginBottom: "20px", fontSize: "14px" }}>
          Sign up to manage your devices and access tenant-scoped APIs.
        </p>
        {auth.error && <div className="error-message" style={{ marginBottom: "16px" }}>{auth.error}</div>}
        <form onSubmit={handleSignUp}>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required />
          </div>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 chars, uppercase + number" required />
          </div>
          <button className="btn-primary" style={{ width: "100%" }} disabled={auth.loading}>
            {auth.loading ? "Creating..." : "Sign Up"}
          </button>
        </form>
        <p style={{ textAlign: "center", marginTop: "16px", fontSize: "13px", color: "var(--text-muted)" }}>
          Already have an account?{" "}
          <button onClick={() => setMode("signin")} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: "13px" }}>
            Sign In
          </button>
        </p>
      </div>
    );
  }

  // Default: sign in
  return (
    <div className="card" style={{ maxWidth: "420px", margin: "0 auto", padding: "32px" }}>
      <h2 style={{ marginBottom: "8px" }}>Sign In</h2>
      <p style={{ color: "var(--text-muted)", marginBottom: "20px", fontSize: "14px" }}>
        Sign in to access your tenant dashboard and API keys.
      </p>
      {auth.error && <div className="error-message" style={{ marginBottom: "16px" }}>{auth.error}</div>}
      <form onSubmit={handleSignIn}>
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required />
        </div>
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button className="btn-primary" style={{ width: "100%" }} disabled={auth.loading}>
          {auth.loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
      <p style={{ textAlign: "center", marginTop: "16px", fontSize: "13px", color: "var(--text-muted)" }}>
        No account?{" "}
        <button onClick={() => setMode("signup")} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: "13px" }}>
          Create one
        </button>
      </p>
    </div>
  );
}

export default function Onboard({ wallet, auth }) {
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

  // Show auth forms if Cognito is configured and user is not signed in
  if (auth?.enabled && !auth.isAuthenticated) {
    return (
      <div>
        <div className="page-header">
          <h1>Get Started</h1>
          <p>Sign in or create an account to access the platform.</p>
        </div>
        <AuthSection auth={auth} />
      </div>
    );
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
