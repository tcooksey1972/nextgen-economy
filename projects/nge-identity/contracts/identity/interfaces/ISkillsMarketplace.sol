// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title ISkillsMarketplace
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Interface for the NGE Skills Marketplace contract.
 */
interface ISkillsMarketplace {
    // ──────────────────────────────────────────────
    //  Enums
    // ──────────────────────────────────────────────

    enum ListingType { GIG, CONTRACT_WORK, PERMANENT }
    enum ListingStatus { OPEN, MATCHED, IN_PROGRESS, COMPLETED, DISPUTED, CANCELLED }
    enum WorkerTier { UNVERIFIED, BASIC_ID, CREDENTIAL_VERIFIED, FULL_VERIFIED }

    // ──────────────────────────────────────────────
    //  Structs
    // ──────────────────────────────────────────────

    struct SkillListing {
        bytes32 workerDID;
        string title;
        string descriptionURI;
        bytes32[] requiredCredentials;
        WorkerTier verificationLevel;
        ListingType lType;
        uint256 rateWei;
        bool isHourly;
        ListingStatus status;
        uint256 createdAt;
    }

    struct Engagement {
        bytes32 listingId;
        bytes32 clientDID;
        bytes32 workerDID;
        uint256 agreedRateWei;
        uint256 escrowAmount;
        uint256 startedAt;
        uint256 completedAt;
        bool clientApproved;
        bool disputed;
    }

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    event ListingCreated(bytes32 indexed listingId, bytes32 indexed workerDID, ListingType lType);
    event ListingCancelled(bytes32 indexed listingId);
    event EngagementStarted(bytes32 indexed engagementId, bytes32 indexed listingId, bytes32 clientDID);
    event EngagementCompleted(bytes32 indexed engagementId, uint256 payout);
    event DisputeRaised(bytes32 indexed engagementId, bytes32 raisedBy);
    event WorkerRated(bytes32 indexed workerDID, bytes32 indexed engagementId, uint8 rating);
    event FundsWithdrawn(address indexed recipient, uint256 amount);

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    error ListingAlreadyExists(bytes32 listingId);
    error ListingNotFound(bytes32 listingId);
    error ListingNotOpen(bytes32 listingId);
    error EngagementAlreadyExists(bytes32 engagementId);
    error EngagementNotFound(bytes32 engagementId);
    error EngagementAlreadyCompleted(bytes32 engagementId);
    error EngagementDisputed(bytes32 engagementId);
    error MustFundEscrow();
    error InvalidRating();
    error NothingToWithdraw();
    error WithdrawFailed();
}
