/**
 * @file contract.js
 * @description Ethers.js contract setup for nge-identity Lambdas.
 * Provides cached provider/signer and contract instances.
 */
const { ethers } = require("ethers");
const config = require("./config");

// ABIs — minimal interfaces for Lambda interaction
const DID_REGISTRY_ABI = [
  "function createDID(bytes32 didHash, string documentURI) external returns (bytes32)",
  "function updateDocument(bytes32 didHash, string newDocumentURI) external",
  "function deactivate(bytes32 didHash) external",
  "function bindBiometric(bytes32 didHash, bytes32 biometricCommitment) external",
  "function resolve(bytes32 didHash) external view returns (tuple(address controller, string documentURI, uint256 created, uint256 updated, bool active))",
  "function isActive(bytes32 didHash) external view returns (bool)",
  "function controllerOf(bytes32 didHash) external view returns (address)",
  "function didCount() external view returns (uint256)",
  "event DIDCreated(bytes32 indexed didHash, address indexed controller, string documentURI)",
  "event DIDDeactivated(bytes32 indexed didHash)",
  "event BiometricBound(bytes32 indexed didHash, bytes32 biometricCommitment)",
];

const CREDENTIAL_REGISTRY_ABI = [
  "function issueCredential(bytes32 credentialId, bytes32 issuerDID, bytes32 holderDID, bytes32 credentialHash, uint8 cType, uint256 expiresAt, string metadataURI) external",
  "function revokeCredential(bytes32 credentialId, bytes32 issuerDID) external",
  "function verifyCredential(bytes32 credentialId) external view returns (tuple(bool valid, bool expired, bool revoked, bool trustedIssuer))",
  "function getHolderCredentials(bytes32 holderDID) external view returns (bytes32[])",
  "function getCredential(bytes32 credentialId) external view returns (tuple(bytes32 issuerDID, bytes32 holderDID, bytes32 credentialHash, uint8 cType, uint256 issuedAt, uint256 expiresAt, bool revoked, string metadataURI))",
  "function credentialCount() external view returns (uint256)",
  "function addTrustedIssuer(bytes32 issuerDID) external",
  "function isTrustedIssuer(bytes32 issuerDID) external view returns (bool)",
  "event CredentialIssued(bytes32 indexed credentialId, bytes32 indexed issuerDID, bytes32 indexed holderDID, uint8 cType)",
  "event CredentialRevoked(bytes32 indexed credentialId, bytes32 indexed issuerDID)",
];

const MARKETPLACE_ABI = [
  "function createListing(bytes32 listingId, bytes32 workerDID, string title, string descriptionURI, bytes32[] requiredCredentials, uint8 lType, uint256 rateWei, bool isHourly) external",
  "function engageWorker(bytes32 engagementId, bytes32 listingId, bytes32 clientDID) external payable",
  "function completeEngagement(bytes32 engagementId, uint8 rating) external",
  "function getListing(bytes32 listingId) external view returns (tuple(bytes32 workerDID, string title, string descriptionURI, bytes32[] requiredCredentials, uint8 verificationLevel, uint8 lType, uint256 rateWei, bool isHourly, uint8 status, uint256 createdAt))",
  "function getWorkerRating(bytes32 workerDID) external view returns (uint256 total, uint256 count)",
  "event ListingCreated(bytes32 indexed listingId, bytes32 indexed workerDID, uint8 lType)",
  "event EngagementStarted(bytes32 indexed engagementId, bytes32 indexed listingId, bytes32 clientDID)",
  "event EngagementCompleted(bytes32 indexed engagementId, uint256 payout)",
];

const SENSOR_ANCHOR_ABI = [
  "function registerDevice(bytes32 deviceDID) external",
  "function anchorBatch(bytes32 batchId, bytes32 deviceDID, bytes32 merkleRoot, uint256 readingCount, uint256 startTimestamp, uint256 endTimestamp, string metadataURI) external",
  "function verifyReading(bytes32 batchId, bytes32 leaf, bytes32[] proof) external view returns (bool)",
  "function getBatch(bytes32 batchId) external view returns (tuple(bytes32 deviceDID, bytes32 merkleRoot, uint256 readingCount, uint256 startTimestamp, uint256 endTimestamp, string metadataURI, uint256 anchoredAt))",
  "function isDeviceRegistered(bytes32 deviceDID) external view returns (bool)",
  "event DeviceRegistered(bytes32 indexed deviceDID, address indexed registeredBy)",
  "event DataAnchored(bytes32 indexed batchId, bytes32 indexed deviceDID, bytes32 merkleRoot, uint256 readingCount)",
];

// Cached instances
let cachedProvider = null;
let cachedSigner = null;

function getProvider() {
  if (!cachedProvider) {
    cachedProvider = new ethers.JsonRpcProvider(config.ETH_RPC_URL);
  }
  return cachedProvider;
}

function getSigner() {
  if (!cachedSigner) {
    cachedSigner = new ethers.Wallet(config.SIGNER_PRIVATE_KEY, getProvider());
  }
  return cachedSigner;
}

function getDIDRegistry() {
  return new ethers.Contract(config.DID_REGISTRY_ADDRESS, DID_REGISTRY_ABI, getSigner());
}

function getCredentialRegistry() {
  return new ethers.Contract(config.CREDENTIAL_REGISTRY_ADDRESS, CREDENTIAL_REGISTRY_ABI, getSigner());
}

function getMarketplace() {
  return new ethers.Contract(config.MARKETPLACE_ADDRESS, MARKETPLACE_ABI, getSigner());
}

function getSensorAnchor() {
  return new ethers.Contract(config.SENSOR_ANCHOR_ADDRESS, SENSOR_ANCHOR_ABI, getSigner());
}

module.exports = {
  getProvider,
  getSigner,
  getDIDRegistry,
  getCredentialRegistry,
  getMarketplace,
  getSensorAnchor,
  DID_REGISTRY_ABI,
  CREDENTIAL_REGISTRY_ABI,
  MARKETPLACE_ABI,
  SENSOR_ANCHOR_ABI,
};
