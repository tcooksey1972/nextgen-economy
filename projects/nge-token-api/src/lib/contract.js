/**
 * @file contract.js
 * @description Shared Ethereum contract clients for the token and governor.
 * Read-only — the API never sends transactions.
 */
const { ethers } = require("ethers");
const config = require("./config");
const tokenAbi = require("../abi/NGEToken.json");
const governorAbi = require("../abi/NGEGovernor.json");

let _provider = null;
let _tokenContract = null;
let _governorContract = null;

function getProvider() {
  if (!_provider) {
    _provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
  }
  return _provider;
}

function getTokenContract() {
  if (!_tokenContract) {
    if (!config.tokenAddress) throw new Error("TOKEN_ADDRESS not configured");
    _tokenContract = new ethers.Contract(config.tokenAddress, tokenAbi, getProvider());
  }
  return _tokenContract;
}

function getGovernorContract() {
  if (!_governorContract) {
    if (!config.governorAddress) return null;
    _governorContract = new ethers.Contract(config.governorAddress, governorAbi, getProvider());
  }
  return _governorContract;
}

/**
 * Reads token info (name, symbol, totalSupply, supplyCap, paused).
 */
async function getTokenInfo() {
  const token = getTokenContract();
  const [name, symbol, decimals, totalSupply, supplyCap, paused] = await Promise.all([
    token.name(),
    token.symbol(),
    token.decimals(),
    token.totalSupply(),
    token.supplyCap(),
    token.paused(),
  ]);

  return {
    name,
    symbol,
    decimals: Number(decimals),
    totalSupply: totalSupply.toString(),
    supplyCap: supplyCap.toString(),
    paused,
    address: config.tokenAddress,
  };
}

/**
 * Reads balance and voting data for an address.
 */
async function getBalance(address) {
  const token = getTokenContract();
  const [balance, votes, delegate] = await Promise.all([
    token.balanceOf(address),
    token.getVotes(address),
    token.delegates(address),
  ]);

  return {
    address,
    balance: balance.toString(),
    votingPower: votes.toString(),
    delegate,
  };
}

module.exports = {
  getProvider,
  getTokenContract,
  getGovernorContract,
  getTokenInfo,
  getBalance,
};
