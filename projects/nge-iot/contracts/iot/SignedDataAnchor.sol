// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "./interfaces/IDataAnchor.sol";

/**
 * @title SignedDataAnchor
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Abstract contract for anchoring IoT data via EIP-712 signed messages.
 *
 * IoT devices sign data readings off-chain using EIP-712 typed structured data.
 * A relayer (e.g., AWS Lambda) collects signatures and submits them on-chain,
 * paying gas on behalf of devices. The contract verifies each signature before
 * anchoring, ensuring data authenticity without requiring devices to hold ETH.
 *
 * Supports both EOA (ECDSA) and smart contract (ERC-1271) signers via
 * OpenZeppelin's SignatureChecker.
 *
 * @dev Composability:
 *   Uses virtual hooks for authorization and post-anchor callbacks, same
 *   pattern as DataAnchor. Can be composed with Sentinel modules.
 *
 * Usage:
 *   contract MySignedAnchor is Ownable, SignedDataAnchor {
 *       constructor() Ownable(msg.sender) SignedDataAnchor() {}
 *       function _authorizeSignedAnchorAdmin() internal view override { _checkOwner(); }
 *       function _getDeviceSigner(uint256 deviceId) internal view override returns (address) {
 *           return ownerOf(deviceId); // or a dedicated device key
 *       }
 *   }
 */
abstract contract SignedDataAnchor is EIP712, IDataAnchor {
    // ──────────────────────────────────────────────
    //  Constants
    // ──────────────────────────────────────────────

    bytes32 private constant _ANCHOR_TYPEHASH = keccak256(
        "AnchorData(uint256 deviceId,bytes32 dataHash,uint256 nonce)"
    );

    bytes32 private constant _BATCH_TYPEHASH = keccak256(
        "AnchorBatch(uint256 deviceId,bytes32 batchRoot,uint256 count,uint256 nonce)"
    );

    // ──────────────────────────────────────────────
    //  Storage
    // ──────────────────────────────────────────────

    mapping(bytes32 => Anchor) private _anchors;
    mapping(uint256 => uint256) private _deviceAnchorCounts;
    mapping(uint256 => uint256) private _deviceNonces;

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    constructor() EIP712("NGE SignedDataAnchor", "1") {}

    // ──────────────────────────────────────────────
    //  External — Signed anchoring
    // ──────────────────────────────────────────────

    /**
     * @notice Anchors a data hash using an EIP-712 signature from the device.
     * @param deviceId The device that produced the data.
     * @param dataHash keccak256 hash of the sensor reading.
     * @param signature EIP-712 signature from the device's authorized signer.
     */
    function anchorDataSigned(
        uint256 deviceId,
        bytes32 dataHash,
        bytes calldata signature
    ) external {
        if (dataHash == bytes32(0)) revert InvalidDataHash();
        if (_anchors[dataHash].timestamp != 0) revert AlreadyAnchored(dataHash);

        uint256 nonce = _deviceNonces[deviceId];

        bytes32 structHash = keccak256(abi.encode(_ANCHOR_TYPEHASH, deviceId, dataHash, nonce));
        bytes32 digest = _hashTypedDataV4(structHash);

        address signer = _getDeviceSigner(deviceId);
        if (!SignatureChecker.isValidSignatureNow(signer, digest, signature)) {
            revert InvalidSignature();
        }

        _deviceNonces[deviceId]++;
        _anchors[dataHash] = Anchor({
            deviceId: deviceId,
            timestamp: block.timestamp,
            blockNumber: block.number
        });
        _deviceAnchorCounts[deviceId]++;

        emit DataAnchored(deviceId, dataHash, block.timestamp, nonce);
        _onSignedDataAnchored(deviceId, dataHash);
    }

    /**
     * @notice Anchors a batch of data hashes using an EIP-712 signature.
     * @param deviceId The device that produced the data.
     * @param dataHashes Array of data hashes.
     * @param signature EIP-712 signature from the device's authorized signer.
     */
    function anchorBatchSigned(
        uint256 deviceId,
        bytes32[] calldata dataHashes,
        bytes calldata signature
    ) external {
        if (dataHashes.length == 0) revert EmptyBatch();

        bytes32 batchRoot = keccak256(abi.encodePacked(dataHashes));
        if (_anchors[batchRoot].timestamp != 0) revert AlreadyAnchored(batchRoot);

        uint256 nonce = _deviceNonces[deviceId];

        bytes32 structHash = keccak256(
            abi.encode(_BATCH_TYPEHASH, deviceId, batchRoot, dataHashes.length, nonce)
        );
        bytes32 digest = _hashTypedDataV4(structHash);

        address signer = _getDeviceSigner(deviceId);
        if (!SignatureChecker.isValidSignatureNow(signer, digest, signature)) {
            revert InvalidSignature();
        }

        _deviceNonces[deviceId]++;
        _anchors[batchRoot] = Anchor({
            deviceId: deviceId,
            timestamp: block.timestamp,
            blockNumber: block.number
        });
        _deviceAnchorCounts[deviceId]++;

        emit BatchAnchored(deviceId, batchRoot, dataHashes.length, block.timestamp);
        _onSignedDataAnchored(deviceId, batchRoot);
    }

    // ──────────────────────────────────────────────
    //  View functions
    // ──────────────────────────────────────────────

    /// @inheritdoc IDataAnchor
    function isAnchored(bytes32 dataHash) external view returns (bool) {
        return _anchors[dataHash].timestamp != 0;
    }

    /// @inheritdoc IDataAnchor
    function getAnchor(bytes32 dataHash)
        external view returns (uint256 deviceId, uint256 timestamp, uint256 blockNumber)
    {
        Anchor storage a = _anchors[dataHash];
        if (a.timestamp == 0) revert AnchorNotFound(dataHash);
        return (a.deviceId, a.timestamp, a.blockNumber);
    }

    /// @inheritdoc IDataAnchor
    function deviceAnchorCount(uint256 deviceId) external view returns (uint256) {
        return _deviceAnchorCounts[deviceId];
    }

    /// @inheritdoc IDataAnchor
    function deviceNonce(uint256 deviceId) external view returns (uint256) {
        return _deviceNonces[deviceId];
    }

    /// @notice Returns the EIP-712 domain separator (useful for off-chain signing).
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /// @notice Returns the anchor typehash for single anchoring.
    function ANCHOR_TYPEHASH() external pure returns (bytes32) {
        return _ANCHOR_TYPEHASH;
    }

    /// @notice Returns the batch typehash for batch anchoring.
    function BATCH_TYPEHASH() external pure returns (bytes32) {
        return _BATCH_TYPEHASH;
    }

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    error InvalidSignature();

    // ──────────────────────────────────────────────
    //  Virtual hooks
    // ──────────────────────────────────────────────

    /**
     * @dev Override to return the authorized signer address for a device.
     *      Could be the device NFT owner, a dedicated device key, or a
     *      smart contract wallet.
     */
    function _getDeviceSigner(uint256 deviceId) internal view virtual returns (address);

    /**
     * @dev Hook called after signed data is anchored. Override to integrate
     *      with Sentinel modules. Default is a no-op.
     */
    function _onSignedDataAnchored(uint256 deviceId, bytes32 dataHash) internal virtual {
        // solhint-disable-next-line no-empty-blocks
    }
}
