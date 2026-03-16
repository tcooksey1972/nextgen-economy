/**
 * @file complianceReport.js
 * @description Lambda handler for generating compliance audit reports.
 *
 * Generates a downloadable compliance report for a tenant's IoT devices,
 * including data anchor history with blockchain verification proofs.
 * Output format is structured JSON (suitable for PDF rendering on the client
 * or conversion to PDF via a lightweight library).
 *
 * Free Tier notes:
 *   - Lambda: 256 MB, up to 30s. Report generation is infrequent
 *     (a few per day max) — negligible free tier impact.
 *   - DynamoDB: Queries device + anchors tables — covered by free tier.
 *   - No external PDF library to keep Lambda package small. Returns
 *     structured HTML that the browser can print-to-PDF.
 *
 * Requires Cognito auth — tenantId is extracted from JWT claims.
 *
 * Environment Variables:
 *   - DEVICE_TABLE:   nge-iot-devices table
 *   - ANCHORS_TABLE:  nge-iot-anchors table
 *   - ETH_RPC_URL:    Ethereum JSON-RPC endpoint
 *   - CONTRACT_ADDRESS: AnchoredDeviceRegistry contract address
 */
const { DynamoDBClient, QueryCommand, ScanCommand } = require("@aws-sdk/client-dynamodb");
const { ethers } = require("ethers");

const dynamodb = new DynamoDBClient({});

const ANCHOR_ABI = [
  "function isAnchored(bytes32 dataHash) external view returns (bool)",
  "function getAnchor(bytes32 dataHash) external view returns (uint256 deviceId, uint256 timestamp, uint256 blockNumber)",
  "function deviceAnchorCount(uint256 deviceId) external view returns (uint256)",
];

let cachedProvider = null;
function getProvider() {
  if (!cachedProvider) {
    cachedProvider = new ethers.JsonRpcProvider(process.env.ETH_RPC_URL);
  }
  return cachedProvider;
}

/**
 * Lambda handler — generates compliance report HTML.
 *
 * Query params:
 *   - deviceId (optional): Filter to a specific device
 *   - from (optional): Start date ISO string
 *   - to (optional): End date ISO string
 *   - format: "html" (default) or "json"
 *   - verify: "true" to include on-chain verification (slower)
 */
exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const tenantId = event.requestContext?.authorizer?.jwt?.claims?.["custom:tenantId"];

  if (!tenantId) {
    return respond(401, { error: "Authentication required" });
  }

  const { deviceId, from, to, format = "html", verify } = params;

  // Fetch devices for this tenant
  const devices = await getDevices(tenantId, deviceId);
  if (devices.length === 0) {
    return respond(404, { error: "No devices found for this tenant" });
  }

  // Fetch anchors for each device
  const report = {
    tenantId,
    generatedAt: new Date().toISOString(),
    dateRange: { from: from || "all", to: to || "now" },
    devices: [],
    summary: { totalDevices: 0, totalAnchors: 0, verifiedAnchors: 0, failedVerifications: 0 },
  };

  for (const device of devices) {
    const anchors = await getAnchors(device.deviceId, from, to);

    let verifiedCount = 0;
    let failedCount = 0;

    if (verify === "true" && anchors.length > 0) {
      const provider = getProvider();
      const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, ANCHOR_ABI, provider);

      // Verify a sample (up to 10) for performance
      const sample = anchors.slice(0, 10);
      for (const anchor of sample) {
        try {
          const isOnChain = await contract.isAnchored(anchor.dataHash);
          anchor.onChainVerified = isOnChain;
          if (isOnChain) verifiedCount++;
          else failedCount++;
        } catch (err) {
          anchor.onChainVerified = null;
          anchor.verifyError = err.message;
        }
      }
    }

    const deviceReport = {
      deviceId: device.deviceId,
      thingName: device.thingName,
      owner: device.ownerAddress,
      status: device.status,
      registeredAt: device.registeredAt,
      anchorCount: anchors.length,
      anchors: anchors.map((a) => ({
        dataHash: a.dataHash,
        timestamp: a.anchoredAt,
        transactionHash: a.transactionHash,
        blockNumber: a.blockNumber,
        type: a.type,
        onChainVerified: a.onChainVerified,
      })),
    };

    report.devices.push(deviceReport);
    report.summary.totalDevices++;
    report.summary.totalAnchors += anchors.length;
    report.summary.verifiedAnchors += verifiedCount;
    report.summary.failedVerifications += failedCount;
  }

  if (format === "json") {
    return respond(200, report);
  }

  return respond(200, renderHtml(report), "text/html");
};

async function getDevices(tenantId, deviceId) {
  if (deviceId) {
    const result = await dynamodb.send(new QueryCommand({
      TableName: process.env.DEVICE_TABLE,
      IndexName: "deviceId-index",
      KeyConditionExpression: "deviceId = :d",
      FilterExpression: "tenantId = :t",
      ExpressionAttributeValues: {
        ":d": { N: String(deviceId) },
        ":t": { S: tenantId },
      },
    }));
    return (result.Items || []).map(mapDevice);
  }

  // Scan for all devices belonging to this tenant (fine for small datasets)
  const result = await dynamodb.send(new ScanCommand({
    TableName: process.env.DEVICE_TABLE,
    FilterExpression: "tenantId = :t",
    ExpressionAttributeValues: { ":t": { S: tenantId } },
    Limit: 200,
  }));
  return (result.Items || []).map(mapDevice);
}

async function getAnchors(deviceId, from, to) {
  const params = {
    TableName: process.env.ANCHORS_TABLE,
    IndexName: "deviceId-index",
    KeyConditionExpression: "deviceId = :d",
    ExpressionAttributeValues: { ":d": { N: String(deviceId) } },
    Limit: 500,
  };

  // Add date range filter if provided
  if (from || to) {
    const filters = [];
    if (from) {
      filters.push("anchoredAt >= :from");
      params.ExpressionAttributeValues[":from"] = { S: from };
    }
    if (to) {
      filters.push("anchoredAt <= :to");
      params.ExpressionAttributeValues[":to"] = { S: to };
    }
    params.FilterExpression = filters.join(" AND ");
  }

  const result = await dynamodb.send(new QueryCommand(params));
  return (result.Items || []).map(mapAnchor);
}

function mapDevice(item) {
  return {
    deviceId: Number(item.deviceId?.N),
    thingName: item.thingName?.S,
    ownerAddress: item.ownerAddress?.S,
    status: item.status?.S,
    registeredAt: item.registeredAt?.S,
    firmwareHash: item.firmwareHash?.S,
  };
}

function mapAnchor(item) {
  return {
    dataHash: item.dataHash?.S,
    deviceId: Number(item.deviceId?.N),
    thingName: item.thingName?.S,
    transactionHash: item.transactionHash?.S,
    blockNumber: Number(item.blockNumber?.N || 0),
    anchoredAt: item.anchoredAt?.S,
    type: item.type?.S,
  };
}

/**
 * Renders the report as a print-friendly HTML page.
 * Users can open this in a browser and use File > Print > Save as PDF.
 */
function renderHtml(report) {
  const deviceRows = report.devices.map((d) => {
    const anchorRows = d.anchors.slice(0, 50).map((a) => `
      <tr>
        <td class="mono">${a.dataHash.slice(0, 18)}...</td>
        <td>${a.timestamp || "—"}</td>
        <td class="mono">${a.transactionHash ? a.transactionHash.slice(0, 18) + "..." : "—"}</td>
        <td>${a.blockNumber || "—"}</td>
        <td>${a.type || "—"}</td>
        <td>${a.onChainVerified === true ? "PASS" : a.onChainVerified === false ? "FAIL" : "—"}</td>
      </tr>
    `).join("");

    return `
      <div class="device-section">
        <h3>Device #${d.deviceId} — ${d.thingName || "Unknown"}</h3>
        <div class="device-meta">
          <span>Owner: ${d.owner || "—"}</span>
          <span>Status: ${d.status || "—"}</span>
          <span>Registered: ${d.registeredAt || "—"}</span>
          <span>Total Anchors: ${d.anchorCount}</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Data Hash</th>
              <th>Anchored At</th>
              <th>Transaction</th>
              <th>Block</th>
              <th>Type</th>
              <th>On-Chain</th>
            </tr>
          </thead>
          <tbody>${anchorRows || "<tr><td colspan='6'>No anchors in date range</td></tr>"}</tbody>
        </table>
        ${d.anchorCount > 50 ? `<p class="note">Showing first 50 of ${d.anchorCount} anchors</p>` : ""}
      </div>
    `;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Compliance Report — ${report.tenantId}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #1a1a2e; font-size: 13px; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    h2 { font-size: 16px; margin: 24px 0 12px; border-bottom: 2px solid #e0e0e0; padding-bottom: 6px; }
    h3 { font-size: 14px; margin-bottom: 8px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; border-bottom: 3px solid #1a1a2e; padding-bottom: 16px; }
    .header-right { text-align: right; font-size: 12px; color: #666; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
    .summary-card { background: #f5f5f5; border-radius: 6px; padding: 12px; text-align: center; }
    .summary-card .label { font-size: 11px; text-transform: uppercase; color: #666; margin-bottom: 4px; }
    .summary-card .value { font-size: 24px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; font-size: 12px; }
    th, td { padding: 6px 8px; border: 1px solid #ddd; text-align: left; }
    th { background: #f0f0f0; font-weight: 600; font-size: 11px; text-transform: uppercase; }
    .mono { font-family: "SF Mono", "Fira Code", "Consolas", monospace; font-size: 11px; }
    .device-section { margin-bottom: 24px; page-break-inside: avoid; }
    .device-meta { display: flex; gap: 20px; font-size: 12px; color: #555; margin-bottom: 8px; }
    .note { font-size: 11px; color: #888; margin-top: 4px; }
    .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 11px; color: #888; text-align: center; }
    @media print { body { padding: 20px; } .summary-card .value { font-size: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>IoT Compliance Audit Report</h1>
      <p>Blockchain-Verified Data Integrity</p>
    </div>
    <div class="header-right">
      <p>Tenant: ${report.tenantId}</p>
      <p>Generated: ${new Date(report.generatedAt).toLocaleString()}</p>
      <p>Date Range: ${report.dateRange.from} — ${report.dateRange.to}</p>
    </div>
  </div>

  <div class="summary">
    <div class="summary-card">
      <div class="label">Devices</div>
      <div class="value">${report.summary.totalDevices}</div>
    </div>
    <div class="summary-card">
      <div class="label">Data Anchors</div>
      <div class="value">${report.summary.totalAnchors}</div>
    </div>
    <div class="summary-card">
      <div class="label">Verified On-Chain</div>
      <div class="value">${report.summary.verifiedAnchors}</div>
    </div>
    <div class="summary-card">
      <div class="label">Failed Verifications</div>
      <div class="value">${report.summary.failedVerifications}</div>
    </div>
  </div>

  <h2>Device Details</h2>
  ${deviceRows}

  <div class="footer">
    <p>This report was generated by AnchorProof (Cloud Creations LLC). Data integrity is verified against the Ethereum blockchain.</p>
    <p>Contract: ${process.env.CONTRACT_ADDRESS || "—"} | Chain: Sepolia Testnet</p>
  </div>
</body>
</html>`;
}

function respond(statusCode, body, contentType = "application/json") {
  return {
    statusCode,
    headers: {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}
