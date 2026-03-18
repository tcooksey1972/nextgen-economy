const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NGETokenUpgradeable", function () {
  const SUPPLY_CAP = ethers.parseEther("100000000"); // 100M
  const INITIAL_MINT = ethers.parseEther("10000000"); // 10M
  const ZERO_ADDRESS = ethers.ZeroAddress;

  let token, tokenAddr;
  let owner, alice, bob, attacker;

  /**
   * Deploy NGETokenUpgradeable behind an ERC1967Proxy.
   * Returns the implementation ABI attached to the proxy address.
   */
  async function deployProxy(cap, mintTo, mintAmount, signer) {
    const deployer = signer || owner;

    const Impl = await ethers.getContractFactory("NGETokenUpgradeable", deployer);
    const impl = await Impl.deploy();
    await impl.waitForDeployment();

    const initData = impl.interface.encodeFunctionData("initialize", [
      cap,
      mintTo,
      mintAmount,
    ]);

    const Proxy = await ethers.getContractFactory(
      "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol:ERC1967Proxy",
      deployer
    );
    const proxy = await Proxy.deploy(await impl.getAddress(), initData);
    await proxy.waitForDeployment();

    return Impl.attach(await proxy.getAddress());
  }

  beforeEach(async function () {
    [owner, alice, bob, attacker] = await ethers.getSigners();
    token = await deployProxy(SUPPLY_CAP, owner.address, INITIAL_MINT);
    tokenAddr = await token.getAddress();
  });

  // ──────────────────────────────────────────────
  //  Initialization
  // ──────────────────────────────────────────────

  describe("Initialization", function () {
    it("sets the correct name and symbol", async function () {
      expect(await token.name()).to.equal("NextGen Economy");
      expect(await token.symbol()).to.equal("NGE");
    });

    it("sets 18 decimals", async function () {
      expect(await token.decimals()).to.equal(18);
    });

    it("mints initial supply to the specified address", async function () {
      expect(await token.balanceOf(owner.address)).to.equal(INITIAL_MINT);
      expect(await token.totalSupply()).to.equal(INITIAL_MINT);
    });

    it("sets the supply cap", async function () {
      expect(await token.supplyCap()).to.equal(SUPPLY_CAP);
    });

    it("reports correct mintable supply after initialization", async function () {
      expect(await token.mintableSupply()).to.equal(SUPPLY_CAP - INITIAL_MINT);
    });

    it("reverts if initialMintAmount exceeds the cap", async function () {
      const overCap = SUPPLY_CAP + 1n;
      await expect(
        deployProxy(SUPPLY_CAP, owner.address, overCap)
      ).to.be.revertedWithCustomError(token, "SupplyCapExceeded");
    });

    it("allows zero cap (unlimited supply)", async function () {
      const unlimited = await deployProxy(0, owner.address, INITIAL_MINT);
      expect(await unlimited.supplyCap()).to.equal(0);
      expect(await unlimited.mintableSupply()).to.equal(ethers.MaxUint256);
    });

    it("allows zero initial mint amount", async function () {
      const noMint = await deployProxy(SUPPLY_CAP, owner.address, 0);
      expect(await noMint.totalSupply()).to.equal(0);
      expect(await noMint.mintableSupply()).to.equal(SUPPLY_CAP);
    });

    it("skips minting when initialMintTo is the zero address", async function () {
      const noMint = await deployProxy(SUPPLY_CAP, ZERO_ADDRESS, INITIAL_MINT);
      expect(await noMint.totalSupply()).to.equal(0);
    });

    it("cannot be initialized twice", async function () {
      await expect(
        token.initialize(SUPPLY_CAP, owner.address, INITIAL_MINT)
      ).to.be.revertedWithCustomError(token, "InvalidInitialization");
    });

    it("sets the deployer as owner", async function () {
      expect(await token.owner()).to.equal(owner.address);
    });

    it("implementation contract has initializers disabled", async function () {
      const Impl = await ethers.getContractFactory("NGETokenUpgradeable");
      const impl = await Impl.deploy();
      await impl.waitForDeployment();

      await expect(
        impl.initialize(SUPPLY_CAP, owner.address, INITIAL_MINT)
      ).to.be.revertedWithCustomError(impl, "InvalidInitialization");
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
      const unlimited = await deployProxy(0, owner.address, 0);
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

    it("reverts burn when amount exceeds balance", async function () {
      await expect(
        token.connect(alice).burn(BURN_AMOUNT)
      ).to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");
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
  //  View Functions
  // ──────────────────────────────────────────────

  describe("View Functions", function () {
    it("supplyCap returns the configured cap", async function () {
      expect(await token.supplyCap()).to.equal(SUPPLY_CAP);
    });

    it("mintableSupply returns cap minus totalSupply", async function () {
      expect(await token.mintableSupply()).to.equal(SUPPLY_CAP - INITIAL_MINT);
    });

    it("mintableSupply returns type(uint256).max when cap is 0", async function () {
      const unlimited = await deployProxy(0, owner.address, INITIAL_MINT);
      expect(await unlimited.mintableSupply()).to.equal(ethers.MaxUint256);
    });

    it("mintableSupply updates after minting", async function () {
      const mintAmount = ethers.parseEther("1000");
      await token.mint(alice.address, mintAmount);
      expect(await token.mintableSupply()).to.equal(SUPPLY_CAP - INITIAL_MINT - mintAmount);
    });

    it("mintableSupply updates after burning", async function () {
      const burnAmount = ethers.parseEther("500");
      await token.burn(burnAmount);
      expect(await token.mintableSupply()).to.equal(SUPPLY_CAP - INITIAL_MINT + burnAmount);
    });
  });

  // ──────────────────────────────────────────────
  //  ERC-20 Transfers
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

    it("reverts transferFrom with insufficient allowance", async function () {
      await expect(
        token.connect(alice).transferFrom(owner.address, bob.address, TRANSFER_AMOUNT)
      ).to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance");
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

    it("burning reduces delegated voting power", async function () {
      await token.delegate(owner.address);
      const burnAmount = ethers.parseEther("2000");
      await token.burn(burnAmount);
      expect(await token.getVotes(owner.address)).to.equal(INITIAL_MINT - burnAmount);
    });

    it("minting increases delegated voting power", async function () {
      await token.delegate(owner.address);
      const mintAmount = ethers.parseEther("5000");
      await token.mint(owner.address, mintAmount);
      expect(await token.getVotes(owner.address)).to.equal(INITIAL_MINT + mintAmount);
    });
  });

  // ──────────────────────────────────────────────
  //  EIP-2612 Permit (Gasless Approvals)
  // ──────────────────────────────────────────────

  describe("EIP-2612 Permit", function () {
    it("returns correct EIP-712 domain", async function () {
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

  // ──────────────────────────────────────────────
  //  UUPS Upgrade
  // ──────────────────────────────────────────────

  describe("UUPS Upgrade", function () {
    it("non-owner cannot upgrade the implementation", async function () {
      const NewImpl = await ethers.getContractFactory("NGETokenUpgradeable", attacker);
      const newImpl = await NewImpl.deploy();
      await newImpl.waitForDeployment();
      const newImplAddr = await newImpl.getAddress();

      await expect(
        token.connect(attacker).upgradeToAndCall(newImplAddr, "0x")
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });

    it("owner can upgrade the implementation", async function () {
      const NewImpl = await ethers.getContractFactory("NGETokenUpgradeable");
      const newImpl = await NewImpl.deploy();
      await newImpl.waitForDeployment();
      const newImplAddr = await newImpl.getAddress();

      await expect(
        token.upgradeToAndCall(newImplAddr, "0x")
      ).to.not.be.reverted;

      // State is preserved after upgrade
      expect(await token.name()).to.equal("NextGen Economy");
      expect(await token.totalSupply()).to.equal(INITIAL_MINT);
      expect(await token.supplyCap()).to.equal(SUPPLY_CAP);
      expect(await token.owner()).to.equal(owner.address);
    });

    it("proxy preserves state across upgrade", async function () {
      // Mint some tokens and set up state before upgrade
      const mintAmount = ethers.parseEther("5000");
      await token.mint(alice.address, mintAmount);
      await token.delegate(owner.address);

      const balanceBefore = await token.balanceOf(alice.address);
      const totalSupplyBefore = await token.totalSupply();
      const votesBefore = await token.getVotes(owner.address);

      // Upgrade
      const NewImpl = await ethers.getContractFactory("NGETokenUpgradeable");
      const newImpl = await NewImpl.deploy();
      await newImpl.waitForDeployment();
      await token.upgradeToAndCall(await newImpl.getAddress(), "0x");

      // Verify state is preserved
      expect(await token.balanceOf(alice.address)).to.equal(balanceBefore);
      expect(await token.totalSupply()).to.equal(totalSupplyBefore);
      expect(await token.getVotes(owner.address)).to.equal(votesBefore);
    });
  });

  // ──────────────────────────────────────────────
  //  Integration
  // ──────────────────────────────────────────────

  describe("Integration", function () {
    it("full lifecycle: mint, transfer, burn, pause, unpause", async function () {
      const amount = ethers.parseEther("1000");

      // Mint to alice
      await token.mint(alice.address, amount);
      expect(await token.balanceOf(alice.address)).to.equal(amount);

      // Alice transfers to bob
      await token.connect(alice).transfer(bob.address, amount);
      expect(await token.balanceOf(bob.address)).to.equal(amount);

      // Bob burns
      await token.connect(bob).burn(amount);
      expect(await token.balanceOf(bob.address)).to.equal(0);
      expect(await token.totalSupply()).to.equal(INITIAL_MINT);

      // Pause and unpause
      await token.pause();
      await expect(
        token.transfer(alice.address, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(token, "EnforcedPause");
      await token.unpause();
      await token.transfer(alice.address, ethers.parseEther("100"));
      expect(await token.balanceOf(alice.address)).to.equal(ethers.parseEther("100"));
    });

    it("cap change allows further minting", async function () {
      // Mint to the cap
      const remaining = SUPPLY_CAP - INITIAL_MINT;
      await token.mint(alice.address, remaining);
      expect(await token.mintableSupply()).to.equal(0);

      // Cannot mint more
      await expect(
        token.mint(bob.address, 1n)
      ).to.be.revertedWithCustomError(token, "SupplyCapExceeded");

      // Increase cap
      const newCap = SUPPLY_CAP + ethers.parseEther("50000000");
      await token.setSupplyCap(newCap);

      // Now minting works again
      const additionalMint = ethers.parseEther("1000");
      await token.mint(bob.address, additionalMint);
      expect(await token.balanceOf(bob.address)).to.equal(additionalMint);
    });

    it("delegation works with proxy-deployed token", async function () {
      await token.delegate(owner.address);
      const amount = ethers.parseEther("5000");
      await token.transfer(alice.address, amount);
      await token.connect(alice).delegate(alice.address);

      expect(await token.getVotes(owner.address)).to.equal(INITIAL_MINT - amount);
      expect(await token.getVotes(alice.address)).to.equal(amount);
    });
  });
});
