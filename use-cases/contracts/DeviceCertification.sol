// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title DeviceCertification
 * @author Cloud Creations LLC — NextGen Economy
 * @notice USE CASE: Device Certification Voting
 *
 * Community-governed approval of IoT device manufacturers.
 * New manufacturers submit proposals; NGE token holders vote; approved
 * manufacturers receive the CERTIFIED_MANUFACTURER role that allows
 * their devices to register on the platform.
 *
 * SCENARIO:
 *   A sensor manufacturer wants to join the trusted device registry.
 *   They submit a certification proposal with specs and audit results.
 *   Token holders vote on-chain. Approved manufacturers get certified.
 *   The community can also revoke certification if quality degrades.
 *
 * Features:
 *   - Role-based access (ADMIN, CERTIFIED_MANUFACTURER, VOTER)
 *   - Certification proposal workflow with voting
 *   - Approval threshold (configurable)
 *   - Revocation by admin or governance
 *   - On-chain manufacturer registry
 */
contract DeviceCertification is AccessControl {

    // ──────────────────────────────────────────────
    //  Roles
    // ──────────────────────────────────────────────

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant VOTER_ROLE = keccak256("VOTER_ROLE");
    bytes32 public constant CERTIFIED_MANUFACTURER = keccak256("CERTIFIED_MANUFACTURER");

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    event CertificationProposed(uint256 indexed proposalId, address indexed manufacturer, string name, string specUri);
    event VoteCast(uint256 indexed proposalId, address indexed voter, bool inFavor);
    event ManufacturerCertified(uint256 indexed proposalId, address indexed manufacturer);
    event ManufacturerRevoked(address indexed manufacturer, string reason);

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    error ProposalNotActive();
    error AlreadyVoted();
    error ThresholdNotMet();
    error VotingNotEnded();

    // ──────────────────────────────────────────────
    //  Types
    // ──────────────────────────────────────────────

    enum ProposalStatus { Active, Approved, Rejected, Cancelled }

    struct CertificationProposal {
        address manufacturer;
        string  name;
        string  specUri;         // IPFS/HTTPS link to specs + audit report
        uint256 votesFor;
        uint256 votesAgainst;
        uint256 deadline;        // Block number when voting ends
        ProposalStatus status;
    }

    // ──────────────────────────────────────────────
    //  Storage
    // ──────────────────────────────────────────────

    mapping(uint256 => CertificationProposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    uint256 public proposalCount;
    uint256 public votingPeriodBlocks;    // How many blocks voting lasts
    uint256 public approvalThresholdBps;  // Basis points (5000 = 50%)

    // Certified manufacturer registry
    address[] public certifiedManufacturers;
    mapping(address => bool) public isCertified;

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    constructor(uint256 _votingPeriodBlocks, uint256 _approvalThresholdBps) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(VOTER_ROLE, msg.sender);

        votingPeriodBlocks = _votingPeriodBlocks;
        approvalThresholdBps = _approvalThresholdBps;
    }

    // ──────────────────────────────────────────────
    //  Proposal Workflow
    // ──────────────────────────────────────────────

    function proposeCertification(
        address manufacturer,
        string calldata name,
        string calldata specUri
    ) external onlyRole(VOTER_ROLE) returns (uint256) {
        proposalCount++;
        proposals[proposalCount] = CertificationProposal({
            manufacturer: manufacturer,
            name: name,
            specUri: specUri,
            votesFor: 0,
            votesAgainst: 0,
            deadline: block.number + votingPeriodBlocks,
            status: ProposalStatus.Active
        });

        emit CertificationProposed(proposalCount, manufacturer, name, specUri);
        return proposalCount;
    }

    function vote(uint256 proposalId, bool inFavor) external onlyRole(VOTER_ROLE) {
        CertificationProposal storage p = proposals[proposalId];
        if (p.status != ProposalStatus.Active) revert ProposalNotActive();
        if (block.number > p.deadline) revert ProposalNotActive();
        if (hasVoted[proposalId][msg.sender]) revert AlreadyVoted();

        hasVoted[proposalId][msg.sender] = true;
        if (inFavor) {
            p.votesFor++;
        } else {
            p.votesAgainst++;
        }

        emit VoteCast(proposalId, msg.sender, inFavor);
    }

    function finalize(uint256 proposalId) external {
        CertificationProposal storage p = proposals[proposalId];
        if (p.status != ProposalStatus.Active) revert ProposalNotActive();
        if (block.number <= p.deadline) revert VotingNotEnded();

        uint256 totalVotes = p.votesFor + p.votesAgainst;
        if (totalVotes == 0) {
            p.status = ProposalStatus.Rejected;
            return;
        }

        uint256 approvalRate = (p.votesFor * 10000) / totalVotes;

        if (approvalRate >= approvalThresholdBps) {
            p.status = ProposalStatus.Approved;
            _grantRole(CERTIFIED_MANUFACTURER, p.manufacturer);
            isCertified[p.manufacturer] = true;
            certifiedManufacturers.push(p.manufacturer);
            emit ManufacturerCertified(proposalId, p.manufacturer);
        } else {
            p.status = ProposalStatus.Rejected;
        }
    }

    function cancelProposal(uint256 proposalId) external onlyRole(ADMIN_ROLE) {
        proposals[proposalId].status = ProposalStatus.Cancelled;
    }

    // ──────────────────────────────────────────────
    //  Revocation
    // ──────────────────────────────────────────────

    function revokeManufacturer(address manufacturer, string calldata reason) external onlyRole(ADMIN_ROLE) {
        _revokeRole(CERTIFIED_MANUFACTURER, manufacturer);
        isCertified[manufacturer] = false;
        emit ManufacturerRevoked(manufacturer, reason);
    }

    // ──────────────────────────────────────────────
    //  View
    // ──────────────────────────────────────────────

    function certifiedCount() external view returns (uint256) {
        return certifiedManufacturers.length;
    }

    function getProposal(uint256 proposalId) external view returns (
        address manufacturer, string memory name, uint256 votesFor, uint256 votesAgainst, uint256 deadline, ProposalStatus status
    ) {
        CertificationProposal storage p = proposals[proposalId];
        return (p.manufacturer, p.name, p.votesFor, p.votesAgainst, p.deadline, p.status);
    }
}
