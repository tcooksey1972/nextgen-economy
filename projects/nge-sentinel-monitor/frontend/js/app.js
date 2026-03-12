/**
 * @file app.js
 * @description Dashboard client for the NGE Sentinel Monitor.
 * Fetches data from the API Gateway REST endpoints and renders
 * the vault status, events, and health information.
 *
 * Configuration:
 *   Set API_BASE to your deployed API Gateway URL. During local
 *   development with SAM, use http://localhost:3000.
 */

// ─────────────────────────────────────────────────────────
//  Configuration
// ─────────────────────────────────────────────────────────

/**
 * API Gateway base URL. Replace with your deployed URL.
 * During local dev: "http://localhost:3000"
 * After deploy:     "https://XXXX.execute-api.us-east-1.amazonaws.com/prod"
 */
const API_BASE = window.SENTINEL_API_URL || "http://localhost:3000";

/** Auto-refresh interval in milliseconds (30 seconds). */
const REFRESH_INTERVAL = 30000;

// ─────────────────────────────────────────────────────────
//  Utility Functions
// ─────────────────────────────────────────────────────────

/**
 * Formats a wei string as ETH with 4 decimal places.
 *
 * @param {string} wei - Amount in wei.
 * @returns {string} Formatted ETH string.
 */
function formatEth(wei) {
  if (!wei || wei === "0") return "0 ETH";
  const eth = Number(BigInt(wei)) / 1e18;
  return `${eth.toFixed(4)} ETH`;
}

/**
 * Formats seconds into a human-readable duration.
 *
 * @param {number} seconds - Duration in seconds.
 * @returns {string} e.g., "3d 4h 12m".
 */
function formatDuration(seconds) {
  if (seconds <= 0) return "EXPIRED";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || parts.length === 0) parts.push(`${m}m`);
  return parts.join(" ");
}

/**
 * Formats a unix timestamp as a locale-aware date/time string.
 *
 * @param {number} ts - Unix timestamp in seconds.
 * @returns {string} Formatted date/time.
 */
function formatTime(ts) {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString();
}

/**
 * Truncates an Ethereum address for display.
 *
 * @param {string} addr - Full address.
 * @returns {string} e.g., "0x1234...abcd".
 */
function shortAddr(addr) {
  if (!addr || addr.length < 10) return addr || "—";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/**
 * Sets the text content of an element by ID.
 *
 * @param {string} id - Element ID.
 * @param {string} text - Text to set.
 */
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// ─────────────────────────────────────────────────────────
//  API Client
// ─────────────────────────────────────────────────────────

/**
 * Fetches JSON from the API. Returns null on error.
 *
 * @param {string} path - API path (e.g., "/status").
 * @returns {Promise<Object|null>}
 */
async function fetchApi(path) {
  try {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(`API error (${path}):`, err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────
//  Renderers
// ─────────────────────────────────────────────────────────

/**
 * Updates the health badge in the header.
 *
 * @param {Object} health - Response from GET /health.
 */
function renderHealth(health) {
  const badge = document.getElementById("health-badge");
  if (!health) {
    badge.textContent = "Offline";
    badge.className = "badge stale";
    return;
  }

  const statusMap = {
    HEALTHY: { text: "Healthy", cls: "healthy" },
    WARNING: { text: "Warning", cls: "warning" },
    CRITICAL: { text: "Critical", cls: "critical" },
    STALE: { text: "Stale", cls: "stale" },
    INITIALIZING: { text: "Init", cls: "stale" },
  };

  const info = statusMap[health.status] || { text: health.status, cls: "stale" };
  badge.textContent = info.text;
  badge.className = `badge ${info.cls}`;
}

/**
 * Updates all vault status panels from the /status response.
 *
 * @param {Object} data - Vault state from GET /status → data field.
 */
function renderStatus(data) {
  if (!data) return;

  // Vault overview
  setText("vault-balance", formatEth(data.balance));
  setText("vault-owner", shortAddr(data.owner));
  setText("vault-paused", data.paused ? "Yes" : "No");
  setText("vault-block", data.blockNumber?.toLocaleString() || "—");

  // Dead Man Switch
  const dms = data.deadManSwitch;
  if (dms) {
    const remaining = dms.switchDeadline - Math.floor(Date.now() / 1000);
    setText("dms-remaining", dms.isSwitchActivated ? "ACTIVATED" : formatDuration(Math.max(0, remaining)));
    setText("dms-checkin", formatTime(dms.lastCheckIn));
    setText("dms-deadline", formatTime(dms.switchDeadline));
    setText("dms-activated", dms.isSwitchActivated ? "Yes" : "No");
    setText("dms-recovery", shortAddr(dms.recoveryAddress));

    // Progress bar: shows % of heartbeat interval elapsed
    const total = dms.heartbeatInterval + dms.gracePeriod;
    const elapsed = Math.floor(Date.now() / 1000) - dms.lastCheckIn;
    const pct = Math.min(100, Math.max(0, (elapsed / total) * 100));
    const fill = document.getElementById("dms-progress");
    if (fill) {
      fill.style.width = `${pct}%`;
      fill.className = `progress-fill ${pct > 80 ? "critical" : pct > 50 ? "warning" : ""}`;
    }
  }

  // Rate Limiter
  const rl = data.rateLimiter;
  if (rl) {
    setText("rl-usage", formatEth(rl.currentUsage));
    setText("rl-max", formatEth(rl.maxAmount));
    setText("rl-remaining", formatEth(rl.remaining));
    setText("rl-window", formatDuration(rl.windowDuration));

    const maxBig = BigInt(rl.maxAmount || "1");
    const usedBig = BigInt(rl.currentUsage || "0");
    const pct = maxBig > 0n ? Number((usedBig * 100n) / maxBig) : 0;
    const fill = document.getElementById("rl-progress");
    if (fill) {
      fill.style.width = `${pct}%`;
      fill.className = `progress-fill ${pct > 80 ? "critical" : pct > 50 ? "warning" : ""}`;
    }
  }

  // Break Glass
  const bg = data.breakGlass;
  if (bg) {
    setText("bg-guardians", bg.guardianCount);
    setText("bg-threshold", `${bg.threshold} of ${bg.guardianCount}`);
    setText("bg-delay", formatDuration(bg.executionDelay));
  }

  // Watchdog
  const wd = data.watchdog;
  if (wd) {
    setText("wd-large", formatEth(wd.largeTransferThreshold));
    setText("wd-rapid-count", `${wd.rapidActivityThreshold} transfers`);
    setText("wd-rapid-window", formatDuration(wd.rapidActivityWindow));
  }
}

/**
 * Renders the recent events list.
 *
 * @param {Object[]} events - Array of event objects from GET /events.
 * @param {string} [filter="all"] - Event type filter.
 */
function renderEvents(events, filter = "all") {
  const container = document.getElementById("events-list");
  if (!container) return;

  if (!events || events.length === 0) {
    container.innerHTML = '<p class="muted">No events recorded yet.</p>';
    return;
  }

  const filtered = filter === "all"
    ? events
    : events.filter((e) => e.eventName === filter);

  if (filtered.length === 0) {
    container.innerHTML = `<p class="muted">No ${filter} events found.</p>`;
    return;
  }

  container.innerHTML = filtered
    .map((e) => {
      const severity = getSeverityClass(e);
      const details = formatEventDetails(e);
      return `
        <div class="event-item">
          <div class="event-severity ${severity}"></div>
          <div class="event-content">
            <div class="event-name">${e.eventName}</div>
            <div class="event-details">${details}</div>
          </div>
          <div class="event-time">${formatTime(e.timestamp)}</div>
        </div>
      `;
    })
    .join("");
}

/**
 * Returns the CSS severity class for an event.
 *
 * @param {Object} event - Event object.
 * @returns {string} CSS class name.
 */
function getSeverityClass(event) {
  if (event.eventName === "WatchdogAlerted") {
    const sev = { 0: "info", 1: "warning", 2: "critical" };
    return sev[event.args?.severity] || "default";
  }
  if (event.eventName === "SwitchActivated" || event.eventName === "EmergencyExecuted") {
    return "critical";
  }
  if (event.eventName === "EmergencyProposed") {
    return "warning";
  }
  return "default";
}

/**
 * Formats event arguments into a readable string.
 *
 * @param {Object} event - Event object with args.
 * @returns {string} Human-readable details.
 */
function formatEventDetails(event) {
  const a = event.args || {};
  switch (event.eventName) {
    case "WatchdogAlerted":
      return `${a.reason || "Alert"} — from: ${shortAddr(a.from)} to: ${shortAddr(a.to)} amount: ${formatEth(a.value)}`;
    case "OutflowRecorded":
      return `Amount: ${formatEth(a.amount)} — used: ${formatEth(a.windowUsed)} remaining: ${formatEth(a.windowRemaining)}`;
    case "HeartbeatReceived":
      return `Owner checked in. Next deadline: ${formatTime(Number(a.nextDeadline))}`;
    case "SwitchActivated":
      return `Activated by ${shortAddr(a.activator)}`;
    case "EmergencyProposed":
      return `Proposal #${a.proposalId} by ${shortAddr(a.proposer)} — action: ${a.action}`;
    case "EmergencyApproved":
      return `Proposal #${a.proposalId} approved by ${shortAddr(a.guardian)} (${a.approvalCount} approvals)`;
    case "EmergencyExecuted":
      return `Proposal #${a.proposalId} executed by ${shortAddr(a.executor)}`;
    case "Deposited":
      return `${formatEth(a.amount)} from ${shortAddr(a.sender)}`;
    case "Withdrawn":
      return `${formatEth(a.amount)} to ${shortAddr(a.to)}`;
    default:
      return JSON.stringify(a);
  }
}

// ─────────────────────────────────────────────────────────
//  Data Loading
// ─────────────────────────────────────────────────────────

/** Cached events for filter switching without re-fetching. */
let cachedEvents = [];

/**
 * Fetches all data from the API and updates the dashboard.
 */
async function refreshDashboard() {
  const [healthRes, statusRes, eventsRes] = await Promise.all([
    fetchApi("/health"),
    fetchApi("/status"),
    fetchApi("/events?limit=50"),
  ]);

  renderHealth(healthRes);

  if (statusRes?.data) {
    renderStatus(statusRes.data);
  }

  if (eventsRes?.events) {
    cachedEvents = eventsRes.events;
    const activeFilter = document.querySelector(".filter-btn.active")?.dataset.filter || "all";
    renderEvents(cachedEvents, activeFilter);
  }

  setText("last-update", new Date().toLocaleTimeString());
}

// ─────────────────────────────────────────────────────────
//  Event Handlers
// ─────────────────────────────────────────────────────────

/** Set up event filter buttons. */
function setupFilters() {
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderEvents(cachedEvents, btn.dataset.filter);
    });
  });
}

// ─────────────────────────────────────────────────────────
//  Initialization
// ─────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  setupFilters();
  refreshDashboard();
  setInterval(refreshDashboard, REFRESH_INTERVAL);
});
