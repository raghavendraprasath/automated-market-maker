const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SimpleAMM", function () {
  let owner;
  let alice;
  let bob;

  let tokenA;
  let tokenB;
  let amm;

  const INITIAL_SUPPLY = ethers.parseEther("1000000");
  const LIQUIDITY = ethers.parseEther("1000");
  const SWAP_AMOUNT = ethers.parseEther("100");

  async function deployPool(tokenAAddr, tokenBAddr) {
    const SimpleAMM = await ethers.getContractFactory("SimpleAMM");
    return SimpleAMM.deploy(tokenAAddr, tokenBAddr);
  }

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");

    tokenA = await MockERC20.deploy("Token A", "TKA", INITIAL_SUPPLY);
    tokenB = await MockERC20.deploy("Token B", "TKB", INITIAL_SUPPLY);

    amm = await deployPool(
      await tokenA.getAddress(),
      await tokenB.getAddress()
    );

    for (const user of [alice, bob]) {
      await tokenA.mint(user.address, INITIAL_SUPPLY);
      await tokenB.mint(user.address, INITIAL_SUPPLY);
      await tokenA.connect(user).approve(await amm.getAddress(), INITIAL_SUPPLY);
      await tokenB.connect(user).approve(await amm.getAddress(), INITIAL_SUPPLY);
    }
  });

  describe("Constructor", function () {
    it("stores token addresses", async function () {
      expect(await amm.tokenA()).to.equal(await tokenA.getAddress());
      expect(await amm.tokenB()).to.equal(await tokenB.getAddress());
    });

    it("starts with zero reserves and liquidity", async function () {
      expect(await amm.reserveA()).to.equal(0);
      expect(await amm.reserveB()).to.equal(0);
      expect(await amm.totalLiquidity()).to.equal(0);
      expect(await amm.getLiquidity(alice.address)).to.equal(0);
    });

    it("reverts when tokenA is zero address", async function () {
      await expect(
        deployPool(ethers.ZeroAddress, await tokenB.getAddress())
      ).to.be.revertedWithCustomError(amm, "InvalidTokenAddress");
    });

    it("reverts when tokenB is zero address", async function () {
      await expect(
        deployPool(await tokenA.getAddress(), ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(amm, "InvalidTokenAddress");
    });

    it("reverts when both tokens are the same", async function () {
      await expect(
        deployPool(await tokenA.getAddress(), await tokenA.getAddress())
      ).to.be.revertedWithCustomError(amm, "IdenticalTokens");
    });
  });

  describe("View Functions", function () {
    it("returns reserves correctly", async function () {
      const [rA, rB] = await amm.getReserves();
      expect(rA).to.equal(0);
      expect(rB).to.equal(0);

      await amm.connect(alice).deposit(LIQUIDITY, LIQUIDITY);

      const [rA2, rB2] = await amm.getReserves();
      expect(rA2).to.equal(LIQUIDITY);
      expect(rB2).to.equal(LIQUIDITY);
    });

    it("quotes getAmountOut using constant product", async function () {
      const amountIn = SWAP_AMOUNT;
      const reserveIn = LIQUIDITY;
      const reserveOut = LIQUIDITY;
      const expected =
        (amountIn * reserveOut) / (reserveIn + amountIn);

      expect(await amm.getAmountOut(amountIn, reserveIn, reserveOut)).to.equal(
        expected
      );
    });

    it("reverts getAmountOut on zero input", async function () {
      await expect(
        amm.getAmountOut(0, LIQUIDITY, LIQUIDITY)
      ).to.be.revertedWithCustomError(amm, "ZeroAmount");
    });

    it("reverts getAmountOut when reserves are empty", async function () {
      await expect(
        amm.getAmountOut(SWAP_AMOUNT, 0, LIQUIDITY)
      ).to.be.revertedWithCustomError(amm, "InsufficientLiquidity");

      await expect(
        amm.getAmountOut(SWAP_AMOUNT, LIQUIDITY, 0)
      ).to.be.revertedWithCustomError(amm, "InsufficientLiquidity");
    });
  });

  describe("Deposit", function () {
    it("mints sqrt(amountA * amountB) shares for the first LP", async function () {
      const amountA = ethers.parseEther("400");
      const amountB = ethers.parseEther("100");
      // sqrt(400e18 * 100e18) = 200e18
      const expectedLiquidity = ethers.parseEther("200");

      await expect(amm.connect(alice).deposit(amountA, amountB))
        .to.emit(amm, "LiquidityDeposited")
        .withArgs(alice.address, amountA, amountB, expectedLiquidity);

      expect(await amm.totalLiquidity()).to.equal(expectedLiquidity);
      expect(await amm.getLiquidity(alice.address)).to.equal(expectedLiquidity);
      expect(await amm.reserveA()).to.equal(amountA);
      expect(await amm.reserveB()).to.equal(amountB);
    });

    it("mints proportional shares for a second LP", async function () {
      await amm.connect(alice).deposit(LIQUIDITY, LIQUIDITY);

      const bobLiquidityBefore = await amm.getLiquidity(bob.address);
      await amm.connect(bob).deposit(LIQUIDITY, LIQUIDITY);

      expect(await amm.getLiquidity(bob.address)).to.equal(
        bobLiquidityBefore + LIQUIDITY
      );
      expect(await amm.reserveA()).to.equal(LIQUIDITY * 2n);
      expect(await amm.reserveB()).to.equal(LIQUIDITY * 2n);
    });

    it("uses the minimum ratio when a second deposit is unbalanced", async function () {
      await amm.connect(alice).deposit(LIQUIDITY, LIQUIDITY);

      // Provide extra B; minting should be limited by the scarcer A contribution.
      const amountA = ethers.parseEther("100");
      const amountB = ethers.parseEther("500");
      const expectedMint = amountA; // min(100, 500) against 1:1 pool with totalLiquidity == reserve

      await expect(amm.connect(bob).deposit(amountA, amountB))
        .to.emit(amm, "LiquidityDeposited")
        .withArgs(bob.address, amountA, amountB, expectedMint);

      expect(await amm.getLiquidity(bob.address)).to.equal(expectedMint);
    });

    it("uses the B-side minimum when A is over-supplied", async function () {
      await amm.connect(alice).deposit(LIQUIDITY, LIQUIDITY);

      const amountA = ethers.parseEther("500");
      const amountB = ethers.parseEther("100");
      const expectedMint = amountB;

      await expect(amm.connect(bob).deposit(amountA, amountB))
        .to.emit(amm, "LiquidityDeposited")
        .withArgs(bob.address, amountA, amountB, expectedMint);
    });

    it("supports tiny first deposits that exercise sqrt(y <= 3)", async function () {
      await amm.connect(alice).deposit(1n, 1n); // sqrt(1) = 1
      expect(await amm.totalLiquidity()).to.equal(1n);

      const amm2 = await deployPool(
        await tokenA.getAddress(),
        await tokenB.getAddress()
      );
      await tokenA.connect(alice).approve(await amm2.getAddress(), 10n);
      await tokenB.connect(alice).approve(await amm2.getAddress(), 10n);
      await amm2.connect(alice).deposit(1n, 2n); // sqrt(2) = 1
      expect(await amm2.totalLiquidity()).to.equal(1n);

      const amm3 = await deployPool(
        await tokenA.getAddress(),
        await tokenB.getAddress()
      );
      await tokenA.connect(alice).approve(await amm3.getAddress(), 10n);
      await tokenB.connect(alice).approve(await amm3.getAddress(), 10n);
      await amm3.connect(alice).deposit(1n, 3n); // sqrt(3) = 1
      expect(await amm3.totalLiquidity()).to.equal(1n);
    });

    it("reverts when amountA is zero", async function () {
      await expect(
        amm.connect(alice).deposit(0, LIQUIDITY)
      ).to.be.revertedWithCustomError(amm, "ZeroAmount");
    });

    it("reverts when amountB is zero", async function () {
      await expect(
        amm.connect(alice).deposit(LIQUIDITY, 0)
      ).to.be.revertedWithCustomError(amm, "ZeroAmount");
    });

    it("reverts when both amounts are zero", async function () {
      await expect(
        amm.connect(alice).deposit(0, 0)
      ).to.be.revertedWithCustomError(amm, "ZeroAmount");
    });

    it("reverts when minted liquidity rounds to zero", async function () {
      await amm.connect(alice).deposit(
        ethers.parseEther("100"),
        ethers.parseEther("1")
      );

      // 1 wei of A against a large reserveA yields zero shares.
      await expect(
        amm.connect(bob).deposit(1n, ethers.parseEther("1"))
      ).to.be.revertedWithCustomError(amm, "InsufficientLiquidity");
    });

    it("reverts when tokenA transferFrom fails", async function () {
      await tokenA.setFailTransferFrom(true);

      await expect(
        amm.connect(alice).deposit(LIQUIDITY, LIQUIDITY)
      ).to.be.revertedWithCustomError(amm, "TransferFailed");
    });

    it("reverts when tokenB transferFrom fails", async function () {
      await tokenB.setFailTransferFrom(true);

      await expect(
        amm.connect(alice).deposit(LIQUIDITY, LIQUIDITY)
      ).to.be.revertedWithCustomError(amm, "TransferFailed");
    });
  });

  describe("Redeem", function () {
    beforeEach(async function () {
      await amm.connect(alice).deposit(LIQUIDITY, LIQUIDITY);
    });

    it("redeems all liquidity and returns both tokens", async function () {
      const liquidity = await amm.getLiquidity(alice.address);
      const aliceABefore = await tokenA.balanceOf(alice.address);
      const aliceBBefore = await tokenB.balanceOf(alice.address);

      await expect(amm.connect(alice).redeem(liquidity))
        .to.emit(amm, "LiquidityRedeemed")
        .withArgs(alice.address, LIQUIDITY, LIQUIDITY, liquidity);

      expect(await amm.totalLiquidity()).to.equal(0);
      expect(await amm.reserveA()).to.equal(0);
      expect(await amm.reserveB()).to.equal(0);
      expect(await amm.getLiquidity(alice.address)).to.equal(0);
      expect(await tokenA.balanceOf(alice.address)).to.equal(
        aliceABefore + LIQUIDITY
      );
      expect(await tokenB.balanceOf(alice.address)).to.equal(
        aliceBBefore + LIQUIDITY
      );
    });

    it("redeems a proportional share of reserves", async function () {
      const liquidity = await amm.getLiquidity(alice.address);
      const half = liquidity / 2n;

      await amm.connect(alice).redeem(half);

      expect(await amm.totalLiquidity()).to.equal(liquidity - half);
      expect(await amm.reserveA()).to.equal(LIQUIDITY / 2n);
      expect(await amm.reserveB()).to.equal(LIQUIDITY / 2n);
    });

    it("lets LPs capture value after a swap (no fee)", async function () {
      // Bob swaps A -> B, paying more A into the pool.
      await amm.connect(bob).swap(
        await tokenA.getAddress(),
        SWAP_AMOUNT,
        0
      );

      const liquidity = await amm.getLiquidity(alice.address);
      const reserveA = await amm.reserveA();
      const reserveB = await amm.reserveB();

      const expectedA = (liquidity * reserveA) / (await amm.totalLiquidity());
      const expectedB = (liquidity * reserveB) / (await amm.totalLiquidity());

      const aliceABefore = await tokenA.balanceOf(alice.address);
      const aliceBBefore = await tokenB.balanceOf(alice.address);

      await amm.connect(alice).redeem(liquidity);

      expect(await tokenA.balanceOf(alice.address)).to.equal(
        aliceABefore + expectedA
      );
      expect(await tokenB.balanceOf(alice.address)).to.equal(
        aliceBBefore + expectedB
      );
      // Alice receives more A than she deposited because of Bob's swap.
      expect(expectedA).to.be.gt(LIQUIDITY);
    });

    it("reverts when redeem amount is zero", async function () {
      await expect(
        amm.connect(alice).redeem(0)
      ).to.be.revertedWithCustomError(amm, "ZeroAmount");
    });

    it("reverts when redeeming more than owned", async function () {
      const liquidity = await amm.getLiquidity(alice.address);

      await expect(
        amm.connect(alice).redeem(liquidity + 1n)
      ).to.be.revertedWithCustomError(amm, "InsufficientLiquidity");
    });

    it("reverts when tokenA transfer fails", async function () {
      const liquidity = await amm.getLiquidity(alice.address);
      await tokenA.setFailTransfers(true);

      await expect(
        amm.connect(alice).redeem(liquidity)
      ).to.be.revertedWithCustomError(amm, "TransferFailed");
    });

    it("reverts when tokenB transfer fails", async function () {
      const liquidity = await amm.getLiquidity(alice.address);
      await tokenB.setFailTransfers(true);

      await expect(
        amm.connect(alice).redeem(liquidity)
      ).to.be.revertedWithCustomError(amm, "TransferFailed");
    });
  });

  describe("Swap", function () {
    beforeEach(async function () {
      await amm.connect(alice).deposit(LIQUIDITY, LIQUIDITY);
    });

    it("swaps Token A for Token B and preserves k (flooring aside)", async function () {
      const reserveABefore = await amm.reserveA();
      const reserveBBefore = await amm.reserveB();
      const kBefore = reserveABefore * reserveBBefore;

      const expectedOut = await amm.getAmountOut(
        SWAP_AMOUNT,
        reserveABefore,
        reserveBBefore
      );

      const bobBBefore = await tokenB.balanceOf(bob.address);

      await expect(
        amm.connect(bob).swap(
          await tokenA.getAddress(),
          SWAP_AMOUNT,
          expectedOut
        )
      )
        .to.emit(amm, "TokensSwapped")
        .withArgs(
          bob.address,
          await tokenA.getAddress(),
          SWAP_AMOUNT,
          await tokenB.getAddress(),
          expectedOut
        );

      expect(await tokenB.balanceOf(bob.address)).to.equal(
        bobBBefore + expectedOut
      );
      expect(await amm.reserveA()).to.equal(reserveABefore + SWAP_AMOUNT);
      expect(await amm.reserveB()).to.equal(reserveBBefore - expectedOut);

      const kAfter = (await amm.reserveA()) * (await amm.reserveB());
      expect(kAfter).to.be.gte(kBefore);
    });

    it("swaps Token B for Token A", async function () {
      const expectedOut = await amm.getAmountOut(
        SWAP_AMOUNT,
        await amm.reserveB(),
        await amm.reserveA()
      );

      await amm.connect(bob).swap(
        await tokenB.getAddress(),
        SWAP_AMOUNT,
        expectedOut
      );

      expect(await amm.reserveB()).to.equal(LIQUIDITY + SWAP_AMOUNT);
      expect(await amm.reserveA()).to.equal(LIQUIDITY - expectedOut);
    });

    it("reverts when amountIn is zero", async function () {
      await expect(
        amm.connect(bob).swap(await tokenA.getAddress(), 0, 0)
      ).to.be.revertedWithCustomError(amm, "ZeroAmount");
    });

    it("reverts for an invalid token", async function () {
      await expect(
        amm.connect(bob).swap(ethers.ZeroAddress, SWAP_AMOUNT, 0)
      ).to.be.revertedWithCustomError(amm, "InvalidSwapToken");
    });

    it("reverts when the pool has no liquidity", async function () {
      const emptyPool = await deployPool(
        await tokenA.getAddress(),
        await tokenB.getAddress()
      );
      await tokenA.connect(bob).approve(await emptyPool.getAddress(), SWAP_AMOUNT);

      await expect(
        emptyPool.connect(bob).swap(await tokenA.getAddress(), SWAP_AMOUNT, 0)
      ).to.be.revertedWithCustomError(emptyPool, "InsufficientLiquidity");
    });

    it("reverts when output is below minAmountOut (slippage)", async function () {
      const expectedOut = await amm.getAmountOut(
        SWAP_AMOUNT,
        await amm.reserveA(),
        await amm.reserveB()
      );

      await expect(
        amm.connect(bob).swap(
          await tokenA.getAddress(),
          SWAP_AMOUNT,
          expectedOut + 1n
        )
      ).to.be.revertedWithCustomError(amm, "InsufficientOutputAmount");
    });

    it("reverts when amountOut rounds to zero", async function () {
      await expect(
        amm.connect(bob).swap(await tokenA.getAddress(), 1n, 0)
      ).to.be.revertedWithCustomError(amm, "InsufficientLiquidity");
    });

    it("reverts when input transferFrom fails", async function () {
      await tokenA.setFailTransferFrom(true);

      await expect(
        amm.connect(bob).swap(await tokenA.getAddress(), SWAP_AMOUNT, 0)
      ).to.be.revertedWithCustomError(amm, "TransferFailed");
    });

    it("reverts when output transfer fails", async function () {
      await tokenB.setFailTransfers(true);

      await expect(
        amm.connect(bob).swap(await tokenA.getAddress(), SWAP_AMOUNT, 0)
      ).to.be.revertedWithCustomError(amm, "TransferFailed");
    });
  });

  describe("Internal math via harness", function () {
    let harness;

    beforeEach(async function () {
      const MathHarness = await ethers.getContractFactory("MathHarness");
      harness = await MathHarness.deploy(
        await tokenA.getAddress(),
        await tokenB.getAddress()
      );
    });

    it("covers sqrt branches including zero", async function () {
      expect(await harness.sqrt(0n)).to.equal(0n);
      expect(await harness.sqrt(1n)).to.equal(1n);
      expect(await harness.sqrt(2n)).to.equal(1n);
      expect(await harness.sqrt(3n)).to.equal(1n);
      expect(await harness.sqrt(4n)).to.equal(2n);
      expect(await harness.sqrt(ethers.parseEther("400") * ethers.parseEther("100")))
        .to.equal(ethers.parseEther("200"));
    });

    it("covers both min branches", async function () {
      expect(await harness.min(1n, 2n)).to.equal(1n);
      expect(await harness.min(5n, 3n)).to.equal(3n);
      expect(await harness.min(7n, 7n)).to.equal(7n);
    });
  });
});
