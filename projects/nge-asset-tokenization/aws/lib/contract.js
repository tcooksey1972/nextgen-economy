/**
 * @file contract.js
 * @description Ethereum contract client for the Asset Tokenization Lambda functions.
 *
 * Uses ethers.js v6 with lazy-loaded provider and contract instances
 * for warm-start optimization across Lambda invocations.
 */
const { ethers } = require("ethers");
const config = require("./config");

// ABI subset — only the view functions and events needed by the indexer/API.
// Full ABI is in the artifacts; this keeps the Lambda bundle small.
const ABI = [
  // View functions
  "function assetCount() view returns (uint256)",
  "function assetMetadata(uint256 tokenId) view returns (tuple(uint8 assetClass, uint8 status, uint256 acquisitionCost, uint256 acquisitionDate, uint256 usefulLifeMonths, string department, string location))",
  "function assetStatus(uint256 tokenId) view returns (uint8)",
  "function isAssetActive(uint256 tokenId) view returns (bool)",
  "function balanceOf(address account, uint256 id) view returns (uint256)",
  "function totalSupply(uint256 id) view returns (uint256)",
  "function bookValue(uint256 tokenId) view returns (uint256)",
  "function accumulatedDepreciation(uint256 tokenId) view returns (uint256)",
  "function depreciationPeriods(uint256 tokenId) view returns (uint256)",
  "function entryCount() view returns (uint256)",
  "function resolve(bytes32 identifierHash) view returns (uint256)",
  "function isLinked(bytes32 identifierHash) view returns (bool)",
  "function identifierCount(uint256 tokenId) view returns (uint256)",
  "function uri(uint256 tokenId) view returns (string)",

  // Events
  "event AssetRegistered(uint256 indexed tokenId, uint8 indexed assetClass, uint256 amount, address indexed registeredBy)",
  "event AssetStatusChanged(uint256 indexed tokenId, uint8 oldStatus, uint8 newStatus, address indexed changedBy)",
  "event AssetDisposed(uint256 indexed tokenId, uint256 amount, uint256 disposalValue, address indexed disposedBy)",
  "event IdentifierLinked(bytes32 indexed identifierHash, uint256 indexed tokenId, uint8 idType, address indexed registeredBy)",
  "event JournalEntryRecorded(uint256 indexed entryId, uint256 indexed tokenId, uint8 indexed entryType, uint256 debitAmount, uint256 creditAmount)",
  "event DepreciationRecorded(uint256 indexed tokenId, uint256 period, uint256 amount, uint256 newBookValue)",
  "event ItemsIssued(uint256 indexed tokenId, address indexed from, address indexed to, uint256 amount, string memo)",
  "event ItemsReturned(uint256 indexed tokenId, address indexed from, address indexed to, uint256 returned, uint256 expended, string memo)",
  "event InspectionRecorded(uint256 indexed tokenId, address indexed location, uint256 physicalCount, uint256 onChainBalance, bool discrepancy, address indexed inspector)",
];

let _provider = null;
let _contract = null;

/**
 * Returns a cached ethers.js provider instance.
 */
function getProvider() {
  if (!_provider) {
    _provider = new ethers.JsonRpcProvider(config.rpcUrl);
  }
  return _provider;
}

/**
 * Returns a cached read-only contract instance.
 */
function getContract() {
  if (!_contract) {
    _contract = new ethers.Contract(config.contractAddress, ABI, getProvider());
  }
  return _contract;
}

/**
 * Queries contract events in a block range.
 * @param {string} eventName - The event name (e.g., "AssetRegistered").
 * @param {number} fromBlock - Start block (inclusive).
 * @param {number} toBlock - End block (inclusive).
 */
async function queryEvents(eventName, fromBlock, toBlock) {
  const contract = getContract();
  const filter = contract.filters[eventName]();
  return contract.queryFilter(filter, fromBlock, toBlock);
}

/**
 * Reads the full state snapshot for a single asset.
 * @param {number} tokenId - The asset token ID.
 */
async function getAssetSnapshot(tokenId) {
  const contract = getContract();
  const [metadata, supply, book, accumulated, periods, idCount] = await Promise.all([
    contract.assetMetadata(tokenId),
    contract.totalSupply(tokenId),
    contract.bookValue(tokenId),
    contract.accumulatedDepreciation(tokenId),
    contract.depreciationPeriods(tokenId),
    contract.identifierCount(tokenId),
  ]);

  return {
    tokenId,
    assetClass: Number(metadata.assetClass),
    status: Number(metadata.status),
    acquisitionCost: metadata.acquisitionCost.toString(),
    acquisitionDate: Number(metadata.acquisitionDate),
    usefulLifeMonths: Number(metadata.usefulLifeMonths),
    department: metadata.department,
    location: metadata.location,
    totalSupply: supply.toString(),
    bookValue: book.toString(),
    accumulatedDepreciation: accumulated.toString(),
    depreciationPeriods: Number(periods),
    identifierCount: Number(idCount),
  };
}

module.exports = { getProvider, getContract, queryEvents, getAssetSnapshot };
