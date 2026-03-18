import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import config from "../utils/config";
import GOVERNOR_ABI from "../abi/NGEGovernor.json";
import TOKEN_ABI from "../abi/NGEToken.json";

/**
 * Proposal state enum from OpenZeppelin Governor.
 * @see https://docs.openzeppelin.com/contracts/5.x/api/governance#IGovernor-ProposalState-enum
 */
const PROPOSAL_STATES = [
  "Pending",
  "Active",
  "Canceled",
  "Defeated",
  "Succeeded",
  "Queued",
  "Expired",
  "Executed",
];

/**
 * @hook useGovernorContract
 * @description Provides read/write access to the NGE Governor contract.
 *
 * Reads: proposals list (from events), proposal state, vote tallies, governor settings
 * Writes: propose, castVote, queue, execute
 */
export default function useGovernorContract(provider, signer, account) {
  const [proposals, setProposals] = useState([]);
  const [governorInfo, setGovernorInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const governorAddress = config.contracts.governor;
  const tokenAddress = config.contracts.token;

  const getReadGovernor = useCallback(() => {
    if (!provider || !governorAddress) return null;
    return new ethers.Contract(governorAddress, GOVERNOR_ABI, provider);
  }, [provider, governorAddress]);

  const getWriteGovernor = useCallback(() => {
    if (!signer || !governorAddress) return null;
    return new ethers.Contract(governorAddress, GOVERNOR_ABI, signer);
  }, [signer, governorAddress]);

  // Fetch governor configuration
  const fetchGovernorInfo = useCallback(async () => {
    const governor = getReadGovernor();
    if (!governor) return;

    try {
      const [name, votingDelay, votingPeriod, proposalThreshold] = await Promise.all([
        governor.name(),
        governor.votingDelay(),
        governor.votingPeriod(),
        governor.proposalThreshold(),
      ]);

      setGovernorInfo({
        name,
        votingDelay: Number(votingDelay),
        votingPeriod: Number(votingPeriod),
        proposalThreshold: ethers.formatEther(proposalThreshold),
      });
    } catch (err) {
      console.error("Failed to fetch governor info:", err);
    }
  }, [getReadGovernor]);

  // Fetch proposals from ProposalCreated events
  const fetchProposals = useCallback(async () => {
    const governor = getReadGovernor();
    if (!governor || !provider) return;

    try {
      // Query ProposalCreated events from the last ~30 days of blocks (~216000 blocks on Sepolia)
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 216000);

      const filter = governor.filters.ProposalCreated();
      const events = await governor.queryFilter(filter, fromBlock, "latest");

      const proposalList = await Promise.all(
        events.map(async (event) => {
          const proposalId = event.args[0];
          const proposer = event.args[1];
          const targets = event.args[2];
          const values = event.args[3];
          const calldatas = event.args[5];
          const voteStart = Number(event.args[6]);
          const voteEnd = Number(event.args[7]);
          const description = event.args[8];

          let state, votes, hasVoted;
          try {
            [state, votes, hasVoted] = await Promise.all([
              governor.state(proposalId),
              governor.proposalVotes(proposalId),
              account ? governor.hasVoted(proposalId, account) : Promise.resolve(false),
            ]);
          } catch {
            state = 0;
            votes = [0n, 0n, 0n];
            hasVoted = false;
          }

          return {
            id: proposalId.toString(),
            proposer,
            targets: [...targets],
            values: [...values].map((v) => v.toString()),
            calldatas: [...calldatas],
            description,
            voteStart,
            voteEnd,
            state: Number(state),
            stateLabel: PROPOSAL_STATES[Number(state)] || "Unknown",
            againstVotes: ethers.formatEther(votes[0]),
            forVotes: ethers.formatEther(votes[1]),
            abstainVotes: ethers.formatEther(votes[2]),
            hasVoted,
            blockNumber: event.blockNumber,
          };
        })
      );

      // Sort by block number descending (newest first)
      proposalList.sort((a, b) => b.blockNumber - a.blockNumber);
      setProposals(proposalList);
    } catch (err) {
      console.error("Failed to fetch proposals:", err);
      setError(`Failed to fetch proposals: ${err.message}`);
    }
  }, [getReadGovernor, provider, account]);

  // Create a new proposal
  const propose = useCallback(
    async (targets, values, calldatas, description) => {
      const governor = getWriteGovernor();
      if (!governor) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      try {
        const tx = await governor.propose(targets, values, calldatas, description);
        await tx.wait();
        await fetchProposals();
        return tx.hash;
      } catch (err) {
        setError(err.reason || err.message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [getWriteGovernor, fetchProposals]
  );

  // Cast a vote: 0 = Against, 1 = For, 2 = Abstain
  const castVote = useCallback(
    async (proposalId, support) => {
      const governor = getWriteGovernor();
      if (!governor) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      try {
        const tx = await governor.castVote(proposalId, support);
        await tx.wait();
        await fetchProposals();
        return tx.hash;
      } catch (err) {
        setError(err.reason || err.message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [getWriteGovernor, fetchProposals]
  );

  // Queue a succeeded proposal for timelock execution
  const queue = useCallback(
    async (targets, values, calldatas, descriptionHash) => {
      const governor = getWriteGovernor();
      if (!governor) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      try {
        const tx = await governor.queue(targets, values, calldatas, descriptionHash);
        await tx.wait();
        await fetchProposals();
        return tx.hash;
      } catch (err) {
        setError(err.reason || err.message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [getWriteGovernor, fetchProposals]
  );

  // Execute a queued proposal after timelock delay
  const execute = useCallback(
    async (targets, values, calldatas, descriptionHash) => {
      const governor = getWriteGovernor();
      if (!governor) throw new Error("Wallet not connected");
      setLoading(true);
      setError(null);
      try {
        const tx = await governor.execute(targets, values, calldatas, descriptionHash);
        await tx.wait();
        await fetchProposals();
        return tx.hash;
      } catch (err) {
        setError(err.reason || err.message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [getWriteGovernor, fetchProposals]
  );

  // Fetch voting power from the token contract
  const getVotingPower = useCallback(async () => {
    if (!provider || !tokenAddress || !account) return "0";
    try {
      const token = new ethers.Contract(tokenAddress, TOKEN_ABI, provider);
      const votes = await token.getVotes(account);
      return ethers.formatEther(votes);
    } catch {
      return "0";
    }
  }, [provider, tokenAddress, account]);

  useEffect(() => {
    fetchGovernorInfo();
  }, [fetchGovernorInfo]);

  useEffect(() => {
    fetchProposals();
  }, [fetchProposals]);

  return {
    proposals,
    governorInfo,
    loading,
    error,
    propose,
    castVote,
    queue,
    execute,
    getVotingPower,
    refresh: () => {
      fetchGovernorInfo();
      fetchProposals();
    },
    PROPOSAL_STATES,
  };
}
