// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

/**
 * @title EnumerableGuardians
 * @author Cloud Creations LLC — NextGen Economy
 * @notice Abstract mixin providing O(1) enumerable guardian/validator set
 *         management using OpenZeppelin's EnumerableSet.
 *
 * The base BreakGlass contract uses a simple mapping for guardians, which
 * provides O(1) lookup but no enumeration. This mixin adds:
 *   - O(1) add / remove / contains
 *   - O(n) enumeration of all members
 *   - On-chain count without separate counter
 *
 * Useful for:
 *   - Guardian sets in BreakGlass
 *   - Validator sets for data validation staking
 *   - Device whitelists / operator sets
 *   - Any role-based set that needs enumeration
 *
 * @dev This is a standalone mixin, not tied to BreakGlass. It provides a
 *      generic enumerable address set with admin authorization hooks.
 */
abstract contract EnumerableGuardians {
    using EnumerableSet for EnumerableSet.AddressSet;

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    event MemberAdded(bytes32 indexed setId, address indexed member);
    event MemberRemoved(bytes32 indexed setId, address indexed member);

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    error MemberAlreadyExists(bytes32 setId, address member);
    error MemberNotFound(bytes32 setId, address member);

    // ──────────────────────────────────────────────
    //  Storage
    // ──────────────────────────────────────────────

    /// @dev Maps set name hash → enumerable address set.
    mapping(bytes32 => EnumerableSet.AddressSet) private _sets;

    // ──────────────────────────────────────────────
    //  Internal functions
    // ──────────────────────────────────────────────

    /**
     * @dev Adds a member to a named set. Reverts if already present.
     */
    function _addMember(bytes32 setId, address member) internal {
        if (!_sets[setId].add(member)) revert MemberAlreadyExists(setId, member);
        emit MemberAdded(setId, member);
    }

    /**
     * @dev Removes a member from a named set. Reverts if not present.
     */
    function _removeMember(bytes32 setId, address member) internal {
        if (!_sets[setId].remove(member)) revert MemberNotFound(setId, member);
        emit MemberRemoved(setId, member);
    }

    /**
     * @dev Returns true if the address is in the named set.
     */
    function _isMember(bytes32 setId, address member) internal view returns (bool) {
        return _sets[setId].contains(member);
    }

    /**
     * @dev Returns the number of members in a named set.
     */
    function _memberCount(bytes32 setId) internal view returns (uint256) {
        return _sets[setId].length();
    }

    /**
     * @dev Returns the member at a specific index in a named set.
     */
    function _memberAt(bytes32 setId, uint256 index) internal view returns (address) {
        return _sets[setId].at(index);
    }

    // ──────────────────────────────────────────────
    //  External view functions
    // ──────────────────────────────────────────────

    /**
     * @notice Returns true if the address is a member of the named set.
     */
    function isMember(bytes32 setId, address member) external view returns (bool) {
        return _sets[setId].contains(member);
    }

    /**
     * @notice Returns the number of members in a named set.
     */
    function memberCount(bytes32 setId) external view returns (uint256) {
        return _sets[setId].length();
    }

    /**
     * @notice Returns the member at a specific index.
     */
    function memberAt(bytes32 setId, uint256 index) external view returns (address) {
        return _sets[setId].at(index);
    }

    /**
     * @notice Returns all members of a named set.
     * @dev Gas-intensive — use for off-chain reads only.
     */
    function members(bytes32 setId) external view returns (address[] memory) {
        return _sets[setId].values();
    }
}
