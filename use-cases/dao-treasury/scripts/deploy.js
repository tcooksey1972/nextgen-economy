/**
 * Deploy: DAO Treasury
 *
 * Usage:
 *   npx hardhat run dao-treasury/scripts/deploy.js --network localhost
 *   npx hardhat run dao-treasury/scripts/deploy.js --network sepolia
 */
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("=== DAO Treasury ===");
  console.log("Deployer:", deployer.address);

  const treasury = await (await ethers.getContractFactory("DAOTreasury")).deploy(
    500,                          // maxWithdrawBps: 5% of balance per window
    24 * 60 * 60,                 // rateLimitWindow: 24 hours
    7 * 24 * 60 * 60,             // heartbeatInterval: 7 days
    ethers.parseEther("10"),      // largeTransferThreshold: 10 ETH
    2 * 24 * 60 * 60              // proposalDelay: 2 days
  );
  await treasury.waitForDeployment();
  const address = await treasury.getAddress();

  console.log("\n  DAOTreasury deployed to:", address);
  console.log("  Rate limit: 5% of balance per 24 hours");
  console.log("  Heartbeat: 7 days");
  console.log("  Proposal delay: 2 days");

  // Fund
  await deployer.sendTransaction({ to: address, value: ethers.parseEther("50") });
  console.log("  Funded with: 50 ETH");

  console.log("\n  Try these commands:");
  console.log(`    # Propose spending`);
  console.log(`    cast send ${address} "proposeSpending(address,uint256,string)" <TO> 1000000000000000000 "Marketing budget" --private-key <KEY>`);
  console.log(`    # Check remaining rate limit`);
  console.log(`    cast call ${address} "currentWindowRemaining()"`);
}

main().catch((error) => { console.error(error); process.exit(1); });
