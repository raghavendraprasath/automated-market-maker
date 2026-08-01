"use client";

import { useMemo, useState } from "react";
import { erc20Abi, maxUint256, type Address } from "viem";

import { simpleAmmAbi } from "@/lib/abis";
import { applySlippage, getAmountOut, priceImpact } from "@/lib/amm";
import { SLIPPAGE_OPTIONS } from "@/lib/constants";
import { targetChainId } from "@/lib/deployments";
import {
  formatAmount,
  formatNumber,
  formatPercent,
  parseAmount,
  toInputAmount,
} from "@/lib/format";
import type { Pool } from "@/lib/hooks/usePools";
import { useTxRunner } from "@/lib/hooks/useTxRunner";
import { AmountField, Stat, TxFeedback } from "./ui";

type Position = {
  balanceA: bigint;
  balanceB: bigint;
  allowanceA: bigint;
  allowanceB: bigint;
};

export function SwapForm({
  pool,
  account,
  position,
}: {
  pool: Pool;
  account?: Address;
  position: Position;
}) {
  const [aToB, setAToB] = useState(true);
  const [amount, setAmount] = useState("");
  const [slippageBps, setSlippageBps] = useState<number>(SLIPPAGE_OPTIONS[1]);

  const { state, run } = useTxRunner();

  const tokenIn = aToB ? pool.tokenA : pool.tokenB;
  const tokenOut = aToB ? pool.tokenB : pool.tokenA;
  const reserveIn = aToB ? pool.reserveA : pool.reserveB;
  const reserveOut = aToB ? pool.reserveB : pool.reserveA;
  const balanceIn = aToB ? position.balanceA : position.balanceB;
  const allowanceIn = aToB ? position.allowanceA : position.allowanceB;

  const amountIn = parseAmount(amount, tokenIn.decimals);

  const quote = useMemo(() => {
    if (!amountIn) return undefined;

    const amountOut = getAmountOut(amountIn, reserveIn, reserveOut);
    if (amountOut === 0n) return undefined;

    const minAmountOut = applySlippage(amountOut, slippageBps);
    const executionPrice =
      Number(amountOut) /
      10 ** tokenOut.decimals /
      (Number(amountIn) / 10 ** tokenIn.decimals);

    return {
      amountOut,
      minAmountOut,
      executionPrice,
      impact: priceImpact(amountIn, reserveIn),
    };
  }, [
    amountIn,
    reserveIn,
    reserveOut,
    slippageBps,
    tokenIn.decimals,
    tokenOut.decimals,
  ]);

  const insufficientBalance = Boolean(amountIn && amountIn > balanceIn);
  const needsApproval = Boolean(amountIn && allowanceIn < amountIn);
  const emptyPool = pool.totalLiquidity === 0n;

  const disabled =
    !account ||
    !amountIn ||
    !quote ||
    insufficientBalance ||
    emptyPool ||
    state.status === "pending";

  async function submit() {
    if (!amountIn || !quote) return;

    const steps = [];

    if (needsApproval) {
      steps.push({
        label: `Approve ${tokenIn.symbol}`,
        request: {
          address: tokenIn.address,
          abi: erc20Abi,
          functionName: "approve",
          args: [pool.address, maxUint256],
          chainId: targetChainId,
        },
      });
    }

    steps.push({
      label: `Swap ${tokenIn.symbol} for ${tokenOut.symbol}`,
      request: {
        address: pool.address,
        abi: simpleAmmAbi,
        functionName: "swap",
        args: [tokenIn.address, amountIn, quote.minAmountOut],
        chainId: targetChainId,
      },
    });

    const ok = await run(steps);
    if (ok) setAmount("");
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          Sell <span className="text-ink">{tokenIn.symbol}</span> for{" "}
          <span className="text-ink">{tokenOut.symbol}</span>
        </p>
        <button
          type="button"
          className="btn btn-ghost px-2.5 py-1 text-xs"
          onClick={() => {
            setAToB((value) => !value);
            setAmount("");
          }}
        >
          Flip direction
        </button>
      </div>

      <AmountField
        label={`You pay (${tokenIn.symbol})`}
        value={amount}
        onChange={setAmount}
        suffix={tokenIn.symbol}
        onMax={() => setAmount(toInputAmount(balanceIn, tokenIn.decimals))}
        hint={
          <span className="mono">
            balance {formatAmount(balanceIn, tokenIn.decimals, 4)}
          </span>
        }
      />

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted">Max slippage</span>
        <div className="flex gap-1">
          {SLIPPAGE_OPTIONS.map((bps) => (
            <button
              key={bps}
              type="button"
              onClick={() => setSlippageBps(bps)}
              className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                slippageBps === bps
                  ? "border-accent text-accent-soft"
                  : "border-line text-muted hover:text-ink"
              }`}
            >
              {bps / 100}%
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat
          label="You receive"
          value={
            quote
              ? `${formatAmount(quote.amountOut, tokenOut.decimals, 6)} ${tokenOut.symbol}`
              : "-"
          }
          hint={
            quote
              ? `min ${formatAmount(quote.minAmountOut, tokenOut.decimals, 6)} after slippage`
              : "enter an amount"
          }
        />
        <Stat
          label="Execution price"
          value={
            quote
              ? `${formatNumber(quote.executionPrice, 6)} ${tokenOut.symbol}`
              : "-"
          }
          hint={
            quote
              ? `price impact ${formatPercent(quote.impact)}`
              : `per 1 ${tokenIn.symbol}`
          }
        />
      </div>

      <button
        type="button"
        className="btn btn-primary w-full"
        disabled={disabled}
        onClick={submit}
      >
        {!account
          ? "Connect wallet to swap"
          : emptyPool
            ? "Pool has no liquidity"
            : insufficientBalance
              ? `Insufficient ${tokenIn.symbol} balance`
              : state.status === "pending"
                ? state.label ?? "Confirming..."
                : needsApproval
                  ? `Approve and swap`
                  : `Swap ${tokenIn.symbol} for ${tokenOut.symbol}`}
      </button>

      <TxFeedback state={state} chainId={targetChainId} />
    </div>
  );
}
