// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/governance/Governor.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorPreventLateQuorum.sol";

/**
 * @title NGEGovernorV2
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Enhanced governor with GovernorPreventLateQuorum protection.
 *
 * Extends the original NGEGovernor with late quorum prevention. If a proposal
 * reaches quorum near the end of its voting period, the deadline is automatically
 * extended to give voters time to react. This prevents last-second vote
 * manipulation where a whale waits until the final block to swing a vote.
 *
 * Configuration:
 *   - Voting delay: ~1 day (7200 blocks)
 *   - Voting period: ~1 week (50400 blocks)
 *   - Quorum: 4% of total supply
 *   - Proposal threshold: 0 (anyone with tokens can propose)
 *   - Late quorum extension: ~2 days (14400 blocks)
 */
contract NGEGovernorV2 is
    Governor,
    GovernorCountingSimple,
    GovernorVotes,
    GovernorVotesQuorumFraction,
    GovernorTimelockControl,
    GovernorPreventLateQuorum
{
    /**
     * @param token ERC20Votes or ERC721Votes token used for voting weight.
     * @param timelock TimelockController that queues and executes approved proposals.
     */
    constructor(IVotes token, TimelockController timelock)
        Governor("NGE Governor")
        GovernorVotes(token)
        GovernorVotesQuorumFraction(4)
        GovernorTimelockControl(timelock)
        GovernorPreventLateQuorum(14400)
    {}

    /// @notice Voting delay: ~1 day (7200 blocks at 12s/block).
    function votingDelay() public pure override returns (uint256) { return 7200; }
    /// @notice Voting period: ~1 week (50400 blocks at 12s/block).
    function votingPeriod() public pure override returns (uint256) { return 50400; }
    /// @notice Anyone with tokens can create proposals (threshold = 0).
    function proposalThreshold() public pure override returns (uint256) { return 0; }

    // ──────────────────────────────────────────────
    //  Required overrides for multiple inheritance
    //  Solidity requires explicit resolution when multiple
    //  base contracts define the same function.
    // ──────────────────────────────────────────────

    /// @dev Resolves state() between Governor and GovernorTimelockControl.
    function state(uint256 proposalId)
        public view override(Governor, GovernorTimelockControl) returns (ProposalState)
    {
        return super.state(proposalId);
    }

    /// @dev Resolves proposalNeedsQueuing() — always true with timelock.
    function proposalNeedsQueuing(uint256 proposalId)
        public view override(Governor, GovernorTimelockControl) returns (bool)
    {
        return super.proposalNeedsQueuing(proposalId);
    }

    /// @dev Returns the (possibly extended) deadline from GovernorPreventLateQuorum.
    function proposalDeadline(uint256 proposalId)
        public view override(Governor, GovernorPreventLateQuorum) returns (uint256)
    {
        return super.proposalDeadline(proposalId);
    }

    function _queueOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint48) {
        return super._queueOperations(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _executeOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) {
        super._executeOperations(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _cancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint256) {
        return super._cancel(targets, values, calldatas, descriptionHash);
    }

    function _executor()
        internal view override(Governor, GovernorTimelockControl) returns (address)
    {
        return super._executor();
    }

    /// @dev Resolves _tallyUpdated() — GovernorPreventLateQuorum extends deadline if quorum reached late.
    function _tallyUpdated(uint256 proposalId)
        internal override(Governor, GovernorPreventLateQuorum)
    {
        super._tallyUpdated(proposalId);
    }
}
