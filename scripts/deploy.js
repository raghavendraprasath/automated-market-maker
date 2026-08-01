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

// Seeding takes ~30 sequential transactions, which on a public testnet RPC means several
// minutes of round trips. Dropped connections are routine over that window, so every call
// is retried rather than losing the whole run to one blip.
const TRANSIENT_ERROR =
  /invalid json-rpc response|connection termination|connection reset|econnreset|etimedout|socket hang up|socket disconnected|network socket|timeout|bad gateway|service unavailable|50[234]|too many requests|rate limit/i;

// A retry can race a transaction the previous attempt already broadcast.
const ALREADY_BROADCAST =
  /already known|nonce too low|replacement transaction underpriced|already exists/i;

const RETRY_ATTEMPTS = 6;

let deployerAddress;

async function main() {
  const [deployer] = await ethers.getSigners();
  deployerAddress = deployer.address;
  const chainId = Number((await withRetry("getNetwork", () => ethers.provider.getNetwork())).chainId);

  console.log(`Network:  ${network.name} (chainId ${chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(
    `Balance:  ${ethers.formatEther(
      await withRetry("getBalance", () =>
        ethers.provider.getBalance(deployer.address)
      )
    )} ETH\n`
  );

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const tokens = {};

  for (const token of TOKENS) {
    const contract = await withRetry(`deploy ${token.symbol}`, async () => {
      const deployed = await MockERC20.deploy(
        token.name,
        token.symbol,
        TOKEN_SUPPLY
      );
      await deployed.waitForDeployment();
      return deployed;
    });

    tokens[token.key] = {
      ...token,
      contract,
      address: await contract.getAddress(),
    };

    console.log(`Token  ${token.symbol.padEnd(6)} ${tokens[token.key].address}`);
  }

  const SimpleAMMFactory = await ethers.getContractFactory("SimpleAMMFactory");
  const factory = await withRetry("deploy SimpleAMMFactory", async () => {
    const deployed = await SimpleAMMFactory.deploy();
    await deployed.waitForDeployment();
    return deployed;
  });

  const factoryAddress = await factory.getAddress();
  const deployBlock = (
    await withRetry("factory receipt", () =>
      factory.deploymentTransaction().wait()
    )
  ).blockNumber;

  console.log(`\nFactory       ${factoryAddress}`);
  console.log(`Deploy block  ${deployBlock}\n`);

  const pools = [];

  for (const spec of POOLS) {
    const tokenA = tokens[spec.a];
    const tokenB = tokens[spec.b];

    await sendTx(`createPair ${tokenA.symbol}/${tokenB.symbol}`, () =>
      factory.createPair(tokenA.address, tokenB.address)
    );

    const poolAddress = await withRetry("getPair", () =>
      factory.getPair(tokenA.address, tokenB.address)
    );
    const pool = await ethers.getContractAt("SimpleAMM", poolAddress);

    await sendTx(`approve ${tokenA.symbol}`, () =>
      tokenA.contract.approve(poolAddress, ethers.MaxUint256)
    );
    await sendTx(`approve ${tokenB.symbol}`, () =>
      tokenB.contract.approve(poolAddress, ethers.MaxUint256)
    );

    const amountA = ethers.parseEther(spec.amountA);
    const amountB = ethers.parseEther(spec.amountB);
    await sendTx(`deposit ${tokenA.symbol}/${tokenB.symbol}`, () =>
      pool.deposit(amountA, amountB)
    );

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
  const [topUpReserveA, topUpReserveB] = await withRetry("getReserves", () =>
    topUpPool.contract.getReserves()
  );
  const topUpAmountA = ethers.parseEther(TOP_UP.amountA);
  const topUpAmountB = (topUpAmountA * topUpReserveB) / topUpReserveA;

  await sendTx("top-up deposit", () =>
    topUpPool.contract.deposit(topUpAmountA, topUpAmountB)
  );
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

    await sendTx(`swap ${swap.amountIn} ${tokenIn.symbol}`, () =>
      pool.contract.swap(tokenIn.address, amountIn, 0)
    );
    console.log(
      `  ${pool.tokenA}/${pool.tokenB}: sold ${swap.amountIn} ${tokenIn.symbol}`
    );
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorText(error) {
  return [
    error.shortMessage,
    error.info?.error?.message,
    error.message,
  ]
    .filter(Boolean)
    .join(" ");
}

async function withRetry(label, run) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      const text = errorText(error);
      if (attempt >= RETRY_ATTEMPTS || !TRANSIENT_ERROR.test(text)) throw error;

      const seconds = 3 * attempt;
      console.log(
        `  ! ${label}: ${text.split("\n")[0].slice(0, 90)} - retry ${attempt} in ${seconds}s`
      );
      await sleep(seconds * 1000);
    }
  }
}

/**
 * Sends a transaction and waits for it, retrying transient RPC failures. A connection can
 * drop after the node accepted the transaction but before we read the hash back, so a retry
 * may collide with the in-flight original; that surfaces as "already known"/"nonce too low"
 * and only requires waiting for the pending nonce to clear.
 */
async function sendTx(label, send) {
  const sent = await withRetry(label, async () => {
    try {
      return await send();
    } catch (error) {
      if (!ALREADY_BROADCAST.test(errorText(error))) throw error;

      console.log(`  ! ${label}: already broadcast - waiting for it to confirm`);
      await waitForPendingNonce();
      return null;
    }
  });

  if (!sent) return null;
  return withRetry(`${label} confirmation`, () => sent.wait());
}

async function waitForPendingNonce() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const [mined, pending] = await Promise.all([
      withRetry("nonce(latest)", () =>
        ethers.provider.getTransactionCount(deployerAddress, "latest")
      ),
      withRetry("nonce(pending)", () =>
        ethers.provider.getTransactionCount(deployerAddress, "pending")
      ),
    ]);

    if (mined === pending) return;
    await sleep(4000);
  }

  throw new Error("Timed out waiting for a broadcast transaction to confirm");
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
