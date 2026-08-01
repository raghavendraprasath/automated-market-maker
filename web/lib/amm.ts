/**
 * Client-side mirrors of the on-chain math in `SimpleAMM.sol`.
 *
 * These run on every keystroke so the UI can preview a trade without an RPC round trip; the
 * integer arithmetic is identical to the contract, so previews match execution exactly.
 */

/** amountOut = (amountIn * reserveOut) / (reserveIn + amountIn) */
export function getAmountOut(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint
): bigint {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0n;
  return (amountIn * reserveOut) / (reserveIn + amountIn);
}

/** Integer square root, matching the contract's Babylonian implementation. */
export function sqrt(value: bigint): bigint {
  if (value <= 3n) return value === 0n ? 0n : 1n;

  let z = value;
  let x = value / 2n + 1n;
  while (x < z) {
    z = x;
    x = (value / x + x) / 2n;
  }
  return z;
}

export function minBigInt(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

/** Liquidity shares `deposit(amountA, amountB)` would mint. */
export function previewDepositShares(
  amountA: bigint,
  amountB: bigint,
  reserveA: bigint,
  reserveB: bigint,
  totalLiquidity: bigint
): bigint {
  if (amountA <= 0n || amountB <= 0n) return 0n;

  if (totalLiquidity === 0n) return sqrt(amountA * amountB);

  return minBigInt(
    (amountA * totalLiquidity) / reserveA,
    (amountB * totalLiquidity) / reserveB
  );
}

/** Tokens returned by `redeem(liquidity)`. */
export function previewRedeem(
  liquidity: bigint,
  reserveA: bigint,
  reserveB: bigint,
  totalLiquidity: bigint
): { amountA: bigint; amountB: bigint } {
  if (liquidity <= 0n || totalLiquidity === 0n) {
    return { amountA: 0n, amountB: 0n };
  }

  return {
    amountA: (liquidity * reserveA) / totalLiquidity,
    amountB: (liquidity * reserveB) / totalLiquidity,
  };
}

/** Second-token amount that keeps a deposit at the current pool ratio. */
export function matchingDepositAmount(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint
): bigint {
  if (amountIn <= 0n || reserveIn <= 0n) return 0n;
  return (amountIn * reserveOut) / reserveIn;
}

export function applySlippage(amountOut: bigint, slippageBps: number): bigint {
  const bps = BigInt(Math.round(slippageBps));
  return (amountOut * (10_000n - bps)) / 10_000n;
}

/**
 * How far the trade's average execution price sits from the pre-trade mid price.
 * For a fee-free constant-product pool this equals amountIn / (reserveIn + amountIn).
 */
export function priceImpact(amountIn: bigint, reserveIn: bigint): number {
  if (amountIn <= 0n || reserveIn <= 0n) return 0;
  return Number(amountIn) / Number(reserveIn + amountIn);
}
