/**
 * @file test.js
 * @description Standalone test runner for the DeadManSwitch + SentinelVault contracts.
 *
 * Why this exists: When Hardhat can't download the native solc compiler
 * (network-restricted environments), `npx hardhat test` won't work. This
 * script reads pre-compiled artifacts from compile.js and runs tests against
 * a local JSON-RPC node (Hardhat or Anvil).
 *
 * Prerequisites:
 *   1. Compile first:  node scripts/compile.js
 *   2. Start a node:   npx hardhat node  (in a separate terminal)
 *   3. Run tests:      node scripts/test.js
 *
 * @usage node scripts/test.js
 * @see scripts/compile.js — produces the artifacts consumed here
 */
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

/**
 * Lightweight assertion helper. Throws on failure with a descriptive message.
 * Used instead of Chai since this runner is independent of Hardhat's test framework.
 *
 * @param {boolean} condition - Condition to assert
 * @param {string} msg - Error message if assertion fails
 */
const assert = (condition, msg) => {
  if (!condition) throw new Error(`ASSERTION FAILED: ${msg}`);
};

const ARTIFACTS_DIR = path.join(__dirname, "..", "artifacts");

/**
 * Loads a compiled contract artifact (ABI + bytecode) from the artifacts directory.
 *
 * @param {string} sourcePath - Relative path to the source file (e.g., "examples/SentinelVault.sol")
 * @param {string} contractName - Contract name (e.g., "SentinelVault")
 * @returns {{ abi: object[], bytecode: string, contractName: string }} Artifact object
 */
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

  const [owner, recovery, attacker, newRecovery] = accounts;
  const artifact = loadArtifact("examples/SentinelVault.sol", "SentinelVault");

  const HEARTBEAT = 30 * 24 * 60 * 60; // 30 days in seconds
  const GRACE = 7 * 24 * 60 * 60; // 7 days in seconds

  let passed = 0;
  let failed = 0;

  /**
   * Runs a single named test. Catches errors and tracks pass/fail counts.
   * @param {string} name - Test description
   * @param {Function} fn - Async test function
   */
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

  /**
   * Deploys a fresh SentinelVault instance. Each test gets its own vault
   * for isolation (no shared state between tests).
   * @param {number} [hb=HEARTBEAT] - Heartbeat interval in seconds
   * @param {number} [gp=GRACE] - Grace period in seconds
   * @param {string} [rec=recovery.address] - Recovery address
   * @returns {Promise<ethers.Contract>} Deployed SentinelVault contract
   */
  async function deploy(hb = HEARTBEAT, gp = GRACE, rec = recovery.address) {
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, owner);
    const vault = await factory.deploy(hb, gp, rec);
    await vault.waitForDeployment();
    return vault;
  }

  /**
   * Advances the blockchain time by the given number of seconds and mines
   * a new block. Used to simulate the passage of time for heartbeat tests.
   * @param {number} seconds - Number of seconds to advance
   */
  async function increaseTime(seconds) {
    await provider.send("evm_increaseTime", [seconds]);
    await provider.send("evm_mine", []);
  }

  // ═══════════════════════════════════════════
  //  Deployment
  // ═══════════════════════════════════════════
  console.log("\n  Deployment");

  await test("sets owner, heartbeat, grace, recovery correctly", async () => {
    const v = await deploy();
    assert((await v.owner()) === owner.address, "wrong owner");
    assert(Number(await v.heartbeatInterval()) === HEARTBEAT, "wrong heartbeat");
    assert(Number(await v.gracePeriod()) === GRACE, "wrong grace");
    assert((await v.recoveryAddress()) === recovery.address, "wrong recovery");
    assert((await v.isSwitchActivated()) === false, "switch should be off");
    assert(Number(await v.lastCheckIn()) > 0, "lastCheckIn should be set");
  });

  await test("reverts with zero heartbeat", async () => {
    try {
      await deploy(0, GRACE);
      assert(false, "should revert");
    } catch (e) {
      assert(e.message.includes("revert"), "wrong error");
    }
  });

  await test("reverts with zero grace", async () => {
    try {
      await deploy(HEARTBEAT, 0);
      assert(false, "should revert");
    } catch (e) {
      assert(e.message.includes("revert"), "wrong error");
    }
  });

  await test("reverts with zero recovery address", async () => {
    try {
      await deploy(HEARTBEAT, GRACE, ethers.ZeroAddress);
      assert(false, "should revert");
    } catch (e) {
      assert(e.message.includes("revert"), "wrong error");
    }
  });

  // ═══════════════════════════════════════════
  //  Check-in
  // ═══════════════════════════════════════════
  console.log("\n  Check-in");

  await test("resets the heartbeat timer", async () => {
    const v = await deploy();
    await increaseTime(HEARTBEAT / 2);
    await (await v.checkIn()).wait();
    const remaining = Number(await v.timeRemaining());
    assert(Math.abs(remaining - (HEARTBEAT + GRACE)) < 10, `bad remaining: ${remaining}`);
  });

  await test("reverts when called by non-owner", async () => {
    const v = await deploy();
    try {
      await v.connect(attacker).checkIn();
      assert(false, "should revert");
    } catch (e) {
      assert(e.message.includes("revert"), "wrong error");
    }
  });

  await test("reverts after switch activated", async () => {
    const v = await deploy();
    await increaseTime(HEARTBEAT + GRACE + 1);
    await (await v.connect(attacker).activateSwitch()).wait();
    try {
      // recovery is now owner
      await v.connect(recovery).checkIn();
      assert(false, "should revert");
    } catch (e) {
      assert(e.message.includes("revert"), "wrong error");
    }
  });

  // ═══════════════════════════════════════════
  //  Switch Activation
  // ═══════════════════════════════════════════
  console.log("\n  Switch Activation");

  await test("reverts before deadline", async () => {
    const v = await deploy();
    try {
      await v.connect(attacker).activateSwitch();
      assert(false, "should revert");
    } catch (e) {
      assert(e.message.includes("revert"), "wrong error");
    }
  });

  await test("reverts during grace period", async () => {
    const v = await deploy();
    // Advance past heartbeat but not grace
    await increaseTime(HEARTBEAT + 100);
    try {
      await v.connect(attacker).activateSwitch();
      assert(false, "should revert");
    } catch (e) {
      assert(e.message.includes("revert"), "wrong error");
    }
  });

  await test("succeeds after full deadline, pauses, transfers ownership", async () => {
    const v = await deploy();
    await increaseTime(HEARTBEAT + GRACE + 100);
    const tx = await v.connect(attacker).activateSwitch();
    await tx.wait();
    assert(await v.isSwitchActivated(), "switch not activated");
    assert(await v.paused(), "not paused");
    assert((await v.owner()) === recovery.address, "wrong owner");
  });

  await test("cannot be activated twice", async () => {
    const v = await deploy();
    await increaseTime(HEARTBEAT + GRACE + 100);
    await (await v.connect(attacker).activateSwitch()).wait();
    try {
      await v.connect(attacker).activateSwitch();
      assert(false, "should revert");
    } catch (e) {
      assert(e.message.includes("revert"), "wrong error");
    }
  });

  await test("anyone can trigger activation", async () => {
    const v = await deploy();
    await increaseTime(HEARTBEAT + GRACE + 100);
    // attacker (random third party) can trigger
    const tx = await v.connect(attacker).activateSwitch();
    const receipt = await tx.wait();
    assert(receipt.status === 1, "tx failed");
  });

  // ═══════════════════════════════════════════
  //  Recovery Address Management
  // ═══════════════════════════════════════════
  console.log("\n  Recovery Address Management");

  await test("proposes and accepts a new recovery address (2-step)", async () => {
    const v = await deploy();
    await (await v.proposeRecoveryAddress(newRecovery.address)).wait();
    assert((await v.pendingRecoveryAddress()) === newRecovery.address, "wrong pending");

    await (await v.connect(newRecovery).acceptRecoveryAddress()).wait();
    assert((await v.recoveryAddress()) === newRecovery.address, "wrong recovery");
    assert((await v.pendingRecoveryAddress()) === ethers.ZeroAddress, "pending not cleared");
  });

  await test("reverts acceptance from wrong address", async () => {
    const v = await deploy();
    await (await v.proposeRecoveryAddress(newRecovery.address)).wait();
    try {
      await v.connect(attacker).acceptRecoveryAddress();
      assert(false, "should revert");
    } catch (e) {
      assert(e.message.includes("revert"), "wrong error");
    }
  });

  await test("reverts proposal from non-owner", async () => {
    const v = await deploy();
    try {
      await v.connect(attacker).proposeRecoveryAddress(newRecovery.address);
      assert(false, "should revert");
    } catch (e) {
      assert(e.message.includes("revert"), "wrong error");
    }
  });

  await test("reverts proposal with zero address", async () => {
    const v = await deploy();
    try {
      await v.proposeRecoveryAddress(ethers.ZeroAddress);
      assert(false, "should revert");
    } catch (e) {
      assert(e.message.includes("revert"), "wrong error");
    }
  });

  // ═══════════════════════════════════════════
  //  Configuration
  // ═══════════════════════════════════════════
  console.log("\n  Configuration");

  await test("updates heartbeat interval and resets timer", async () => {
    const v = await deploy();
    const newInterval = 60 * 24 * 60 * 60;
    await increaseTime(HEARTBEAT / 2);
    await (await v.setHeartbeatInterval(newInterval)).wait();
    assert(Number(await v.heartbeatInterval()) === newInterval, "wrong interval");
    const remaining = Number(await v.timeRemaining());
    assert(Math.abs(remaining - (newInterval + GRACE)) < 10, "timer not reset");
  });

  await test("updates grace period", async () => {
    const v = await deploy();
    const newGrace = 14 * 24 * 60 * 60;
    await (await v.setGracePeriod(newGrace)).wait();
    assert(Number(await v.gracePeriod()) === newGrace, "wrong grace");
  });

  await test("reverts config changes from non-owner", async () => {
    const v = await deploy();
    try {
      await v.connect(attacker).setHeartbeatInterval(1000);
      assert(false, "should revert");
    } catch (e) {
      assert(e.message.includes("revert"), "wrong error");
    }
  });

  // ═══════════════════════════════════════════
  //  Vault Operations
  // ═══════════════════════════════════════════
  console.log("\n  Vault Operations");

  await test("accepts ETH deposits and allows owner to withdraw", async () => {
    const v = await deploy();
    const addr = await v.getAddress();

    // Deposit
    await (await owner.sendTransaction({ to: addr, value: ethers.parseEther("2.0") })).wait();
    let vaultBal = await provider.getBalance(addr, "latest");
    assert(vaultBal === ethers.parseEther("2.0"), `wrong deposit balance: ${vaultBal}`);

    // Withdraw all to owner — verify via latest block
    const tx = await v.withdraw(owner.address, ethers.parseEther("2.0"));
    const receipt = await tx.wait();
    assert(receipt.status === 1, `withdraw tx failed`);

    // Explicitly query at the block the withdraw was mined in
    const block = receipt.blockNumber;
    vaultBal = await provider.getBalance(addr, block);
    assert(vaultBal === 0n, `vault should be empty at block ${block}, got: ${vaultBal}`);
  });

  await test("reverts withdrawal from non-owner", async () => {
    const v = await deploy();
    const addr = await v.getAddress();
    await (await owner.sendTransaction({ to: addr, value: ethers.parseEther("1.0") })).wait();
    try {
      await v.connect(attacker).withdraw(attacker.address, ethers.parseEther("0.5"));
      assert(false, "should revert");
    } catch (e) {
      assert(e.message.includes("revert"), "wrong error");
    }
  });

  await test("blocks withdrawals when paused, recovery can unpause", async () => {
    const v = await deploy();
    const addr = await v.getAddress();
    await (await owner.sendTransaction({ to: addr, value: ethers.parseEther("1.0") })).wait();

    // Activate switch
    await increaseTime(HEARTBEAT + GRACE + 100);
    await (await v.connect(attacker).activateSwitch()).wait();

    // Withdraw should fail (paused)
    try {
      await v.connect(recovery).withdraw(recovery.address, ethers.parseEther("0.5"));
      assert(false, "should revert");
    } catch (e) {
      assert(e.message.includes("revert"), "wrong error");
    }

    // Recovery unpause and withdraw — verify vault balance goes to 0
    await (await v.connect(recovery).unpause()).wait();
    await (await v.connect(recovery).withdraw(recovery.address, ethers.parseEther("1.0"))).wait();
    const finalBal = await provider.getBalance(addr);
    assert(finalBal === 0n, `vault should be empty, got: ${finalBal}`);
  });

  // ═══════════════════════════════════════════
  //  End-to-End Scenario
  // ═══════════════════════════════════════════
  console.log("\n  End-to-End: Owner Goes Inactive");

  await test("full lifecycle: deposit -> check-ins -> miss heartbeat -> activate -> recover funds", async () => {
    const v = await deploy();
    const addr = await v.getAddress();

    // 1. Owner deposits 5 ETH
    await (await owner.sendTransaction({ to: addr, value: ethers.parseEther("5.0") })).wait();

    // 2. Owner checks in over time
    await increaseTime(25 * 24 * 60 * 60);
    await (await v.checkIn()).wait();
    await increaseTime(28 * 24 * 60 * 60);
    await (await v.checkIn()).wait();

    // 3. Owner disappears for >37 days
    await increaseTime(HEARTBEAT + GRACE + 100);

    // 4. Third party activates switch
    await (await v.connect(attacker).activateSwitch()).wait();
    assert(await v.paused(), "should be paused");
    assert((await v.owner()) === recovery.address, "recovery should be owner");

    // 5. Recovery takes control
    await (await v.connect(recovery).unpause()).wait();
    await (await v.connect(recovery).withdraw(recovery.address, ethers.parseEther("5.0"))).wait();
    assert((await provider.getBalance(addr)) === 0n, "vault should be empty");
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
