const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SimpleAMMFactory", function () {
  let owner;

  let factory;
  let tokenA;
  let tokenB;
  let tokenC;

  const INITIAL_SUPPLY = ethers.parseEther("1000000");

  beforeEach(async function () {
    [owner] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    tokenA = await MockERC20.deploy("Token A", "TKA", INITIAL_SUPPLY);
    tokenB = await MockERC20.deploy("Token B", "TKB", INITIAL_SUPPLY);
    tokenC = await MockERC20.deploy("Token C", "TKC", INITIAL_SUPPLY);

    const SimpleAMMFactory = await ethers.getContractFactory(
      "SimpleAMMFactory"
    );
    factory = await SimpleAMMFactory.deploy();
  });

  it("starts empty", async function () {
    expect(await factory.allPairsLength()).to.equal(0);
    expect(await factory.getAllPairs()).to.deep.equal([]);
    expect(
      await factory.getPair(
        await tokenA.getAddress(),
        await tokenB.getAddress()
      )
    ).to.equal(ethers.ZeroAddress);
  });

  it("creates a pool and indexes it under both token orderings", async function () {
    const addressA = await tokenA.getAddress();
    const addressB = await tokenB.getAddress();

    await expect(factory.createPair(addressA, addressB))
      .to.emit(factory, "PairCreated")
      .withArgs(addressA, addressB, anyAddress(), 0);

    const pair = await factory.getPair(addressA, addressB);
    expect(pair).to.not.equal(ethers.ZeroAddress);
    expect(await factory.getPair(addressB, addressA)).to.equal(pair);
    expect(await factory.allPairs(0)).to.equal(pair);
    expect(await factory.allPairsLength()).to.equal(1);
    expect(await factory.getAllPairs()).to.deep.equal([pair]);

    // The deployed pool is a fully functional SimpleAMM wired to the right tokens.
    const amm = await ethers.getContractAt("SimpleAMM", pair);
    expect(await amm.tokenA()).to.equal(addressA);
    expect(await amm.tokenB()).to.equal(addressB);
    expect(await amm.totalLiquidity()).to.equal(0);
  });

  it("tracks multiple pools in creation order", async function () {
    const addressA = await tokenA.getAddress();
    const addressB = await tokenB.getAddress();
    const addressC = await tokenC.getAddress();

    await factory.createPair(addressA, addressB);
    await expect(factory.createPair(addressB, addressC))
      .to.emit(factory, "PairCreated")
      .withArgs(addressB, addressC, anyAddress(), 1);

    const pairs = await factory.getAllPairs();
    expect(pairs.length).to.equal(2);
    expect(pairs[0]).to.equal(await factory.getPair(addressA, addressB));
    expect(pairs[1]).to.equal(await factory.getPair(addressB, addressC));
  });

  it("reverts when the pool already exists in either ordering", async function () {
    const addressA = await tokenA.getAddress();
    const addressB = await tokenB.getAddress();

    await factory.createPair(addressA, addressB);

    await expect(
      factory.createPair(addressA, addressB)
    ).to.be.revertedWithCustomError(factory, "PairAlreadyExists");

    await expect(
      factory.createPair(addressB, addressA)
    ).to.be.revertedWithCustomError(factory, "PairAlreadyExists");
  });

  it("propagates SimpleAMM constructor validation", async function () {
    const addressA = await tokenA.getAddress();
    const amm = await ethers.getContractFactory("SimpleAMM");

    await expect(
      factory.createPair(ethers.ZeroAddress, addressA)
    ).to.be.revertedWithCustomError(amm, "InvalidTokenAddress");

    await expect(
      factory.createPair(addressA, ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(amm, "InvalidTokenAddress");

    await expect(
      factory.createPair(addressA, addressA)
    ).to.be.revertedWithCustomError(amm, "IdenticalTokens");
  });

  it("deploys pools that trade independently", async function () {
    const addressA = await tokenA.getAddress();
    const addressB = await tokenB.getAddress();
    const addressC = await tokenC.getAddress();

    await factory.createPair(addressA, addressB);
    await factory.createPair(addressB, addressC);

    const poolAB = await ethers.getContractAt(
      "SimpleAMM",
      await factory.getPair(addressA, addressB)
    );
    const poolBC = await ethers.getContractAt(
      "SimpleAMM",
      await factory.getPair(addressB, addressC)
    );

    const liquidity = ethers.parseEther("1000");
    for (const [pool, first, second] of [
      [poolAB, tokenA, tokenB],
      [poolBC, tokenB, tokenC],
    ]) {
      await first.approve(await pool.getAddress(), INITIAL_SUPPLY);
      await second.approve(await pool.getAddress(), INITIAL_SUPPLY);
      await pool.deposit(liquidity, liquidity);
    }

    await poolAB.swap(addressA, ethers.parseEther("100"), 0);

    expect(await poolAB.reserveA()).to.equal(liquidity + ethers.parseEther("100"));
    // The second pool is untouched by trades in the first.
    expect(await poolBC.reserveA()).to.equal(liquidity);
    expect(await poolBC.reserveB()).to.equal(liquidity);
  });

  // Matches any address in an event assertion.
  function anyAddress() {
    return (value) => ethers.isAddress(value);
  }
});
