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
