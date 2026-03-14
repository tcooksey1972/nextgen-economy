/**
 * @file test.js
 * @description Standalone test runner for NGEToken contracts.
 *
 * Uses pre-compiled artifacts from compile.js and runs tests against
 * a local JSON-RPC node (Hardhat or Anvil).
 *
 * Prerequisites:
 *   1. Compile first:  node scripts/compile.js
 *   2. Start a node:   npx hardhat node  (in a separate terminal)
 *   3. Run tests:      node scripts/test.js
 *
 * @usage node scripts/test.js
 */
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const assert = (condition, msg) => {
  if (!condition) throw new Error(`ASSERTION FAILED: ${msg}`);
};

const ARTIFACTS_DIR = path.join(__dirname, "..", "artifacts");

function loadArtifact(sourcePath, contractName) {
  const file = path.join(ARTIFACTS_DIR, sourcePath, `${contractName}.json`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

async function main() {
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");

  const accounts = await provider.listAccounts();
  if (accounts.length < 4) {
    console.error("Need at least 4 accounts. Start a hardhat/anvil node.");
    process.exit(1);
  }

  const [owner, alice, bob, attacker] = accounts;

  const simpleArtifact = loadArtifact(
    "examples/SimpleNGEToken.sol",
    "SimpleNGEToken"
  );
  const sentinelArtifact = loadArtifact(
    "examples/SentinelNGEToken.sol",
    "SentinelNGEToken"
  );

  const SUPPLY_CAP = ethers.parseEther("100000000");    // 100M
  const INITIAL_MINT = ethers.parseEther("10000000");    // 10M
  const MINT_AMOUNT = ethers.parseEther("5000");
  const TRANSFER_AMOUNT = ethers.parseEther("1000");
  const BURN_AMOUNT = ethers.parseEther("1000");
  const TRANSFER_LIMIT = ethers.parseEther("10000");
  const LARGE_THRESHOLD = ethers.parseEther("5000");

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  \u2713 ${name}`);
      passed++;
    } catch (err) {
      console.log(`  \u2717 ${name}`);
      console.log(`    ${err.message.split("\n")[0]}`);
      failed++;
    }
  }

  async function deploySimple(cap = SUPPLY_CAP, mint = INITIAL_MINT) {
    const factory = new ethers.ContractFactory(
      simpleArtifact.abi,
      simpleArtifact.bytecode,
      owner
    );
    const token = await factory.deploy(cap, mint);
    await token.waitForDeployment();
    return token;
  }

  async function deploySentinel() {
    const factory = new ethers.ContractFactory(
      sentinelArtifact.abi,
      sentinelArtifact.bytecode,
      owner
    );
    const token = await factory.deploy(SUPPLY_CAP, INITIAL_MINT, TRANSFER_LIMIT, LARGE_THRESHOLD);
    await token.waitForDeployment();
    return token;
  }

  // ═══════════════════════════════════════════
  //  SimpleNGEToken — Deployment
  // ═══════════════════════════════════════════
  console.log("\n  SimpleNGEToken — Deployment");

  await test("sets correct name and symbol", async () => {
    const token = await deploySimple();
    assert((await token.name()) === "NextGen Economy", "wrong name");
    assert((await token.symbol()) === "NGE", "wrong symbol");
  });

  await test("mints initial supply to deployer", async () => {
    const token = await deploySimple();
    const balance = await token.balanceOf(owner.address);
    assert(balance === INITIAL_MINT, "wrong balance");
    assert((await token.totalSupply()) === INITIAL_MINT, "wrong totalSupply");
  });

  await test("sets supply cap", async () => {
    const token = await deploySimple();
    assert((await token.supplyCap()) === SUPPLY_CAP, "wrong cap");
  });

  await test("reports mintable supply", async () => {
    const token = await deploySimple();
    const mintable = await token.mintableSupply();
    assert(mintable === SUPPLY_CAP - INITIAL_MINT, "wrong mintable");
  });

  // ═══════════════════════════════════════════
  //  SimpleNGEToken — Minting
  // ═══════════════════════════════════════════
  console.log("\n  SimpleNGEToken — Minting");

  await test("owner can mint tokens", async () => {
    const token = await deploySimple();
    await (await token.mint(alice.address, MINT_AMOUNT)).wait();
    assert((await token.balanceOf(alice.address)) === MINT_AMOUNT, "wrong balance");
  });

  await test("non-owner cannot mint", async () => {
    const token = await deploySimple();
    try {
      await token.connect(attacker).mint(attacker.address, MINT_AMOUNT);
      assert(false, "should revert");
    } catch (e) {
      assert(e.message.includes("revert") || e.code === "CALL_EXCEPTION", "wrong error");
    }
  });

  await test("minting beyond cap reverts", async () => {
    const token = await deploySimple();
    const remaining = SUPPLY_CAP - INITIAL_MINT;
    try {
      await token.mint(alice.address, remaining + 1n);
      assert(false, "should revert");
    } catch (e) {
      assert(e.message.includes("revert") || e.code === "CALL_EXCEPTION", "wrong error");
    }
  });

  await test("minting exactly to cap succeeds", async () => {
    const token = await deploySimple();
    const remaining = SUPPLY_CAP - INITIAL_MINT;
    await (await token.mint(alice.address, remaining)).wait();
    assert((await token.totalSupply()) === SUPPLY_CAP, "should be at cap");
    assert((await token.mintableSupply()) === 0n, "mintable should be 0");
  });

  // ═══════════════════════════════════════════
  //  SimpleNGEToken — Burning
  // ═══════════════════════════════════════════
  console.log("\n  SimpleNGEToken — Burning");

  await test("holders can burn their tokens", async () => {
    const token = await deploySimple();
    await (await token.burn(BURN_AMOUNT)).wait();
    assert((await token.balanceOf(owner.address)) === INITIAL_MINT - BURN_AMOUNT, "wrong balance");
    assert((await token.totalSupply()) === INITIAL_MINT - BURN_AMOUNT, "wrong supply");
  });

  await test("burning increases mintable supply", async () => {
    const token = await deploySimple();
    const mintableBefore = await token.mintableSupply();
    await (await token.burn(BURN_AMOUNT)).wait();
    assert((await token.mintableSupply()) === mintableBefore + BURN_AMOUNT, "mintable not updated");
  });

  // ═══════════════════════════════════════════
  //  SimpleNGEToken — Pause
  // ═══════════════════════════════════════════
  console.log("\n  SimpleNGEToken — Pause / Unpause");

  await test("owner can pause", async () => {
    const token = await deploySimple();
    await (await token.pause()).wait();
    assert(await token.paused(), "should be paused");
  });

  await test("transfers blocked when paused", async () => {
    const token = await deploySimple();
    await (await token.transfer(alice.address, TRANSFER_AMOUNT)).wait();
    await (await token.pause()).wait();
    try {
      await token.connect(alice).transfer(bob.address, TRANSFER_AMOUNT);
      assert(false, "should revert");
    } catch (e) {
      assert(e.message.includes("revert") || e.code === "CALL_EXCEPTION", "wrong error");
    }
  });

  await test("unpause resumes transfers", async () => {
    const token = await deploySimple();
    await (await token.transfer(alice.address, TRANSFER_AMOUNT)).wait();
    await (await token.pause()).wait();
    await (await token.unpause()).wait();
    await (await token.connect(alice).transfer(bob.address, TRANSFER_AMOUNT)).wait();
    assert((await token.balanceOf(bob.address)) === TRANSFER_AMOUNT, "wrong balance");
  });

  // ═══════════════════════════════════════════
  //  SimpleNGEToken — ERC-20 Transfers
  // ═══════════════════════════════════════════
  console.log("\n  SimpleNGEToken — ERC-20 Transfers");

  await test("transfers between accounts", async () => {
    const token = await deploySimple();
    await (await token.transfer(alice.address, TRANSFER_AMOUNT)).wait();
    assert((await token.balanceOf(alice.address)) === TRANSFER_AMOUNT, "wrong alice balance");
    assert((await token.balanceOf(owner.address)) === INITIAL_MINT - TRANSFER_AMOUNT, "wrong owner balance");
  });

  await test("approve and transferFrom", async () => {
    const token = await deploySimple();
    await (await token.approve(alice.address, TRANSFER_AMOUNT)).wait();
    assert((await token.allowance(owner.address, alice.address)) === TRANSFER_AMOUNT, "wrong allowance");
    await (await token.connect(alice).transferFrom(owner.address, bob.address, TRANSFER_AMOUNT)).wait();
    assert((await token.balanceOf(bob.address)) === TRANSFER_AMOUNT, "wrong bob balance");
  });

  // ═══════════════════════════════════════════
  //  SimpleNGEToken — Governance Voting
  // ═══════════════════════════════════════════
  console.log("\n  SimpleNGEToken — Governance Voting");

  await test("zero voting power before delegation", async () => {
    const token = await deploySimple();
    assert((await token.getVotes(owner.address)) === 0n, "should be 0");
  });

  await test("self-delegation activates voting power", async () => {
    const token = await deploySimple();
    await (await token.delegate(owner.address)).wait();
    assert((await token.getVotes(owner.address)) === INITIAL_MINT, "wrong votes");
  });

  await test("delegation follows transfers", async () => {
    const token = await deploySimple();
    await (await token.delegate(owner.address)).wait();
    const amount = ethers.parseEther("3000");
    await (await token.transfer(alice.address, amount)).wait();
    await (await token.connect(alice).delegate(alice.address)).wait();
    assert((await token.getVotes(owner.address)) === INITIAL_MINT - amount, "wrong owner votes");
    assert((await token.getVotes(alice.address)) === amount, "wrong alice votes");
  });

  // ═══════════════════════════════════════════
  //  SimpleNGEToken — Supply Cap Management
  // ═══════════════════════════════════════════
  console.log("\n  SimpleNGEToken — Supply Cap Management");

  await test("owner can increase cap", async () => {
    const token = await deploySimple();
    const newCap = ethers.parseEther("200000000");
    await (await token.setSupplyCap(newCap)).wait();
    assert((await token.supplyCap()) === newCap, "wrong cap");
  });

  await test("cap below supply reverts", async () => {
    const token = await deploySimple();
    try {
      await token.setSupplyCap(INITIAL_MINT - 1n);
      assert(false, "should revert");
    } catch (e) {
      assert(e.message.includes("revert") || e.code === "CALL_EXCEPTION", "wrong error");
    }
  });

  await test("set cap to 0 (unlimited)", async () => {
    const token = await deploySimple();
    await (await token.setSupplyCap(0)).wait();
    assert((await token.supplyCap()) === 0n, "wrong cap");
  });

  // ═══════════════════════════════════════════
  //  SentinelNGEToken — Transfer Limit
  // ═══════════════════════════════════════════
  console.log("\n  SentinelNGEToken — Transfer Limit");

  await test("allows transfer under limit", async () => {
    const token = await deploySentinel();
    await (await token.transfer(alice.address, LARGE_THRESHOLD)).wait();
    assert((await token.balanceOf(alice.address)) === LARGE_THRESHOLD, "wrong balance");
  });

  await test("allows transfer at exact limit", async () => {
    const token = await deploySentinel();
    await (await token.transfer(alice.address, TRANSFER_LIMIT)).wait();
    assert((await token.balanceOf(alice.address)) === TRANSFER_LIMIT, "wrong balance");
  });

  await test("reverts transfer exceeding limit", async () => {
    const token = await deploySentinel();
    try {
      await token.transfer(alice.address, TRANSFER_LIMIT + 1n);
      assert(false, "should revert");
    } catch (e) {
      assert(e.message.includes("revert") || e.code === "CALL_EXCEPTION", "wrong error");
    }
  });

  await test("limit does not apply to minting", async () => {
    const token = await deploySentinel();
    const overLimit = TRANSFER_LIMIT + ethers.parseEther("1");
    await (await token.mint(alice.address, overLimit)).wait();
    assert((await token.balanceOf(alice.address)) === overLimit, "should succeed");
  });

  await test("limit does not apply to burning", async () => {
    const token = await deploySentinel();
    const overLimit = TRANSFER_LIMIT + ethers.parseEther("1");
    await (await token.burn(overLimit)).wait();
    assert((await token.balanceOf(owner.address)) === INITIAL_MINT - overLimit, "should succeed");
  });

  await test("owner can update transfer limit", async () => {
    const token = await deploySentinel();
    const newLimit = ethers.parseEther("50000");
    await (await token.setTransferLimit(newLimit)).wait();
    assert((await token.transferLimit()) === newLimit, "wrong limit");
  });

  await test("disabling limit allows any amount", async () => {
    const token = await deploySentinel();
    await (await token.setTransferLimit(0)).wait();
    const huge = ethers.parseEther("5000000");
    await (await token.transfer(alice.address, huge)).wait();
    assert((await token.balanceOf(alice.address)) === huge, "wrong balance");
  });

  // ═══════════════════════════════════════════
  //  SentinelNGEToken — Integration
  // ═══════════════════════════════════════════
  console.log("\n  SentinelNGEToken — Integration");

  await test("full flow: mint, transfer, delegate, burn", async () => {
    const token = await deploySentinel();
    const amount = ethers.parseEther("1000");

    // Mint to alice
    await (await token.mint(alice.address, amount)).wait();

    // Alice delegates
    await (await token.connect(alice).delegate(alice.address)).wait();
    assert((await token.getVotes(alice.address)) === amount, "wrong votes");

    // Alice transfers to bob
    await (await token.connect(alice).transfer(bob.address, amount)).wait();
    assert((await token.balanceOf(bob.address)) === amount, "wrong bob balance");

    // Bob burns
    await (await token.connect(bob).burn(amount)).wait();
    assert((await token.balanceOf(bob.address)) === 0n, "bob should be 0");
  });

  await test("pause blocks sentinel-secured transfers", async () => {
    const token = await deploySentinel();
    await (await token.transfer(alice.address, ethers.parseEther("100"))).wait();
    await (await token.pause()).wait();
    let reverted = false;
    try {
      await token.connect(alice).transfer(bob.address, ethers.parseEther("50"));
    } catch (e) {
      reverted = true;
    }
    assert(reverted, "transfer should revert when paused");
    assert(await token.paused(), "should still be paused");
  });

  await test("unpause resumes sentinel-secured transfers", async () => {
    const token = await deploySentinel();
    await (await token.transfer(alice.address, ethers.parseEther("200"))).wait();
    await (await token.pause()).wait();
    await (await token.unpause()).wait();
    await (await token.connect(alice).transfer(bob.address, ethers.parseEther("100"))).wait();
    assert((await token.balanceOf(bob.address)) === ethers.parseEther("100"), "wrong balance");
  });

  // ═══════════════════════════════════════════
  //  Summary
  // ═══════════════════════════════════════════
  console.log(`\n  ${passed} passing, ${failed} failing\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
