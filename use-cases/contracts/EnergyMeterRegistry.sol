// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title EnergyMeterRegistry
 * @author Cloud Creations LLC — NextGen Economy
 * @notice USE CASE: Smart Grid Energy Metering
 *
 * Tamper-proof energy production/consumption records for community solar programs.
 * Each smart meter is an ERC-721 NFT with hourly readings anchored on-chain.
 *
 * SCENARIO:
 *   A community solar program compensates homeowners for excess energy fed to
 *   the grid. Both the homeowner and utility can independently verify readings
 *   on-chain. Billing disputes are resolved instantly — same immutable record.
 *
 * Features:
 *   - ERC-721 meter identity (one NFT per physical meter)
 *   - Hourly energy reading anchoring (production + consumption)
 *   - Net energy calculation (production - consumption)
 *   - Settlement-ready data (verified readings for payment automation)
 *   - Firmware hash verification
 */
contract EnergyMeterRegistry is ERC721, ERC721Enumerable, Ownable {

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    event MeterRegistered(uint256 indexed meterId, address indexed owner, bytes32 firmwareHash);
    event MeterDeactivated(uint256 indexed meterId);
    event ReadingAnchored(uint256 indexed meterId, bytes32 indexed dataHash, uint256 productionWh, uint256 consumptionWh, uint256 timestamp);
    event SettlementPeriodRecorded(uint256 indexed meterId, uint256 periodStart, uint256 periodEnd, int256 netEnergyWh);

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    error MeterNotActive(uint256 meterId);
    error NotMeterOwner(uint256 meterId);
    error AlreadyAnchored(bytes32 dataHash);

    // ──────────────────────────────────────────────
    //  Types
    // ──────────────────────────────────────────────

    enum MeterStatus { Inactive, Active, Suspended }

    struct EnergyReading {
        uint256 meterId;
        uint256 timestamp;
        uint256 blockNumber;
        uint256 productionWh;    // Watt-hours produced
        uint256 consumptionWh;   // Watt-hours consumed
    }

    struct SettlementPeriod {
        uint256 periodStart;
        uint256 periodEnd;
        uint256 totalProductionWh;
        uint256 totalConsumptionWh;
        int256  netEnergyWh;      // Positive = net producer
        uint256 readingCount;
    }

    // ──────────────────────────────────────────────
    //  Storage
    // ──────────────────────────────────────────────

    uint256 private _nextMeterId;
    mapping(uint256 => MeterStatus) public meterStatus;
    mapping(uint256 => bytes32) public firmwareHash;
    mapping(bytes32 => EnergyReading) public readings;
    mapping(uint256 => uint256) public meterReadingCount;
    mapping(uint256 => mapping(uint256 => SettlementPeriod)) public settlements; // meterId => periodStart => data

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    constructor() ERC721("NGE Energy Meter", "METER") Ownable(msg.sender) {}

    // ──────────────────────────────────────────────
    //  Meter Registration
    // ──────────────────────────────────────────────

    function registerMeter(address meterOwner, bytes32 fwHash) external onlyOwner returns (uint256) {
        uint256 meterId = _nextMeterId++;
        _safeMint(meterOwner, meterId);
        meterStatus[meterId] = MeterStatus.Active;
        firmwareHash[meterId] = fwHash;
        emit MeterRegistered(meterId, meterOwner, fwHash);
        return meterId;
    }

    function deactivateMeter(uint256 meterId) external {
        require(ownerOf(meterId) == msg.sender, "Not meter owner");
        meterStatus[meterId] = MeterStatus.Inactive;
        emit MeterDeactivated(meterId);
    }

    function suspendMeter(uint256 meterId) external onlyOwner {
        meterStatus[meterId] = MeterStatus.Suspended;
    }

    // ──────────────────────────────────────────────
    //  Energy Reading Anchoring
    // ──────────────────────────────────────────────

    function anchorReading(
        uint256 meterId,
        uint256 productionWh,
        uint256 consumptionWh,
        bytes32 dataHash
    ) external {
        if (meterStatus[meterId] != MeterStatus.Active) revert MeterNotActive(meterId);
        if (ownerOf(meterId) != msg.sender) revert NotMeterOwner(meterId);
        if (readings[dataHash].timestamp != 0) revert AlreadyAnchored(dataHash);

        readings[dataHash] = EnergyReading({
            meterId: meterId,
            timestamp: block.timestamp,
            blockNumber: block.number,
            productionWh: productionWh,
            consumptionWh: consumptionWh
        });
        meterReadingCount[meterId]++;

        emit ReadingAnchored(meterId, dataHash, productionWh, consumptionWh, block.timestamp);
    }

    // ──────────────────────────────────────────────
    //  Settlement
    // ──────────────────────────────────────────────

    function recordSettlement(
        uint256 meterId,
        uint256 periodStart,
        uint256 periodEnd,
        uint256 totalProductionWh,
        uint256 totalConsumptionWh,
        uint256 readingCount
    ) external onlyOwner {
        int256 net = int256(totalProductionWh) - int256(totalConsumptionWh);

        settlements[meterId][periodStart] = SettlementPeriod({
            periodStart: periodStart,
            periodEnd: periodEnd,
            totalProductionWh: totalProductionWh,
            totalConsumptionWh: totalConsumptionWh,
            netEnergyWh: net,
            readingCount: readingCount
        });

        emit SettlementPeriodRecorded(meterId, periodStart, periodEnd, net);
    }

    // ──────────────────────────────────────────────
    //  Verification (free — view functions)
    // ──────────────────────────────────────────────

    function isAnchored(bytes32 dataHash) external view returns (bool) {
        return readings[dataHash].timestamp != 0;
    }

    function getReading(bytes32 dataHash) external view returns (uint256 meterId, uint256 timestamp, uint256 productionWh, uint256 consumptionWh) {
        EnergyReading storage r = readings[dataHash];
        return (r.meterId, r.timestamp, r.productionWh, r.consumptionWh);
    }

    function getSettlement(uint256 meterId, uint256 periodStart) external view returns (int256 netEnergyWh, uint256 totalProduction, uint256 totalConsumption) {
        SettlementPeriod storage s = settlements[meterId][periodStart];
        return (s.netEnergyWh, s.totalProductionWh, s.totalConsumptionWh);
    }

    function meterCount() external view returns (uint256) {
        return _nextMeterId;
    }

    // ──────────────────────────────────────────────
    //  Required overrides
    // ──────────────────────────────────────────────

    function _update(address to, uint256 tokenId, address auth)
        internal override(ERC721, ERC721Enumerable) returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value)
        internal override(ERC721, ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }

    function supportsInterface(bytes4 interfaceId)
        public view override(ERC721, ERC721Enumerable) returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
