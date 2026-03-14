const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NGEToken (via SimpleNGEToken)", function () {
  const SUPPLY_CAP = ethers.parseEther("100000000"); // 100M
  const INITIAL_MINT = ethers.parseEther("10000000"); // 10M
  const ZERO_ADDRESS = ethers.ZeroAddress;

  let token, tokenAddr;
  let owner, alice, bob, attacker;

  beforeEach(async function () {
    [owner, alice, bob, attacker] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("SimpleNGEToken");
    token = await Factory.deploy(SUPPLY_CAP, INITIAL_MINT);
    await token.waitForDeployment();
    tokenAddr = await token.getAddress();
  });

  // ──────────────────────────────────────────────
  //  Deployment
  // ──────────────────────────────────────────────

  describe("Deployment", function () {
    it("sets the correct name and symbol", async function () {
      expect(await token.name()).to.equal("NextGen Economy");
      expect(await token.symbol()).to.equal("NGE");
    });

    it("sets 18 decimals", async function () {
      expect(await token.decimals()).to.equal(18);
    });

    it("mints initial supply to the deployer", async function () {
      expect(await token.balanceOf(owner.address)).to.equal(INITIAL_MINT);
      expect(await token.totalSupply()).to.equal(INITIAL_MINT);
    });

    it("sets the supply cap", async function () {
      expect(await token.supplyCap()).to.equal(SUPPLY_CAP);
    });

    it("reports correct mintable supply", async function () {
      expect(await token.mintableSupply()).to.equal(SUPPLY_CAP - INITIAL_MINT);
    });

    it("reverts if initial mint exceeds cap", async function () {
      const Factory = await ethers.getContractFactory("SimpleNGEToken");
      const overCap = SUPPLY_CAP + 1n;
      await expect(
        Factory.deploy(SUPPLY_CAP, overCap)
      ).to.be.revertedWithCustomError({ interface: token.interface }, "SupplyCapExceeded");
    });

    it("allows zero cap (unlimited)", async function () {
      const Factory = await ethers.getContractFactory("SimpleNGEToken");
      const unlimited = await Factory.deploy(0, INITIAL_MINT);
      expect(await unlimited.supplyCap()).to.equal(0);
      expect(await unlimited.mintableSupply()).to.equal(ethers.MaxUint256);
    });

    it("allows zero initial mint", async function () {
      const Factory = await ethers.getContractFactory("SimpleNGEToken");
      const noMint = await Factory.deploy(SUPPLY_CAP, 0);
      expect(await noMint.totalSupply()).to.equal(0);
      expect(await noMint.mintableSupply()).to.equal(SUPPLY_CAP);
    });
  });

  // ──────────────────────────────────────────────
  //  Minting
  // ──────────────────────────────────────────────

  describe("Minting", function () {
    const MINT_AMOUNT = ethers.parseEther("5000");

    it("allows owner to mint tokens", async function () {
      await token.mint(alice.address, MINT_AMOUNT);
      expect(await token.balanceOf(alice.address)).to.equal(MINT_AMOUNT);
    });

    it("emits TokensMinted event", async function () {
      await expect(token.mint(alice.address, MINT_AMOUNT))
        .to.emit(token, "TokensMinted")
        .withArgs(alice.address, MINT_AMOUNT, owner.address);
    });

    it("updates total supply after minting", async function () {
      await token.mint(alice.address, MINT_AMOUNT);
      expect(await token.totalSupply()).to.equal(INITIAL_MINT + MINT_AMOUNT);
    });

    it("reverts when non-owner tries to mint", async function () {
      await expect(
        token.connect(attacker).mint(attacker.address, MINT_AMOUNT)
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });

    it("reverts when minting to zero address", async function () {
      await expect(
        token.mint(ZERO_ADDRESS, MINT_AMOUNT)
      ).to.be.revertedWithCustomError(token, "ZeroAddress");
    });

    it("reverts when minting zero amount", async function () {
      await expect(
        token.mint(alice.address, 0)
      ).to.be.revertedWithCustomError(token, "ZeroAmount");
    });

    it("reverts when minting would exceed supply cap", async function () {
      const remaining = SUPPLY_CAP - INITIAL_MINT;
      await expect(
        token.mint(alice.address, remaining + 1n)
      ).to.be.revertedWithCustomError(token, "SupplyCapExceeded");
    });

    it("allows minting exactly to the cap", async function () {
      const remaining = SUPPLY_CAP - INITIAL_MINT;
      await token.mint(alice.address, remaining);
      expect(await token.totalSupply()).to.equal(SUPPLY_CAP);
      expect(await token.mintableSupply()).to.equal(0);
    });

    it("allows unlimited minting when cap is 0", async function () {
      const Factory = await ethers.getContractFactory("SimpleNGEToken");
      const unlimited = await Factory.deploy(0, 0);
      const huge = ethers.parseEther("999999999999");
      await unlimited.mint(alice.address, huge);
      expect(await unlimited.balanceOf(alice.address)).to.equal(huge);
    });
  });

  // ──────────────────────────────────────────────
  //  Burning
  // ──────────────────────────────────────────────

  describe("Burning", function () {
    const BURN_AMOUNT = ethers.parseEther("1000");

    it("allows holders to burn their own tokens", async function () {
      await token.burn(BURN_AMOUNT);
      expect(await token.balanceOf(owner.address)).to.equal(INITIAL_MINT - BURN_AMOUNT);
    });

    it("decreases total supply when burning", async function () {
      await token.burn(BURN_AMOUNT);
      expect(await token.totalSupply()).to.equal(INITIAL_MINT - BURN_AMOUNT);
    });

    it("increases mintable supply when burning (capped token)", async function () {
      const mintableBefore = await token.mintableSupply();
      await token.burn(BURN_AMOUNT);
      expect(await token.mintableSupply()).to.equal(mintableBefore + BURN_AMOUNT);
    });

    it("allows burnFrom with allowance", async function () {
      await token.approve(alice.address, BURN_AMOUNT);
      await token.connect(alice).burnFrom(owner.address, BURN_AMOUNT);
      expect(await token.balanceOf(owner.address)).to.equal(INITIAL_MINT - BURN_AMOUNT);
    });

    it("reverts burnFrom without allowance", async function () {
      await expect(
        token.connect(alice).burnFrom(owner.address, BURN_AMOUNT)
      ).to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance");
    });
  });

  // ──────────────────────────────────────────────
  //  Pause / Unpause
  // ──────────────────────────────────────────────

  describe("Pause / Unpause", function () {
    it("owner can pause", async function () {
      await expect(token.pause())
        .to.emit(token, "TokenPaused")
        .withArgs(owner.address);
      expect(await token.paused()).to.be.true;
    });

    it("owner can unpause", async function () {
      await token.pause();
      await expect(token.unpause())
        .to.emit(token, "TokenUnpaused")
        .withArgs(owner.address);
      expect(await token.paused()).to.be.false;
    });

    it("blocks transfers when paused", async function () {
      await token.transfer(alice.address, ethers.parseEther("100"));
      await token.pause();
      await expect(
        token.connect(alice).transfer(bob.address, ethers.parseEther("50"))
      ).to.be.revertedWithCustomError(token, "EnforcedPause");
    });

    it("blocks minting when paused", async function () {
      await token.pause();
      await expect(
        token.mint(alice.address, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(token, "EnforcedPause");
    });

    it("blocks burning when paused", async function () {
      await token.pause();
      await expect(
        token.burn(ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(token, "EnforcedPause");
    });

    it("resumes transfers after unpause", async function () {
      await token.transfer(alice.address, ethers.parseEther("100"));
      await token.pause();
      await token.unpause();
      await expect(
        token.connect(alice).transfer(bob.address, ethers.parseEther("50"))
      ).to.not.be.reverted;
    });

    it("reverts when non-owner tries to pause", async function () {
      await expect(
        token.connect(attacker).pause()
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });

    it("reverts when non-owner tries to unpause", async function () {
      await token.pause();
      await expect(
        token.connect(attacker).unpause()
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });
  });

  // ──────────────────────────────────────────────
  //  Supply Cap Management
  // ──────────────────────────────────────────────

  describe("Supply Cap", function () {
    it("owner can increase the cap", async function () {
      const newCap = ethers.parseEther("200000000");
      await expect(token.setSupplyCap(newCap))
        .to.emit(token, "SupplyCapUpdated")
        .withArgs(SUPPLY_CAP, newCap);
      expect(await token.supplyCap()).to.equal(newCap);
    });

    it("owner can decrease the cap above totalSupply", async function () {
      const newCap = INITIAL_MINT + ethers.parseEther("1000");
      await token.setSupplyCap(newCap);
      expect(await token.supplyCap()).to.equal(newCap);
    });

    it("owner can set cap to 0 (unlimited)", async function () {
      await token.setSupplyCap(0);
      expect(await token.supplyCap()).to.equal(0);
      expect(await token.mintableSupply()).to.equal(ethers.MaxUint256);
    });

    it("reverts when new cap is below totalSupply", async function () {
      const belowSupply = INITIAL_MINT - 1n;
      await expect(
        token.setSupplyCap(belowSupply)
      ).to.be.revertedWithCustomError(token, "CapBelowSupply");
    });

    it("allows setting cap exactly equal to totalSupply", async function () {
      await token.setSupplyCap(INITIAL_MINT);
      expect(await token.mintableSupply()).to.equal(0);
    });

    it("reverts when non-owner tries to change cap", async function () {
      await expect(
        token.connect(attacker).setSupplyCap(0)
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });
  });

  // ──────────────────────────────────────────────
  //  ERC-20 Standard Operations
  // ──────────────────────────────────────────────

  describe("ERC-20 Transfers", function () {
    const TRANSFER_AMOUNT = ethers.parseEther("1000");

    it("transfers between accounts", async function () {
      await token.transfer(alice.address, TRANSFER_AMOUNT);
      expect(await token.balanceOf(alice.address)).to.equal(TRANSFER_AMOUNT);
      expect(await token.balanceOf(owner.address)).to.equal(INITIAL_MINT - TRANSFER_AMOUNT);
    });

    it("emits Transfer event", async function () {
      await expect(token.transfer(alice.address, TRANSFER_AMOUNT))
        .to.emit(token, "Transfer")
        .withArgs(owner.address, alice.address, TRANSFER_AMOUNT);
    });

    it("approves and transferFrom works", async function () {
      await token.approve(alice.address, TRANSFER_AMOUNT);
      expect(await token.allowance(owner.address, alice.address)).to.equal(TRANSFER_AMOUNT);

      await token.connect(alice).transferFrom(owner.address, bob.address, TRANSFER_AMOUNT);
      expect(await token.balanceOf(bob.address)).to.equal(TRANSFER_AMOUNT);
    });

    it("reverts transfer to zero address", async function () {
      await expect(
        token.transfer(ZERO_ADDRESS, TRANSFER_AMOUNT)
      ).to.be.revertedWithCustomError(token, "ERC20InvalidReceiver");
    });

    it("reverts transfer with insufficient balance", async function () {
      await expect(
        token.connect(alice).transfer(bob.address, TRANSFER_AMOUNT)
      ).to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");
    });
  });

  // ──────────────────────────────────────────────
  //  Governance (ERC20Votes)
  // ──────────────────────────────────────────────

  describe("Governance Voting", function () {
    it("starts with zero voting power (must delegate)", async function () {
      expect(await token.getVotes(owner.address)).to.equal(0);
    });

    it("self-delegation activates voting power", async function () {
      await token.delegate(owner.address);
      expect(await token.getVotes(owner.address)).to.equal(INITIAL_MINT);
    });

    it("can delegate to another address", async function () {
      await token.delegate(alice.address);
      expect(await token.getVotes(alice.address)).to.equal(INITIAL_MINT);
      expect(await token.getVotes(owner.address)).to.equal(0);
    });

    it("delegation follows token transfers", async function () {
      await token.delegate(owner.address);
      const transferAmount = ethers.parseEther("3000");
      await token.transfer(alice.address, transferAmount);
      await token.connect(alice).delegate(alice.address);

      expect(await token.getVotes(owner.address)).to.equal(INITIAL_MINT - transferAmount);
      expect(await token.getVotes(alice.address)).to.equal(transferAmount);
    });

    it("re-delegation moves voting power", async function () {
      await token.delegate(alice.address);
      expect(await token.getVotes(alice.address)).to.equal(INITIAL_MINT);

      await token.delegate(bob.address);
      expect(await token.getVotes(alice.address)).to.equal(0);
      expect(await token.getVotes(bob.address)).to.equal(INITIAL_MINT);
    });
  });

  // ──────────────────────────────────────────────
  //  EIP-2612 Permit (Gasless Approvals)
  // ──────────────────────────────────────────────

  describe("EIP-2612 Permit", function () {
    it("returns correct DOMAIN_SEPARATOR", async function () {
      const domain = await token.eip712Domain();
      expect(domain.name).to.equal("NextGen Economy");
    });

    it("nonces start at zero", async function () {
      expect(await token.nonces(owner.address)).to.equal(0);
    });

    it("permit sets allowance via signature", async function () {
      const amount = ethers.parseEther("500");
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const nonce = await token.nonces(owner.address);

      const domain = {
        name: "NextGen Economy",
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: tokenAddr,
      };

      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };

      const value = {
        owner: owner.address,
        spender: alice.address,
        value: amount,
        nonce: nonce,
        deadline: deadline,
      };

      const signature = await owner.signTypedData(domain, types, value);
      const { v, r, s } = ethers.Signature.from(signature);

      await token.permit(owner.address, alice.address, amount, deadline, v, r, s);
      expect(await token.allowance(owner.address, alice.address)).to.equal(amount);
      expect(await token.nonces(owner.address)).to.equal(1);
    });
  });
});

describe("SentinelNGEToken", function () {
  const SUPPLY_CAP = ethers.parseEther("100000000");
  const INITIAL_MINT = ethers.parseEther("10000000");
  const TRANSFER_LIMIT = ethers.parseEther("10000");
  const LARGE_THRESHOLD = ethers.parseEther("5000");

  let token;
  let owner, alice, bob, attacker;

  beforeEach(async function () {
    [owner, alice, bob, attacker] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("SentinelNGEToken");
    token = await Factory.deploy(SUPPLY_CAP, INITIAL_MINT, TRANSFER_LIMIT, LARGE_THRESHOLD);
    await token.waitForDeployment();
  });

  // ──────────────────────────────────────────────
  //  Transfer Limit (Rate Limiter Hook)
  // ──────────────────────────────────────────────

  describe("Transfer Limit", function () {
    it("allows transfers under the limit", async function () {
      const amount = ethers.parseEther("5000");
      await token.transfer(alice.address, amount);
      expect(await token.balanceOf(alice.address)).to.equal(amount);
    });

    it("allows transfers exactly at the limit", async function () {
      await token.transfer(alice.address, TRANSFER_LIMIT);
      expect(await token.balanceOf(alice.address)).to.equal(TRANSFER_LIMIT);
    });

    it("reverts transfers exceeding the limit", async function () {
      const overLimit = TRANSFER_LIMIT + 1n;
      await expect(
        token.transfer(alice.address, overLimit)
      ).to.be.revertedWithCustomError(token, "TransferExceedsLimit");
    });

    it("limit applies to transferFrom as well", async function () {
      const overLimit = TRANSFER_LIMIT + 1n;
      await token.approve(alice.address, overLimit);
      await expect(
        token.connect(alice).transferFrom(owner.address, bob.address, overLimit)
      ).to.be.revertedWithCustomError(token, "TransferExceedsLimit");
    });

    it("does not apply limit to minting", async function () {
      const overLimit = TRANSFER_LIMIT + ethers.parseEther("1");
      await token.mint(alice.address, overLimit);
      expect(await token.balanceOf(alice.address)).to.equal(overLimit);
    });

    it("does not apply limit to burning", async function () {
      const overLimit = TRANSFER_LIMIT + ethers.parseEther("1");
      await token.burn(overLimit);
      expect(await token.balanceOf(owner.address)).to.equal(INITIAL_MINT - overLimit);
    });

    it("owner can update the transfer limit", async function () {
      const newLimit = ethers.parseEther("50000");
      await expect(token.setTransferLimit(newLimit))
        .to.emit(token, "TransferLimitUpdated")
        .withArgs(TRANSFER_LIMIT, newLimit);
      expect(await token.transferLimit()).to.equal(newLimit);
    });

    it("disabling transfer limit (set to 0) allows any amount", async function () {
      await token.setTransferLimit(0);
      const huge = ethers.parseEther("5000000");
      await token.transfer(alice.address, huge);
      expect(await token.balanceOf(alice.address)).to.equal(huge);
    });

    it("reverts when non-owner updates limit", async function () {
      await expect(
        token.connect(attacker).setTransferLimit(0)
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });
  });

  // ──────────────────────────────────────────────
  //  Large Transfer Detection (Watchdog Hook)
  // ──────────────────────────────────────────────

  describe("Large Transfer Detection", function () {
    it("emits LargeTransferDetected for transfers at threshold", async function () {
      await expect(token.transfer(alice.address, LARGE_THRESHOLD))
        .to.emit(token, "LargeTransferDetected")
        .withArgs(owner.address, alice.address, LARGE_THRESHOLD);
    });

    it("emits LargeTransferDetected for transfers above threshold", async function () {
      const amount = LARGE_THRESHOLD + ethers.parseEther("1000");
      await expect(token.transfer(alice.address, amount))
        .to.emit(token, "LargeTransferDetected")
        .withArgs(owner.address, alice.address, amount);
    });

    it("does not emit for transfers below threshold", async function () {
      const small = LARGE_THRESHOLD - 1n;
      await expect(token.transfer(alice.address, small))
        .to.not.emit(token, "LargeTransferDetected");
    });

    it("owner can update the threshold", async function () {
      const newThreshold = ethers.parseEther("50000");
      await token.setLargeTransferThreshold(newThreshold);
      expect(await token.largeTransferThreshold()).to.equal(newThreshold);
    });
  });

  // ──────────────────────────────────────────────
  //  Integration — Sentinel hooks + core token
  // ──────────────────────────────────────────────

  describe("Integration", function () {
    it("minting, transferring (under limit), and burning all work", async function () {
      const amount = ethers.parseEther("1000");
      await token.mint(alice.address, amount);
      await token.connect(alice).transfer(bob.address, amount);
      await token.connect(bob).burn(amount);

      expect(await token.balanceOf(alice.address)).to.equal(0);
      expect(await token.balanceOf(bob.address)).to.equal(0);
    });

    it("pause blocks transfers but owner can unpause", async function () {
      await token.pause();
      await expect(
        token.transfer(alice.address, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(token, "EnforcedPause");

      await token.unpause();
      await token.transfer(alice.address, ethers.parseEther("100"));
      expect(await token.balanceOf(alice.address)).to.equal(ethers.parseEther("100"));
    });

    it("delegation works with sentinel-secured transfers", async function () {
      await token.delegate(owner.address);
      const amount = ethers.parseEther("5000");
      await token.transfer(alice.address, amount);
      await token.connect(alice).delegate(alice.address);

      expect(await token.getVotes(owner.address)).to.equal(INITIAL_MINT - amount);
      expect(await token.getVotes(alice.address)).to.equal(amount);
    });
  });
});
