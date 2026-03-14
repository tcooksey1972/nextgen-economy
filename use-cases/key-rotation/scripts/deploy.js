/**
 * Deploy: Recoverable Vault (Emergency Key Rotation)
 *
 * Usage:
 *   npx hardhat run key-rotation/scripts/deploy.js --network localhost
 *   npx hardhat run key-rotation/scripts/deploy.js --network sepolia
 */
const { ethers } = require("hardhat");

async function main() {
  const [deployer, g1, g2, g3, g4, g5] = await ethers.getSigners();

  console.log("=== Recoverable Vault (Key Rotation) ===");
  console.log("Deployer / Owner:", deployer.address);

  const guardians = [
    g1?.address || "0x0000000000000000000000000000000000000001",
    g2?.address || "0x0000000000000000000000000000000000000002",
    g3?.address || "0x0000000000000000000000000000000000000003",
    g4?.address || "0x0000000000000000000000000000000000000004",
    g5?.address || "0x0000000000000000000000000000000000000005",
  ];

  const vault = await (await ethers.getContractFactory("RecoverableVault")).deploy(
    guardians,
    3,                    // threshold: 3-of-5
    48 * 60 * 60          // executionDelay: 48 hours
  );
  await vault.waitForDeployment();
  const address = await vault.getAddress();

  console.log("\n  RecoverableVault deployed to:", address);
  console.log("  Guardians:", guardians.length, "(threshold: 3-of-5)");
  console.log("  Execution delay: 48 hours");

  // Fund
  await deployer.sendTransaction({ to: address, value: ethers.parseEther("10") });
  console.log("  Funded with: 10 ETH");

  console.log("\n  Recovery flow:");
  console.log("    1. Guardian proposes: proposeRecovery(newOwnerAddress)");
  console.log("    2. Two more guardians approve: approve(proposalId)");
  console.log("    3. Wait 48 hours");
  console.log("    4. Anyone executes: execute(proposalId)");
  console.log("    5. New owner calls: unpause()");
}

main().catch((error) => { console.error(error); process.exit(1); });
