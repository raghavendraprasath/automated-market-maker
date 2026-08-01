/**
 * Deploys the Homework 5 stack and seeds it with liquidity and trade history:
 *
 *   1. three mock ERC-20 tokens (public `mint`, so the UI can offer a faucet)
 *   2. the SimpleAMMFactory
 *   3. three pools created through the factory
 *   4. initial liquidity plus a handful of swaps, so the UI charts have data immediately
 *
 * The resulting addresses (and the factory's deployment block, used as `fromBlock` for
 * `eth_getLogs`) are written to `web/lib/deployments.json` keyed by chain id.
 *
 * Usage:
 *   npx hardhat run scripts/deploy.js --network localhost
 *   npx hardhat run scripts/deploy.js --network sepolia
 */
const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

const TOKEN_SUPPLY = ethers.parseEther("10000000");

const TOKENS = [
  { key: "WETH", name: "Mock Wrapped Ether", symbol: "mWETH" },
  { key: "USDC", name: "Mock USD Coin", symbol: "mUSDC" },
  { key: "DAI", name: "Mock Dai Stablecoin", symbol: "mDAI" },
];

// Reserve ratios double as starting prices: 3000 mUSDC per mWETH, 2950 mDAI per mWETH, 1:1 stables.
const POOLS = [
  { a: "WETH", b: "USDC", amountA: "10", amountB: "30000" },
  { a: "WETH", b: "DAI", amountA: "8", amountB: "23600" },
  { a: "USDC", b: "DAI", amountA: "50000", amountB: "50000" },
];

// Seed trades so the execution-price distribution chart is populated on first load.
const SEED_SWAPS = [
  { pool: 0, tokenIn: "WETH", amountIn: "0.4" },
  { pool: 0, tokenIn: "USDC", amountIn: "900" },
  { pool: 0, tokenIn: "WETH", amountIn: "0.15" },
  { pool: 0, tokenIn: "USDC", amountIn: "2500" },
  { pool: 0, tokenIn: "WETH", amountIn: "0.6" },
  { pool: 1, tokenIn: "DAI", amountIn: "1200" },
  { pool: 1, tokenIn: "WETH", amountIn: "0.25" },
  { pool: 2, tokenIn: "USDC", amountIn: "4000" },
  { pool: 2, tokenIn: "DAI", amountIn: "1500" },
];

// A later deposit raises k, so the curve chart shows a shifted curve (and its predecessor)
// immediately, and the trades after it land on the new curve.
const TOP_UP = { pool: 0, amountA: "2" };
const POST_DEPOSIT_SWAPS = [
  { pool: 0, tokenIn: "USDC", amountIn: "1800" },
  { pool: 0, tokenIn: "WETH", amountIn: "0.35" },
];

const OUTPUT_FILE = path.join(__dirname, "..", "web", "lib", "deployments.json");
const RECORD_DIR = path.join(__dirname, "..", "deployments");

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);

  console.log(`Network:  ${network.name} (chainId ${chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(
    `Balance:  ${ethers.formatEther(
      await ethers.provider.getBalance(deployer.address)
    )} ETH\n`
  );

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const tokens = {};

  for (const token of TOKENS) {
    const contract = await MockERC20.deploy(
      token.name,
      token.symbol,
      TOKEN_SUPPLY
    );
    await contract.waitForDeployment();

    tokens[token.key] = {
      ...token,
      contract,
      address: await contract.getAddress(),
    };

    console.log(`Token  ${token.symbol.padEnd(6)} ${tokens[token.key].address}`);
  }

  const SimpleAMMFactory = await ethers.getContractFactory("SimpleAMMFactory");
  const factory = await SimpleAMMFactory.deploy();
  await factory.waitForDeployment();

  const factoryAddress = await factory.getAddress();
  const deployBlock = (await factory.deploymentTransaction().wait()).blockNumber;

  console.log(`\nFactory       ${factoryAddress}`);
  console.log(`Deploy block  ${deployBlock}\n`);

  const pools = [];

  for (const spec of POOLS) {
    const tokenA = tokens[spec.a];
    const tokenB = tokens[spec.b];

    await (await factory.createPair(tokenA.address, tokenB.address)).wait();

    const poolAddress = await factory.getPair(tokenA.address, tokenB.address);
    const pool = await ethers.getContractAt("SimpleAMM", poolAddress);

    await (
      await tokenA.contract.approve(poolAddress, ethers.MaxUint256)
    ).wait();
    await (
      await tokenB.contract.approve(poolAddress, ethers.MaxUint256)
    ).wait();

    const amountA = ethers.parseEther(spec.amountA);
    const amountB = ethers.parseEther(spec.amountB);
    await (await pool.deposit(amountA, amountB)).wait();

    pools.push({
      address: poolAddress,
      contract: pool,
      tokenA: tokenA.symbol,
      tokenB: tokenB.symbol,
      tokenAKey: spec.a,
      tokenBKey: spec.b,
    });

    console.log(
      `Pool   ${tokenA.symbol}/${tokenB.symbol} ${poolAddress} seeded with ` +
        `${spec.amountA} ${tokenA.symbol} + ${spec.amountB} ${tokenB.symbol}`
    );
  }

  console.log("\nSeeding swap history...");
  await runSwaps(SEED_SWAPS, pools, tokens);

  const topUpPool = pools[TOP_UP.pool];
  const [topUpReserveA, topUpReserveB] = await topUpPool.contract.getReserves();
  const topUpAmountA = ethers.parseEther(TOP_UP.amountA);
  const topUpAmountB = (topUpAmountA * topUpReserveB) / topUpReserveA;

  await (await topUpPool.contract.deposit(topUpAmountA, topUpAmountB)).wait();
  console.log(
    `\nTopped up ${topUpPool.tokenA}/${topUpPool.tokenB} with ` +
      `${TOP_UP.amountA} ${topUpPool.tokenA} + ` +
      `${ethers.formatEther(topUpAmountB)} ${topUpPool.tokenB} (k increases)`
  );

  console.log("\nSeeding swaps on the shifted curve...");
  await runSwaps(POST_DEPOSIT_SWAPS, pools, tokens);

  const record = {
    chainId,
    network: network.name,
    factory: factoryAddress,
    deployBlock,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    tokens: TOKENS.map((token) => ({
      name: token.name,
      symbol: token.symbol,
      address: tokens[token.key].address,
    })),
    pools: pools.map((pool) => ({
      address: pool.address,
      tokenA: tokens[pool.tokenAKey].address,
      tokenB: tokens[pool.tokenBKey].address,
      label: `${pool.tokenA}/${pool.tokenB}`,
    })),
  };

  writeDeployments(chainId, record);

  console.log("\nDone. Frontend env values:");
  console.log(`  NEXT_PUBLIC_CHAIN_ID=${chainId}`);
  console.log(`  NEXT_PUBLIC_FACTORY_ADDRESS=${factoryAddress}`);
  console.log(`  NEXT_PUBLIC_DEPLOY_BLOCK=${deployBlock}`);
}

async function runSwaps(swaps, pools, tokens) {
  for (const swap of swaps) {
    const pool = pools[swap.pool];
    const tokenIn = tokens[swap.tokenIn];
    const amountIn = ethers.parseEther(swap.amountIn);

    await (await pool.contract.swap(tokenIn.address, amountIn, 0)).wait();
    console.log(
      `  ${pool.tokenA}/${pool.tokenB}: sold ${swap.amountIn} ${tokenIn.symbol}`
    );
  }
}

function writeDeployments(chainId, record) {
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });

  let existing = {};
  if (fs.existsSync(OUTPUT_FILE)) {
    existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf8"));
  }

  existing[String(chainId)] = record;
  fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(existing, null, 2)}\n`);
  console.log(`\nWrote ${path.relative(process.cwd(), OUTPUT_FILE)}`);

  fs.mkdirSync(RECORD_DIR, { recursive: true });
  const recordFile = path.join(RECORD_DIR, `${record.network}-${chainId}.json`);
  fs.writeFileSync(recordFile, `${JSON.stringify(record, null, 2)}\n`);
  console.log(`Wrote ${path.relative(process.cwd(), recordFile)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
