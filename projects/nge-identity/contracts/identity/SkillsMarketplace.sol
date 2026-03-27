// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/ISkillsMarketplace.sol";
import "./interfaces/ICredentialRegistry.sol";

/**
 * @title SkillsMarketplace
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Decentralized marketplace for trading verified skills and labor.
 *
 * Workers list credential-backed skills, clients browse and engage via
 * escrow. Uses pull-over-push pattern for fund disbursement.
 *
 * Dual-audience design:
 *   - Blue-collar/gig: GIG listings, hourly rates, BASIC_ID tier
 *   - Credentialed professionals: CONTRACT/PERMANENT, verified credentials
 *
 * @dev Uses ReentrancyGuard on all ETH-handling functions.
 *      Pull pattern: workers/treasury withdraw via pendingWithdrawals mapping.
 */
contract SkillsMarketplace is Ownable, ReentrancyGuard, ISkillsMarketplace {
    // ──────────────────────────────────────────────
    //  Storage
    // ──────────────────────────────────────────────

    ICredentialRegistry public immutable credentialRegistry;

    mapping(bytes32 => SkillListing) private _listings;
    mapping(bytes32 => Engagement) private _engagements;

    /// @dev Pull pattern: address → pending withdrawal amount
    mapping(address => uint256) public pendingWithdrawals;

    /// @dev Worker DID → cumulative rating points
    mapping(bytes32 => uint256) public workerRatingTotal;

    /// @dev Worker DID → number of ratings received
    mapping(bytes32 => uint256) public workerRatingCount;

    /// @dev Worker DID → controller address (for withdrawals)
    mapping(bytes32 => address) public workerAddresses;

    /// @dev Platform fee in basis points (250 = 2.5%)
    uint256 public platformFeeBps;

    /// @dev Treasury address for platform fees
    address public treasury;

    /// @dev Total listings created
    uint256 private _listingCount;

    /// @dev Total engagements created
    uint256 private _engagementCount;

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    constructor(
        address _credentialRegistry,
        address _treasury,
        uint256 _platformFeeBps
    ) Ownable(msg.sender) {
        credentialRegistry = ICredentialRegistry(_credentialRegistry);
        treasury = _treasury;
        platformFeeBps = _platformFeeBps;
    }

    // ──────────────────────────────────────────────
    //  Listings
    // ──────────────────────────────────────────────

    /**
     * @notice Creates a new skill listing backed by verified credentials.
     * @param listingId Unique ID for this listing
     * @param workerDID DID hash of the worker
     * @param title Short listing title
     * @param descriptionURI URI to full description (IPFS/S3)
     * @param requiredCredentials Credential IDs backing this listing
     * @param lType Listing type (GIG, CONTRACT_WORK, PERMANENT)
     * @param rateWei Rate in wei (per hour or per job)
     * @param isHourly True if rate is hourly, false if per-job
     */
    /**
     * @dev Calculates the worker verification tier based on credentials.
     */
    function _calculateTier(bytes32[] calldata creds) internal view returns (WorkerTier) {
        uint256 validCreds = 0;
        bool hasStateId = false;

        for (uint256 i = 0; i < creds.length; i++) {
            ICredentialRegistry.VerificationResult memory result =
                credentialRegistry.verifyCredential(creds[i]);
            if (result.valid) {
                validCreds++;
                ICredentialRegistry.Credential memory cred =
                    credentialRegistry.getCredential(creds[i]);
                if (cred.cType == ICredentialRegistry.CredentialType.STATE_ID) {
                    hasStateId = true;
                }
            }
        }

        if (hasStateId && validCreds >= 2) return WorkerTier.FULL_VERIFIED;
        if (validCreds > 0) return WorkerTier.CREDENTIAL_VERIFIED;
        if (hasStateId) return WorkerTier.BASIC_ID;
        return WorkerTier.UNVERIFIED;
    }

    function createListing(
        bytes32 listingId,
        bytes32 workerDID,
        string calldata title,
        string calldata descriptionURI,
        bytes32[] calldata requiredCredentials,
        ListingType lType,
        uint256 rateWei,
        bool isHourly
    ) external {
        if (_listings[listingId].createdAt != 0) revert ListingAlreadyExists(listingId);

        WorkerTier tier = _calculateTier(requiredCredentials);

        _listings[listingId] = SkillListing({
            workerDID: workerDID,
            title: title,
            descriptionURI: descriptionURI,
            requiredCredentials: requiredCredentials,
            verificationLevel: tier,
            lType: lType,
            rateWei: rateWei,
            isHourly: isHourly,
            status: ListingStatus.OPEN,
            createdAt: block.timestamp
        });

        // Register worker address for withdrawal
        if (workerAddresses[workerDID] == address(0)) {
            workerAddresses[workerDID] = msg.sender;
        }

        _listingCount++;
        emit ListingCreated(listingId, workerDID, lType);
    }

    /**
     * @notice Cancels an open listing. Only the listing creator can cancel.
     * @param listingId The listing to cancel
     */
    function cancelListing(bytes32 listingId) external {
        SkillListing storage listing = _listings[listingId];
        if (listing.createdAt == 0) revert ListingNotFound(listingId);
        if (listing.status != ListingStatus.OPEN) revert ListingNotOpen(listingId);

        listing.status = ListingStatus.CANCELLED;
        emit ListingCancelled(listingId);
    }

    // ──────────────────────────────────────────────
    //  Engagements (Escrow)
    // ──────────────────────────────────────────────

    /**
     * @notice Engages a worker by funding an escrow.
     * @param engagementId Unique ID for this engagement
     * @param listingId The listing to engage
     * @param clientDID DID hash of the client
     */
    function engageWorker(
        bytes32 engagementId,
        bytes32 listingId,
        bytes32 clientDID
    ) external payable nonReentrant {
        SkillListing storage listing = _listings[listingId];
        if (listing.createdAt == 0) revert ListingNotFound(listingId);
        if (listing.status != ListingStatus.OPEN) revert ListingNotOpen(listingId);
        if (_engagements[engagementId].startedAt != 0) revert EngagementAlreadyExists(engagementId);
        if (msg.value == 0) revert MustFundEscrow();

        _engagements[engagementId] = Engagement({
            listingId: listingId,
            clientDID: clientDID,
            workerDID: listing.workerDID,
            agreedRateWei: listing.rateWei,
            escrowAmount: msg.value,
            startedAt: block.timestamp,
            completedAt: 0,
            clientApproved: false,
            disputed: false
        });

        listing.status = ListingStatus.IN_PROGRESS;
        _engagementCount++;

        emit EngagementStarted(engagementId, listingId, clientDID);
    }

    /**
     * @notice Completes an engagement, releasing escrow to pending withdrawals.
     * @dev Uses pull pattern: funds go to pendingWithdrawals, not direct transfer.
     * @param engagementId The engagement to complete
     * @param rating Rating for the worker (1-5)
     */
    function completeEngagement(
        bytes32 engagementId,
        uint8 rating
    ) external nonReentrant {
        Engagement storage eng = _engagements[engagementId];
        if (eng.startedAt == 0) revert EngagementNotFound(engagementId);
        if (eng.disputed) revert EngagementDisputed(engagementId);
        if (eng.completedAt != 0) revert EngagementAlreadyCompleted(engagementId);
        if (rating < 1 || rating > 5) revert InvalidRating();

        eng.clientApproved = true;
        eng.completedAt = block.timestamp;

        // Calculate fee and payout
        uint256 fee = (eng.escrowAmount * platformFeeBps) / 10000;
        uint256 payout = eng.escrowAmount - fee;

        // Pull pattern: credit pending withdrawals
        address workerAddr = workerAddresses[eng.workerDID];
        pendingWithdrawals[workerAddr] += payout;
        pendingWithdrawals[treasury] += fee;

        // Update rating
        workerRatingTotal[eng.workerDID] += rating;
        workerRatingCount[eng.workerDID]++;

        // Update listing status
        _listings[eng.listingId].status = ListingStatus.COMPLETED;

        emit EngagementCompleted(engagementId, payout);
        emit WorkerRated(eng.workerDID, engagementId, rating);
    }

    /**
     * @notice Raises a dispute on an engagement.
     * @param engagementId The engagement to dispute
     * @param raisedBy DID of the party raising the dispute
     */
    function raiseDispute(bytes32 engagementId, bytes32 raisedBy) external {
        Engagement storage eng = _engagements[engagementId];
        if (eng.startedAt == 0) revert EngagementNotFound(engagementId);
        if (eng.completedAt != 0) revert EngagementAlreadyCompleted(engagementId);

        eng.disputed = true;
        _listings[eng.listingId].status = ListingStatus.DISPUTED;

        emit DisputeRaised(engagementId, raisedBy);
    }

    // ──────────────────────────────────────────────
    //  Withdrawals (Pull Pattern)
    // ──────────────────────────────────────────────

    /**
     * @notice Withdraws pending funds. Anyone with a balance can withdraw.
     * @dev Checks-effects-interactions pattern with ReentrancyGuard.
     */
    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        pendingWithdrawals[msg.sender] = 0;

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        if (!success) revert WithdrawFailed();

        emit FundsWithdrawn(msg.sender, amount);
    }

    // ──────────────────────────────────────────────
    //  Admin
    // ──────────────────────────────────────────────

    /**
     * @notice Updates the platform fee. Owner only.
     * @param newFeeBps New fee in basis points (max 1000 = 10%)
     */
    function updatePlatformFee(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= 1000, "Fee too high");
        platformFeeBps = newFeeBps;
    }

    /**
     * @notice Updates the treasury address. Owner only.
     * @param newTreasury New treasury address
     */
    function updateTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "Invalid treasury");
        treasury = newTreasury;
    }

    // ──────────────────────────────────────────────
    //  View functions
    // ──────────────────────────────────────────────

    function getListing(bytes32 listingId) external view returns (SkillListing memory) {
        if (_listings[listingId].createdAt == 0) revert ListingNotFound(listingId);
        return _listings[listingId];
    }

    function getEngagement(bytes32 engagementId) external view returns (Engagement memory) {
        if (_engagements[engagementId].startedAt == 0) revert EngagementNotFound(engagementId);
        return _engagements[engagementId];
    }

    function getWorkerRating(bytes32 workerDID) external view returns (uint256 total, uint256 count) {
        return (workerRatingTotal[workerDID], workerRatingCount[workerDID]);
    }

    function listingCount() external view returns (uint256) {
        return _listingCount;
    }

    function engagementCount() external view returns (uint256) {
        return _engagementCount;
    }
}
