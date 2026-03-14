import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import config from "../utils/config";
import TOKEN_ABI from "../abi/NGEToken.json";

/**
 * @hook useTokenContract
 * @description Provides read/write access to the NGE token contract.
 *
 * Reads: balance, voting power, delegation, supply info, pause state
 * Writes: transfer, approve, delegate, burn (requires signer)
 */
export default function useTokenContract(provider, signer, account) {
  const [tokenInfo, setTokenInfo] = useState(null);
  const [balance, setBalance] = useState(null);
  const [votingPower, setVotingPower] = useState(null);
  const [delegate, setDelegate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const contractAddress = config.contracts.token;

  const getReadContract = useCallback(() => {
    if (!provider || !contractAddress) return null;
    return new ethers.Contract(contractAddress, TOKEN_ABI, provider);
  }, [provider, contractAddress]);

  const getWriteContract = useCallback(() => {
    if (!signer || !contractAddress) return null;
    return new ethers.Contract(contractAddress, TOKEN_ABI, signer);
  }, [signer, contractAddress]);

  // Fetch token metadata and supply info
  const fetchTokenInfo = useCallback(async () => {
    const contract = getReadContract();
    if (!contract) return;

    try {
      const [name, symbol, decimals, totalSupply, supplyCap, paused] =
        await Promise.all([
          contract.name(),
          contract.symbol(),
          contract.decimals(),
          contract.totalSupply(),
          contract.supplyCap(),
          contract.paused(),
        ]);

      setTokenInfo({
        name,
        symbol,
        decimals: Number(decimals),
        totalSupply: ethers.formatEther(totalSupply),
        supplyCap: supplyCap === 0n ? "Unlimited" : ethers.formatEther(supplyCap),
        paused,
      });
    } catch (err) {
      setError(`Failed to fetch token info: ${err.message}`);
    }
  }, [getReadContract]);

  // Fetch account-specific data
  const fetchAccountData = useCallback(async () => {
    const contract = getReadContract();
    if (!contract || !account) return;

    try {
      const [bal, votes, del] = await Promise.all([
        contract.balanceOf(account),
        contract.getVotes(account),
        contract.delegates(account),
      ]);

      setBalance(ethers.formatEther(bal));
      setVotingPower(ethers.formatEther(votes));
      setDelegate(del);
    } catch (err) {
      setError(`Failed to fetch account data: ${err.message}`);
    }
  }, [getReadContract, account]);

  // Write operations
  const transfer = useCallback(
    async (to, amount) => {
      const contract = getWriteContract();
      if (!contract) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      try {
        const tx = await contract.transfer(to, ethers.parseEther(amount));
        await tx.wait();
        await fetchAccountData();
        return tx.hash;
      } catch (err) {
        setError(err.reason || err.message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [getWriteContract, fetchAccountData]
  );

  const delegateVotes = useCallback(
    async (delegatee) => {
      const contract = getWriteContract();
      if (!contract) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      try {
        const tx = await contract.delegate(delegatee);
        await tx.wait();
        await fetchAccountData();
        return tx.hash;
      } catch (err) {
        setError(err.reason || err.message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [getWriteContract, fetchAccountData]
  );

  const burn = useCallback(
    async (amount) => {
      const contract = getWriteContract();
      if (!contract) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      try {
        const tx = await contract.burn(ethers.parseEther(amount));
        await tx.wait();
        await fetchAccountData();
        await fetchTokenInfo();
        return tx.hash;
      } catch (err) {
        setError(err.reason || err.message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [getWriteContract, fetchAccountData, fetchTokenInfo]
  );

  // Auto-fetch on mount and account change
  useEffect(() => {
    fetchTokenInfo();
  }, [fetchTokenInfo]);

  useEffect(() => {
    fetchAccountData();
  }, [fetchAccountData]);

  return {
    tokenInfo,
    balance,
    votingPower,
    delegate,
    loading,
    error,
    transfer,
    delegateVotes,
    burn,
    refresh: () => {
      fetchTokenInfo();
      fetchAccountData();
    },
  };
}
