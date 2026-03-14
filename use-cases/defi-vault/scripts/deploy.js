/**
 * Deploy: DeFi Sentinel Vault
 *
 * Usage:
 *   npx hardhat run defi-vault/scripts/deploy.js --network localhost
 *   npx hardhat run defi-vault/scripts/deploy.js --network sepolia
 */
const { ethers } = require("hardhat");

async function main() {
  const [deployer, guardian1, guardian2, guardian3, guardian4, guardian5] = await ethers.getSigners();

  console.log("=== DeFi Sentinel Vault ===");
  console.log("Deployer:", deployer.address);

  // Use test addresses for guardians (on localhost, use signers; on testnet, configure your own)
  const guardians = [
    guardian1?.address || "0x0000000000000000000000000000000000000001",
    guardian2?.address || "0x0000000000000000000000000000000000000002",
    guardian3?.address || "0x0000000000000000000000000000000000000003",
    guardian4?.address || "0x0000000000000000000000000000000000000004",
    guardian5?.address || "0x0000000000000000000000000000000000000005",
  ];

  const config = {
    heartbeatInterval: 3 * 24 * 60 * 60,         // 3 days
    gracePeriod: 1 * 24 * 60 * 60,               // 1 day
    recoveryAddress: guardians[0],
    rateLimitMax: ethers.parseEther("50"),        // 50 ETH per window
    rateLimitWindow: 24 * 60 * 60,               // 24 hours
    guardians: guardians,
    guardianThreshold: 3,                         // 3-of-5
    emergencyDelay: 48 * 60 * 60,                // 48 hours
    largeTransferThreshold: ethers.parseEther("10"), // Alert on 10+ ETH
    rapidActivityThreshold: 5,                    // 5 transfers
    rapidActivityWindow: 60 * 60,                 // 1 hour
  };

  console.log("\nConfiguration:");
  console.log("  Heartbeat interval: 3 days");
  console.log("  Grace period: 1 day");
  console.log("  Rate limit: 50 ETH / 24 hours");
  console.log("  Guardians: 5 (threshold: 3-of-5)");
  console.log("  Emergency delay: 48 hours");
  console.log("  Large transfer alert: 10 ETH");
  console.log("  Rapid activity: 5 transfers / 1 hour");

  const Factory = await ethers.getContractFactory("DeFiSentinelVault");
  const vault = await Factory.deploy(config);
  await vault.waitForDeployment();
  const address = await vault.getAddress();

  console.log("\n  DeFiSentinelVault deployed to:", address);

  // Fund the vault with some test ETH
  const fundAmount = ethers.parseEther("100");
  await deployer.sendTransaction({ to: address, value: fundAmount });
  console.log("  Funded with:", ethers.formatEther(fundAmount), "ETH");

  console.log("\n  Try these commands:");
  console.log(`    # Check in (heartbeat)`);
  console.log(`    cast send ${address} "checkIn()" --private-key <KEY>`);
  console.log(`    # Withdraw (rate-limited)`);
  console.log(`    cast send ${address} "withdraw(address,uint256)" <TO> 1000000000000000000 --private-key <KEY>`);
  console.log(`    # Check remaining rate limit`);
  console.log(`    cast call ${address} "currentWindowRemaining()"`);
}

main().catch((error) => { console.error(error); process.exit(1); });
