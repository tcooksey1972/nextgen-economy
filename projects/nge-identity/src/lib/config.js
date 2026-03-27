/**
 * @file config.js
 * @description Centralized environment variable configuration for nge-identity Lambdas.
 */
module.exports = {
  ETH_RPC_URL: process.env.ETH_RPC_URL || "",
  DID_REGISTRY_ADDRESS: process.env.DID_REGISTRY_ADDRESS || "",
  CREDENTIAL_REGISTRY_ADDRESS: process.env.CREDENTIAL_REGISTRY_ADDRESS || "",
  MARKETPLACE_ADDRESS: process.env.MARKETPLACE_ADDRESS || "",
  SENSOR_ANCHOR_ADDRESS: process.env.SENSOR_ANCHOR_ADDRESS || "",
  SIGNER_PRIVATE_KEY: process.env.SIGNER_PRIVATE_KEY || "",
  IDENTITY_TABLE: process.env.IDENTITY_TABLE || "IdentityData",
  CREDENTIAL_TABLE: process.env.CREDENTIAL_TABLE || "CredentialData",
  MARKETPLACE_TABLE: process.env.MARKETPLACE_TABLE || "MarketplaceData",
  SENSOR_TABLE: process.env.SENSOR_TABLE || "SensorData",
  CREDENTIAL_BUCKET: process.env.CREDENTIAL_BUCKET || "",
  CHAIN_ID: parseInt(process.env.CHAIN_ID || "11155111", 10),
  FHIR_SERVER_URL: process.env.FHIR_SERVER_URL || "",
};
