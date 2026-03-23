/**
 * @file api.js
 * @description Utility for calling the NGE serverless API endpoints.
 *
 * All functions accept an optional auth tokens object to include the
 * Cognito JWT in the Authorization header for tenant-scoped responses.
 */
import config from "./config";

/**
 * Generic fetch wrapper with optional JWT auth.
 */
async function apiFetch(baseUrl, path, params = {}, tokens = null) {
  if (!baseUrl) return null;

  const url = new URL(path, baseUrl);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  });

  const headers = { "Content-Type": "application/json" };
  if (tokens?.idToken) {
    headers.Authorization = `Bearer ${tokens.idToken}`;
  }

  const res = await fetch(url.toString(), { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
}

// ─── Token API ─────────────────────────────────────────

/**
 * Get token info (name, symbol, totalSupply, supplyCap, paused).
 */
export async function getTokenInfo(tokens) {
  return apiFetch(config.api.token, "/token-info", {}, tokens);
}

/**
 * Get balance and voting power for an address.
 */
export async function getBalance(address, tokens, { onchain } = {}) {
  return apiFetch(config.api.token, "/balance", { address, onchain }, tokens);
}

/**
 * Get transfer history for an address.
 */
export async function getTransfers(address, tokens, { limit, lastKey } = {}) {
  return apiFetch(config.api.token, "/transfers", { address, limit, lastKey }, tokens);
}

// ─── Governance API ───────────────────────────────────────

/**
 * Get governance proposals from the indexer.
 */
export async function getProposals(tokens, { limit } = {}) {
  return apiFetch(config.api.token, "/proposals", { limit }, tokens);
}

/**
 * Get votes for a specific proposal.
 */
export async function getVotesForProposal(proposalId, tokens, { limit } = {}) {
  return apiFetch(config.api.token, "/votes", { proposalId, limit }, tokens);
}

// ─── Sentinel API ──────────────────────────────────────

/**
 * Get sentinel monitor health status.
 */
export async function getSentinelHealth(tokens) {
  return apiFetch(config.api.sentinel, "/health", {}, tokens);
}

/**
 * Get sentinel contract status.
 */
export async function getSentinelStatus(tokens) {
  return apiFetch(config.api.sentinel, "/status", {}, tokens);
}

/**
 * Get sentinel events.
 */
export async function getSentinelEvents(tokens, { limit } = {}) {
  return apiFetch(config.api.sentinel, "/events", { limit }, tokens);
}

// ─── Asset Tokenization API ──────────────────────────

/**
 * Get all registered assets.
 */
export async function getAssets(tokens, { limit } = {}) {
  return apiFetch(config.api.assets, "/assets", { limit }, tokens);
}

/**
 * Get single asset detail by token ID.
 */
export async function getAssetDetail(tokenId, tokens) {
  return apiFetch(config.api.assets, `/assets/${tokenId}`, {}, tokens);
}

/**
 * Get recent asset events (optional type filter).
 */
export async function getAssetEvents(tokens, { type, limit } = {}) {
  return apiFetch(config.api.assets, "/events", { type, limit }, tokens);
}

/**
 * Get journal ledger entries for an asset.
 */
export async function getAssetLedger(tokenId, tokens, { limit } = {}) {
  return apiFetch(config.api.assets, `/ledger/${tokenId}`, { limit }, tokens);
}

/**
 * Resolve a QR/UPN/barcode identifier hash to an asset.
 */
export async function resolveIdentifier(identifierHash, tokens) {
  return apiFetch(config.api.assets, `/resolve/${identifierHash}`, {}, tokens);
}

/**
 * Get asset system health status.
 */
export async function getAssetHealth(tokens) {
  return apiFetch(config.api.assets, "/health", {}, tokens);
}

/**
 * Trigger on-demand event sync (indexes new blocks from chain).
 * Only call when you need fresh data — avoids unnecessary polling costs.
 */
export async function syncAssetEvents(tokens) {
  if (!config.api.assets) return null;
  const url = new URL("/sync", config.api.assets);
  const headers = { "Content-Type": "application/json" };
  if (tokens?.idToken) headers.Authorization = `Bearer ${tokens.idToken}`;
  const res = await fetch(url.toString(), { method: "POST", headers });
  if (!res.ok) throw new Error(`Sync failed: ${res.status}`);
  return res.json();
}
