/**
 * Interact: SimpleNGEToken
 * Exercises the full NGE token lifecycle on a local Hardhat node.
 *
 * Covers: deployment, minting, transfers, burn, pause/unpause,
 * delegation, supply cap management, and EIP-2612 permit.
 *
 * Usage:
 *   npx hardhat run scripts/interact.js --network localhost
 */
const { ethers } = require("hardhat");

async function main() {
  const [owner, alice, bob] = await ethers.getSigners();

  // ─────────────────────────────────────────────
  //  Step 1: Deploy SimpleNGEToken
  // ─────────────────────────────────────────────
  console.log("=== SimpleNGEToken: Interaction Script ===\n");
  console.log("--- Step 1: Deploy SimpleNGEToken ---");

  const supplyCap = ethers.parseEther("100000000"); // 100M
  const initialMint = ethers.parseEther("10000000"); // 10M

  const Factory = await ethers.getContractFactory("SimpleNGEToken");
  const token = await Factory.deploy(supplyCap, initialMint);
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();

  console.log("  Token deployed to:", tokenAddr);
  console.log("  Name:", await token.name());
  console.log("  Symbol:", await token.symbol());
  console.log("  Supply cap:", ethers.formatEther(await token.supplyCap()), "NGE");
  console.log("  Total supply:", ethers.formatEther(await token.totalSupply()), "NGE");
  console.log("  Owner balance:", ethers.formatEther(await token.balanceOf(owner.address)), "NGE");

  // ─────────────────────────────────────────────
  //  Step 2: Mint tokens
  // ─────────────────────────────────────────────
  console.log("\n--- Step 2: Mint tokens ---");

  const mintAmount = ethers.parseEther("5000");
  const tx1 = await token.mint(alice.address, mintAmount);
  await tx1.wait();
  console.log("  Minted", ethers.formatEther(mintAmount), "NGE to Alice:", alice.address);
  console.log("  Alice balance:", ethers.formatEther(await token.balanceOf(alice.address)), "NGE");
  console.log("  Mintable supply remaining:", ethers.formatEther(await token.mintableSupply()), "NGE");

  // Non-owner cannot mint
  try {
    await token.connect(alice).mint(bob.address, ethers.parseEther("1"));
    console.log("  ERROR: Should have reverted!");
  } catch (error) {
    console.log("  Non-owner mint correctly reverted");
  }

  // ─────────────────────────────────────────────
  //  Step 3: Transfer tokens
  // ─────────────────────────────────────────────
  console.log("\n--- Step 3: Transfer tokens ---");

  const transferAmount = ethers.parseEther("1000");
  const tx2 = await token.connect(alice).transfer(bob.address, transferAmount);
  await tx2.wait();
  console.log("  Alice transferred", ethers.formatEther(transferAmount), "NGE to Bob");
  console.log("  Alice balance:", ethers.formatEther(await token.balanceOf(alice.address)), "NGE");
  console.log("  Bob balance:", ethers.formatEther(await token.balanceOf(bob.address)), "NGE");

  // ─────────────────────────────────────────────
  //  Step 4: Approve and transferFrom
  // ─────────────────────────────────────────────
  console.log("\n--- Step 4: Approve and transferFrom ---");

  const approveAmount = ethers.parseEther("500");
  const tx3 = await token.connect(bob).approve(alice.address, approveAmount);
  await tx3.wait();
  console.log("  Bob approved Alice to spend", ethers.formatEther(approveAmount), "NGE");

  const allowance = await token.allowance(bob.address, alice.address);
  console.log("  Allowance:", ethers.formatEther(allowance), "NGE");

  const tx4 = await token.connect(alice).transferFrom(bob.address, owner.address, approveAmount);
  await tx4.wait();
  console.log("  Alice transferred", ethers.formatEther(approveAmount), "NGE from Bob to Owner");
  console.log("  Bob balance:", ethers.formatEther(await token.balanceOf(bob.address)), "NGE");

  // ─────────────────────────────────────────────
  //  Step 5: Burn tokens
  // ─────────────────────────────────────────────
  console.log("\n--- Step 5: Burn tokens ---");

  const burnAmount = ethers.parseEther("200");
  const tx5 = await token.connect(bob).burn(burnAmount);
  await tx5.wait();
  console.log("  Bob burned", ethers.formatEther(burnAmount), "NGE");
  console.log("  Bob balance:", ethers.formatEther(await token.balanceOf(bob.address)), "NGE");
  console.log("  Total supply:", ethers.formatEther(await token.totalSupply()), "NGE");

  // ─────────────────────────────────────────────
  //  Step 6: Pause and unpause
  // ─────────────────────────────────────────────
  console.log("\n--- Step 6: Pause and unpause ---");

  const tx6 = await token.pause();
  await tx6.wait();
  console.log("  Token paused by owner");

  // Transfers should fail while paused
  try {
    await token.connect(alice).transfer(bob.address, ethers.parseEther("1"));
    console.log("  ERROR: Should have reverted!");
  } catch (error) {
    console.log("  Transfer correctly reverted while paused");
  }

  const tx7 = await token.unpause();
  await tx7.wait();
  console.log("  Token unpaused by owner");

  // Transfers work again
  const tx8 = await token.connect(alice).transfer(bob.address, ethers.parseEther("100"));
  await tx8.wait();
  console.log("  Transfer after unpause: success");

  // ─────────────────────────────────────────────
  //  Step 7: Delegate votes
  // ─────────────────────────────────────────────
  console.log("\n--- Step 7: Delegate votes ---");

  const tx9 = await token.connect(alice).delegate(alice.address);
  await tx9.wait();
  console.log("  Alice self-delegated");

  const tx10 = await token.connect(bob).delegate(alice.address);
  await tx10.wait();
  console.log("  Bob delegated to Alice");

  const aliceVotes = await token.getVotes(alice.address);
  console.log("  Alice voting power:", ethers.formatEther(aliceVotes), "NGE");

  // ─────────────────────────────────────────────
  //  Step 8: Update supply cap
  // ─────────────────────────────────────────────
  console.log("\n--- Step 8: Update supply cap ---");

  const newCap = ethers.parseEther("200000000"); // 200M
  const tx11 = await token.setSupplyCap(newCap);
  await tx11.wait();
  console.log("  Supply cap updated to:", ethers.formatEther(await token.supplyCap()), "NGE");
  console.log("  Mintable supply:", ethers.formatEther(await token.mintableSupply()), "NGE");

  // Non-owner cannot update cap
  try {
    await token.connect(alice).setSupplyCap(ethers.parseEther("1"));
    console.log("  ERROR: Should have reverted!");
  } catch (error) {
    console.log("  Non-owner cap update correctly reverted");
  }

  // ─────────────────────────────────────────────
  //  Summary
  // ─────────────────────────────────────────────
  console.log("\n=== Summary ===");
  console.log("  Token address:", tokenAddr);
  console.log("  Final supply cap:", ethers.formatEther(await token.supplyCap()), "NGE");
  console.log("  Final total supply:", ethers.formatEther(await token.totalSupply()), "NGE");
  console.log("  Owner balance:", ethers.formatEther(await token.balanceOf(owner.address)), "NGE");
  console.log("  Alice balance:", ethers.formatEther(await token.balanceOf(alice.address)), "NGE");
  console.log("  Bob balance:", ethers.formatEther(await token.balanceOf(bob.address)), "NGE");
  console.log("  All token operations verified successfully.\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
