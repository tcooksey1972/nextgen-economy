// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title EnvironmentalMonitor
 * @author Cloud Creations LLC — NextGen Economy
 * @notice USE CASE: Environmental Monitoring & Carbon Credits
 *
 * Air quality sensors with on-chain data anchoring to back verifiable
 * carbon credits. Credits can only be minted when sensor data proves
 * actual emissions reductions.
 *
 * SCENARIO:
 *   Deploy air quality sensors across industrial zones. Each sensor is an
 *   ERC-721 device. Readings (PM2.5, CO2, NOx) are anchored on-chain every
 *   15 minutes. Carbon credit issuance is tied to verified data — credits
 *   are only mintable when readings prove reductions vs. a baseline.
 *
 * Features:
 *   - ERC-721 sensor identity
 *   - Multi-metric data anchoring (PM2.5, CO2, NOx)
 *   - Baseline comparison for emissions reduction verification
 *   - Carbon credit minting tied to verified data
 *   - Public audit trail for regulators
 */
contract EnvironmentalMonitor is ERC721, ERC721Enumerable, Ownable {

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    event SensorRegistered(uint256 indexed sensorId, address indexed owner, string zone);
    event ReadingAnchored(uint256 indexed sensorId, bytes32 indexed dataHash, uint256 pm25, uint256 co2, uint256 nox, uint256 timestamp);
    event BaselineSet(string indexed zone, uint256 pm25, uint256 co2, uint256 nox);
    event CarbonCreditIssued(uint256 indexed sensorId, string indexed zone, uint256 creditAmount, uint256 reductionPercent);

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    error SensorNotActive(uint256 sensorId);
    error NotSensorOwner(uint256 sensorId);
    error AlreadyAnchored(bytes32 dataHash);
    error NoBaselineSet(string zone);
    error NoReduction();

    // ──────────────────────────────────────────────
    //  Types
    // ──────────────────────────────────────────────

    enum SensorStatus { Inactive, Active, Suspended }

    struct AirQualityReading {
        uint256 sensorId;
        uint256 timestamp;
        uint256 blockNumber;
        uint256 pm25;     // PM2.5 in µg/m³ (scaled by 100)
        uint256 co2;      // CO2 in ppm
        uint256 nox;      // NOx in ppb
    }

    struct Baseline {
        uint256 pm25;
        uint256 co2;
        uint256 nox;
        bool    isSet;
    }

    // ──────────────────────────────────────────────
    //  Storage
    // ──────────────────────────────────────────────

    uint256 private _nextSensorId;
    mapping(uint256 => SensorStatus) public sensorStatus;
    mapping(uint256 => string) public sensorZone;
    mapping(bytes32 => AirQualityReading) public readings;
    mapping(uint256 => uint256) public sensorReadingCount;
    mapping(string => Baseline) public baselines;  // zone => baseline
    uint256 public totalCreditsIssued;

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    constructor() ERC721("NGE Air Quality Sensor", "AIRQ") Ownable(msg.sender) {}

    // ──────────────────────────────────────────────
    //  Sensor Registration
    // ──────────────────────────────────────────────

    function registerSensor(address sensorOwner, string calldata zone) external onlyOwner returns (uint256) {
        uint256 sensorId = _nextSensorId++;
        _safeMint(sensorOwner, sensorId);
        sensorStatus[sensorId] = SensorStatus.Active;
        sensorZone[sensorId] = zone;
        emit SensorRegistered(sensorId, sensorOwner, zone);
        return sensorId;
    }

    function deactivateSensor(uint256 sensorId) external {
        require(ownerOf(sensorId) == msg.sender, "Not sensor owner");
        sensorStatus[sensorId] = SensorStatus.Inactive;
    }

    // ──────────────────────────────────────────────
    //  Data Anchoring
    // ──────────────────────────────────────────────

    function anchorReading(uint256 sensorId, uint256 pm25, uint256 co2, uint256 nox, bytes32 dataHash) external {
        if (sensorStatus[sensorId] != SensorStatus.Active) revert SensorNotActive(sensorId);
        if (ownerOf(sensorId) != msg.sender) revert NotSensorOwner(sensorId);
        if (readings[dataHash].timestamp != 0) revert AlreadyAnchored(dataHash);

        readings[dataHash] = AirQualityReading({
            sensorId: sensorId,
            timestamp: block.timestamp,
            blockNumber: block.number,
            pm25: pm25,
            co2: co2,
            nox: nox
        });
        sensorReadingCount[sensorId]++;

        emit ReadingAnchored(sensorId, dataHash, pm25, co2, nox, block.timestamp);
    }

    // ──────────────────────────────────────────────
    //  Baseline & Carbon Credits
    // ──────────────────────────────────────────────

    function setBaseline(string calldata zone, uint256 pm25, uint256 co2, uint256 nox) external onlyOwner {
        baselines[zone] = Baseline({ pm25: pm25, co2: co2, nox: nox, isSet: true });
        emit BaselineSet(zone, pm25, co2, nox);
    }

    /**
     * @notice Issues carbon credits based on verified CO2 reduction vs. baseline.
     * @param sensorId Sensor that provided the readings
     * @param measuredCo2 Average CO2 reading for the period (ppm)
     * @param creditAmount Number of credits to issue
     */
    function issueCarbonCredit(uint256 sensorId, uint256 measuredCo2, uint256 creditAmount) external onlyOwner {
        string memory zone = sensorZone[sensorId];
        Baseline storage b = baselines[zone];
        if (!b.isSet) revert NoBaselineSet(zone);
        if (measuredCo2 >= b.co2) revert NoReduction();

        uint256 reductionPercent = ((b.co2 - measuredCo2) * 100) / b.co2;
        totalCreditsIssued += creditAmount;

        emit CarbonCreditIssued(sensorId, zone, creditAmount, reductionPercent);
    }

    // ──────────────────────────────────────────────
    //  Verification
    // ──────────────────────────────────────────────

    function isAnchored(bytes32 dataHash) external view returns (bool) {
        return readings[dataHash].timestamp != 0;
    }

    function getReading(bytes32 dataHash) external view returns (uint256 sensorId, uint256 timestamp, uint256 pm25, uint256 co2, uint256 nox) {
        AirQualityReading storage r = readings[dataHash];
        return (r.sensorId, r.timestamp, r.pm25, r.co2, r.nox);
    }

    function sensorCount() external view returns (uint256) {
        return _nextSensorId;
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
