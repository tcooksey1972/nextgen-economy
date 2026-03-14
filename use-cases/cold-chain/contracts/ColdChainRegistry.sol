// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ColdChainRegistry
 * @author Cloud Creations LLC — NextGen Economy
 * @notice USE CASE: Cold Chain Compliance
 *
 * Pharmaceutical cold chain monitoring with tamper-proof blockchain records.
 * Each temperature sensor is minted as an ERC-721 NFT (its on-chain identity).
 * Temperature readings are hashed and anchored on-chain.
 *
 * SCENARIO:
 *   A pharmaceutical distributor ships vaccines that must stay between 2-8°C.
 *   Sensors publish readings every 5 minutes. Each reading is hashed and
 *   recorded on-chain. At the receiving dock, anyone can verify the shipment's
 *   complete temperature history against the blockchain — no central database.
 *
 * Features:
 *   - ERC-721 sensor identity (one NFT per physical sensor)
 *   - Firmware hash verification (detects tampering)
 *   - Keccak-256 data anchoring with timestamps
 *   - Temperature range validation (on-chain compliance check)
 *   - Batch anchoring for gas efficiency
 *   - Public verification (view functions, no gas)
 */
contract ColdChainRegistry is ERC721, ERC721Enumerable, ERC721URIStorage, Ownable {

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    event SensorRegistered(uint256 indexed sensorId, address indexed owner, bytes32 firmwareHash);
    event SensorDeactivated(uint256 indexed sensorId);
    event TemperatureAnchored(uint256 indexed sensorId, bytes32 indexed dataHash, int16 tempCelsius, uint256 timestamp);
    event BatchAnchored(uint256 indexed sensorId, bytes32 indexed batchRoot, uint256 count);
    event ComplianceViolation(uint256 indexed sensorId, int16 tempCelsius, string reason);
    event FirmwareUpdated(uint256 indexed sensorId, bytes32 oldHash, bytes32 newHash);

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    error SensorNotActive(uint256 sensorId);
    error NotSensorOwner(uint256 sensorId);
    error AlreadyAnchored(bytes32 dataHash);
    error InvalidFirmwareHash();
    error EmptyBatch();

    // ──────────────────────────────────────────────
    //  Types
    // ──────────────────────────────────────────────

    enum SensorStatus { Inactive, Active, Suspended }

    struct Anchor {
        uint256 sensorId;
        uint256 timestamp;
        uint256 blockNumber;
        int16   tempCelsius;  // Temperature in Celsius * 100 (e.g., 450 = 4.50°C)
    }

    // ──────────────────────────────────────────────
    //  Storage
    // ──────────────────────────────────────────────

    uint256 private _nextSensorId;
    mapping(uint256 => SensorStatus) public sensorStatus;
    mapping(uint256 => bytes32) public firmwareHash;
    mapping(bytes32 => Anchor) public anchors;
    mapping(uint256 => uint256) public sensorAnchorCount;

    // Compliance thresholds (Celsius * 100)
    int16 public minTemp = 200;   // 2.00°C
    int16 public maxTemp = 800;   // 8.00°C

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    constructor() ERC721("NGE Cold Chain Sensor", "COLD") Ownable(msg.sender) {}

    // ──────────────────────────────────────────────
    //  Sensor Registration
    // ──────────────────────────────────────────────

    function registerSensor(address sensorOwner, bytes32 fwHash, string calldata uri)
        external
        onlyOwner
        returns (uint256)
    {
        if (fwHash == bytes32(0)) revert InvalidFirmwareHash();

        uint256 sensorId = _nextSensorId++;
        _safeMint(sensorOwner, sensorId);
        _setTokenURI(sensorId, uri);
        sensorStatus[sensorId] = SensorStatus.Active;
        firmwareHash[sensorId] = fwHash;

        emit SensorRegistered(sensorId, sensorOwner, fwHash);
        return sensorId;
    }

    function deactivateSensor(uint256 sensorId) external {
        require(ownerOf(sensorId) == msg.sender, "Not sensor owner");
        sensorStatus[sensorId] = SensorStatus.Inactive;
        emit SensorDeactivated(sensorId);
    }

    function suspendSensor(uint256 sensorId) external onlyOwner {
        sensorStatus[sensorId] = SensorStatus.Suspended;
    }

    function updateFirmware(uint256 sensorId, bytes32 newHash) external onlyOwner {
        if (newHash == bytes32(0)) revert InvalidFirmwareHash();
        bytes32 oldHash = firmwareHash[sensorId];
        firmwareHash[sensorId] = newHash;
        emit FirmwareUpdated(sensorId, oldHash, newHash);
    }

    // ──────────────────────────────────────────────
    //  Data Anchoring
    // ──────────────────────────────────────────────

    function anchorTemperature(uint256 sensorId, int16 tempCelsius, bytes32 dataHash) external {
        if (sensorStatus[sensorId] != SensorStatus.Active) revert SensorNotActive(sensorId);
        if (ownerOf(sensorId) != msg.sender) revert NotSensorOwner(sensorId);
        if (anchors[dataHash].timestamp != 0) revert AlreadyAnchored(dataHash);

        anchors[dataHash] = Anchor({
            sensorId: sensorId,
            timestamp: block.timestamp,
            blockNumber: block.number,
            tempCelsius: tempCelsius
        });
        sensorAnchorCount[sensorId]++;

        emit TemperatureAnchored(sensorId, dataHash, tempCelsius, block.timestamp);

        // Compliance check
        if (tempCelsius < minTemp) {
            emit ComplianceViolation(sensorId, tempCelsius, "Below minimum temperature");
        } else if (tempCelsius > maxTemp) {
            emit ComplianceViolation(sensorId, tempCelsius, "Above maximum temperature");
        }
    }

    function anchorBatch(uint256 sensorId, bytes32[] calldata dataHashes) external {
        if (sensorStatus[sensorId] != SensorStatus.Active) revert SensorNotActive(sensorId);
        if (ownerOf(sensorId) != msg.sender) revert NotSensorOwner(sensorId);
        if (dataHashes.length == 0) revert EmptyBatch();

        bytes32 batchRoot = keccak256(abi.encodePacked(dataHashes));
        if (anchors[batchRoot].timestamp != 0) revert AlreadyAnchored(batchRoot);

        anchors[batchRoot] = Anchor({
            sensorId: sensorId,
            timestamp: block.timestamp,
            blockNumber: block.number,
            tempCelsius: 0
        });
        sensorAnchorCount[sensorId] += dataHashes.length;

        emit BatchAnchored(sensorId, batchRoot, dataHashes.length);
    }

    // ──────────────────────────────────────────────
    //  Verification (free — view functions)
    // ──────────────────────────────────────────────

    function isAnchored(bytes32 dataHash) external view returns (bool) {
        return anchors[dataHash].timestamp != 0;
    }

    function getAnchor(bytes32 dataHash) external view returns (uint256 sensorId, uint256 timestamp, uint256 blockNumber, int16 tempCelsius) {
        Anchor storage a = anchors[dataHash];
        return (a.sensorId, a.timestamp, a.blockNumber, a.tempCelsius);
    }

    function sensorCount() external view returns (uint256) {
        return _nextSensorId;
    }

    function setComplianceRange(int16 _minTemp, int16 _maxTemp) external onlyOwner {
        minTemp = _minTemp;
        maxTemp = _maxTemp;
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

    function tokenURI(uint256 tokenId)
        public view override(ERC721, ERC721URIStorage) returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public view override(ERC721, ERC721Enumerable, ERC721URIStorage) returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
