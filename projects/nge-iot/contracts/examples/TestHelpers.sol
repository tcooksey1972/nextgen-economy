// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

// Force compilation of OpenZeppelin contracts needed by tests.
// These imports ensure artifacts are generated for proxy and access manager.
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "@openzeppelin/contracts/access/manager/AccessManager.sol";
