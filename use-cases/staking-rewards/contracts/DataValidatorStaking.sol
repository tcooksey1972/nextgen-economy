// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title DataValidatorStaking
 * @author Cloud Creations LLC — NextGen Economy
 * @notice USE CASE: Staking & Data Validation Rewards
 *
 * Token holders stake NGE tokens to become IoT data validators.
 * Validators cross-check sensor readings and earn rewards for correctly
 * flagging anomalies. False flags result in slashing.
 *
 * SCENARIO:
 *   A temperature sensor anchors data on-chain, but the reading could be
 *   from a faulty sensor. Staked validators review flagged readings against
 *   neighboring sensors and historical data. Correct validations earn
 *   rewards from the protocol fee pool. Incorrect flags lose stake.
 *
 * Features:
 *   - Stake NGE tokens to become a validator
 *   - Validation task assignment
 *   - Reward distribution for correct validations
 *   - Slashing for false flags
 *   - Cooldown period for unstaking
 *   - Confidence scores per device
 */
contract DataValidatorStaking is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    event Staked(address indexed validator, uint256 amount);
    event Unstaked(address indexed validator, uint256 amount);
    event UnstakeRequested(address indexed validator, uint256 unlockTime);
    event ValidationSubmitted(uint256 indexed taskId, address indexed validator, bool flaggedAnomaly);
    event ValidationResolved(uint256 indexed taskId, bool wasAnomaly);
    event RewardDistributed(address indexed validator, uint256 amount);
    event Slashed(address indexed validator, uint256 amount);
    event TaskCreated(uint256 indexed taskId, uint256 indexed deviceId, bytes32 dataHash);

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    error InsufficientStake();
    error CooldownNotElapsed();
    error AlreadyValidated();
    error TaskNotActive();
    error NoUnstakeRequested();

    // ──────────────────────────────────────────────
    //  Types
    // ──────────────────────────────────────────────

    enum TaskStatus { Open, Resolved }

    struct Validator {
        uint256 stakedAmount;
        uint256 unstakeRequestTime;   // 0 = no pending unstake
        uint256 totalRewards;
        uint256 totalSlashed;
        uint256 validationsCompleted;
    }

    struct ValidationTask {
        uint256 deviceId;
        bytes32 dataHash;
        TaskStatus status;
        uint256 flagCount;        // Validators who flagged anomaly
        uint256 clearCount;       // Validators who cleared it
        bool    resolvedAsAnomaly;
    }

    // ──────────────────────────────────────────────
    //  Storage
    // ──────────────────────────────────────────────

    IERC20 public stakeToken;
    uint256 public minStake;
    uint256 public unstakeCooldown;
    uint256 public rewardPerValidation;
    uint256 public slashAmount;

    mapping(address => Validator) public validators;
    mapping(uint256 => ValidationTask) public tasks;
    mapping(uint256 => mapping(address => bool)) public hasValidated;
    mapping(uint256 => mapping(address => bool)) public validatorFlagged; // what they voted
    uint256 public taskCount;
    uint256 public activeValidatorCount;

    // Device confidence tracking
    mapping(uint256 => uint256) public deviceValidationCount;
    mapping(uint256 => uint256) public deviceAnomalyCount;

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    constructor(
        address _stakeToken,
        uint256 _minStake,
        uint256 _unstakeCooldown,
        uint256 _rewardPerValidation,
        uint256 _slashAmount
    ) Ownable(msg.sender) {
        stakeToken = IERC20(_stakeToken);
        minStake = _minStake;
        unstakeCooldown = _unstakeCooldown;
        rewardPerValidation = _rewardPerValidation;
        slashAmount = _slashAmount;
    }

    // ──────────────────────────────────────────────
    //  Staking
    // ──────────────────────────────────────────────

    function stake(uint256 amount) external nonReentrant {
        stakeToken.safeTransferFrom(msg.sender, address(this), amount);
        Validator storage v = validators[msg.sender];
        if (v.stakedAmount == 0) activeValidatorCount++;
        v.stakedAmount += amount;
        emit Staked(msg.sender, amount);
    }

    function requestUnstake() external {
        Validator storage v = validators[msg.sender];
        if (v.stakedAmount == 0) revert InsufficientStake();
        v.unstakeRequestTime = block.timestamp;
        emit UnstakeRequested(msg.sender, block.timestamp + unstakeCooldown);
    }

    function unstake() external nonReentrant {
        Validator storage v = validators[msg.sender];
        if (v.unstakeRequestTime == 0) revert NoUnstakeRequested();
        if (block.timestamp < v.unstakeRequestTime + unstakeCooldown) revert CooldownNotElapsed();

        uint256 amount = v.stakedAmount;
        v.stakedAmount = 0;
        v.unstakeRequestTime = 0;
        activeValidatorCount--;

        stakeToken.safeTransfer(msg.sender, amount);
        emit Unstaked(msg.sender, amount);
    }

    // ──────────────────────────────────────────────
    //  Validation Tasks
    // ──────────────────────────────────────────────

    function createTask(uint256 deviceId, bytes32 dataHash) external onlyOwner returns (uint256) {
        taskCount++;
        tasks[taskCount] = ValidationTask({
            deviceId: deviceId,
            dataHash: dataHash,
            status: TaskStatus.Open,
            flagCount: 0,
            clearCount: 0,
            resolvedAsAnomaly: false
        });
        emit TaskCreated(taskCount, deviceId, dataHash);
        return taskCount;
    }

    function submitValidation(uint256 taskId, bool flagAnomaly) external {
        ValidationTask storage t = tasks[taskId];
        if (t.status != TaskStatus.Open) revert TaskNotActive();
        if (validators[msg.sender].stakedAmount < minStake) revert InsufficientStake();
        if (hasValidated[taskId][msg.sender]) revert AlreadyValidated();

        hasValidated[taskId][msg.sender] = true;
        validatorFlagged[taskId][msg.sender] = flagAnomaly;

        if (flagAnomaly) {
            t.flagCount++;
        } else {
            t.clearCount++;
        }

        validators[msg.sender].validationsCompleted++;
        emit ValidationSubmitted(taskId, msg.sender, flagAnomaly);
    }

    function resolveTask(uint256 taskId, bool wasAnomaly) external onlyOwner {
        ValidationTask storage t = tasks[taskId];
        if (t.status != TaskStatus.Open) revert TaskNotActive();

        t.status = TaskStatus.Resolved;
        t.resolvedAsAnomaly = wasAnomaly;

        deviceValidationCount[t.deviceId]++;
        if (wasAnomaly) deviceAnomalyCount[t.deviceId]++;

        emit ValidationResolved(taskId, wasAnomaly);
    }

    // ──────────────────────────────────────────────
    //  Rewards & Slashing
    // ──────────────────────────────────────────────

    function distributeReward(uint256 taskId, address validator) external onlyOwner nonReentrant {
        ValidationTask storage t = tasks[taskId];
        require(t.status == TaskStatus.Resolved, "Not resolved");
        require(hasValidated[taskId][validator], "Did not validate");

        bool votedCorrectly = validatorFlagged[taskId][validator] == t.resolvedAsAnomaly;

        if (votedCorrectly) {
            validators[validator].totalRewards += rewardPerValidation;
            stakeToken.safeTransfer(validator, rewardPerValidation);
            emit RewardDistributed(validator, rewardPerValidation);
        } else {
            uint256 slash = slashAmount > validators[validator].stakedAmount
                ? validators[validator].stakedAmount
                : slashAmount;
            validators[validator].stakedAmount -= slash;
            validators[validator].totalSlashed += slash;
            emit Slashed(validator, slash);
        }
    }

    // ──────────────────────────────────────────────
    //  View
    // ──────────────────────────────────────────────

    function getValidator(address v) external view returns (uint256 staked, uint256 rewards, uint256 slashed, uint256 validations) {
        Validator storage val = validators[v];
        return (val.stakedAmount, val.totalRewards, val.totalSlashed, val.validationsCompleted);
    }

    function deviceConfidenceScore(uint256 deviceId) external view returns (uint256) {
        if (deviceValidationCount[deviceId] == 0) return 100;
        return ((deviceValidationCount[deviceId] - deviceAnomalyCount[deviceId]) * 100) / deviceValidationCount[deviceId];
    }

    /// @notice Fund the contract with reward tokens
    function fundRewards(uint256 amount) external {
        stakeToken.safeTransferFrom(msg.sender, address(this), amount);
    }
}
