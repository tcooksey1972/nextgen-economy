import React, { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import config, { addressUrl, truncateAddress } from "../utils/config";
import DEVICE_ABI from "../abi/DeviceRegistry.json";

const STATUS_LABELS = ["Inactive", "Active", "Suspended"];
const STATUS_CLASSES = ["status-inactive", "status-active", "status-warning"];

/**
 * Devices page — View registered IoT devices from the DeviceRegistry.
 *
 * Reads device count, ownership, status, and firmware from on-chain.
 * Admin operations (register, suspend, reactivate) are done via
 * the AWS IoT bridge or directly by the contract owner.
 */
export default function Devices({ wallet }) {
  const [devices, setDevices] = useState([]);
  const [deviceCount, setDeviceCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [verifyHash, setVerifyHash] = useState("");
  const [verifyResult, setVerifyResult] = useState(null);

  const fetchDevices = useCallback(async () => {
    if (!wallet.provider || !config.contracts.iot) return;

    setLoading(true);
    try {
      const registry = new ethers.Contract(config.contracts.iot, DEVICE_ABI, wallet.provider);
      const count = Number(await registry.deviceCount());
      setDeviceCount(count);

      // Fetch details for up to 50 devices
      const limit = Math.min(count, 50);
      const deviceList = [];
      for (let i = 0; i < limit; i++) {
        const [owner, status, firmware, anchorCount] = await Promise.all([
          registry.ownerOf(i),
          registry.deviceStatus(i),
          registry.firmwareHash(i),
          registry.deviceAnchorCount(i).catch(() => 0n),
        ]);
        deviceList.push({
          id: i,
          owner,
          status: Number(status),
          firmware,
          anchorCount: Number(anchorCount),
        });
      }
      setDevices(deviceList);
    } catch (err) {
      console.error("Failed to fetch devices:", err);
    }
    setLoading(false);
  }, [wallet.provider]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  async function handleVerify(e) {
    e.preventDefault();
    setVerifyResult(null);
    if (!wallet.provider || !config.contracts.iot || !verifyHash) return;

    try {
      const registry = new ethers.Contract(config.contracts.iot, DEVICE_ABI, wallet.provider);
      const isAnchored = await registry.isAnchored(verifyHash);

      if (isAnchored) {
        const [deviceId, timestamp, blockNumber] = await registry.getAnchor(verifyHash);
        setVerifyResult({
          verified: true,
          deviceId: Number(deviceId),
          timestamp: new Date(Number(timestamp) * 1000).toISOString(),
          blockNumber: Number(blockNumber),
        });
      } else {
        setVerifyResult({ verified: false });
      }
    } catch (err) {
      setVerifyResult({ verified: false, error: err.message });
    }
  }

  if (!wallet.account) {
    return (
      <div className="empty-state">
        <h2>Connect your wallet to view IoT devices</h2>
        <p style={{ marginTop: "8px", color: "var(--text-muted)" }}>
          Browse registered devices, verify data anchors, and monitor device status.
        </p>
        <button className="btn-primary" onClick={wallet.connect} style={{ marginTop: "24px" }}>
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
          Set REACT_APP_IOT_ADDRESS in your .env file after deploying the contract.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>IoT Devices</h1>
        <p>
          {deviceCount} registered device{deviceCount !== 1 ? "s" : ""} on {config.chainName}
        </p>
      </div>

      {/* Stats */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Total Devices</div>
          <div className="value">{deviceCount}</div>
        </div>
        <div className="stat-card">
          <div className="label">Active</div>
          <div className="value status-active">
            {devices.filter((d) => d.status === 1).length}
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Inactive</div>
          <div className="value status-inactive">
            {devices.filter((d) => d.status === 0).length}
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Suspended</div>
          <div className="value status-warning">
            {devices.filter((d) => d.status === 2).length}
          </div>
        </div>
      </div>

      {/* Device Table */}
      <div className="section">
        <h2>Registered Devices</h2>
        <div className="card" style={{ padding: 0, overflow: "auto" }}>
          {loading ? (
            <div className="loading">Loading devices...</div>
          ) : devices.length === 0 ? (
            <div className="empty-state">No devices registered yet.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Owner</th>
                  <th>Status</th>
                  <th>Firmware</th>
                  <th>Anchors</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((device) => (
                  <tr key={device.id}>
                    <td className="mono">#{device.id}</td>
                    <td>
                      <a href={addressUrl(device.owner)} target="_blank" rel="noopener noreferrer" className="mono">
                        {truncateAddress(device.owner)}
                      </a>
                    </td>
                    <td>
                      <span className={STATUS_CLASSES[device.status]}>
                        {STATUS_LABELS[device.status]}
                      </span>
                    </td>
                    <td className="mono truncate" title={device.firmware}>
                      {device.firmware.slice(0, 10)}...
                    </td>
                    <td>{device.anchorCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {deviceCount > 50 && (
          <p style={{ marginTop: "8px", color: "var(--text-muted)", fontSize: "13px" }}>
            Showing first 50 of {deviceCount} devices.
          </p>
        )}
      </div>

      {/* Data Verification */}
      <div className="section">
        <h2>Verify Data Anchor</h2>
        <form onSubmit={handleVerify} className="card">
          <div className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label>Data Hash (bytes32)</label>
              <input
                placeholder="0x..."
                value={verifyHash}
                onChange={(e) => setVerifyHash(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn-primary">
              Verify
            </button>
          </div>
        </form>

        {verifyResult && (
          <div
            className="card"
            style={{
              marginTop: "16px",
              borderColor: verifyResult.verified ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)",
            }}
          >
            {verifyResult.verified ? (
              <>
                <p className="status-active" style={{ fontWeight: 600, marginBottom: "8px" }}>
                  Data Verified On-Chain
                </p>
                <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>
                  Device ID: {verifyResult.deviceId} | Block: {verifyResult.blockNumber} | Time: {verifyResult.timestamp}
                </p>
              </>
            ) : (
              <p className="status-inactive" style={{ fontWeight: 600 }}>
                Data Not Found On-Chain
              </p>
            )}
          </div>
        )}
      </div>

      <div style={{ textAlign: "right", marginTop: "16px" }}>
        <button className="btn-outline" onClick={fetchDevices} disabled={loading}>
          Refresh
        </button>
      </div>
    </div>
  );
}
