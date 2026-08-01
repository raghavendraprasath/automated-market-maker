"use client";

import { useMemo, useState } from "react";
import type { Address } from "viem";

import { simpleAmmAbi } from "@/lib/abis";
import { previewRedeem } from "@/lib/amm";
import { LP_DECIMALS } from "@/lib/constants";
import { targetChainId } from "@/lib/deployments";
import { formatAmount, formatPercent, parseAmount } from "@/lib/format";
import type { Pool } from "@/lib/hooks/usePools";
import { useTxRunner } from "@/lib/hooks/useTxRunner";
import { AmountField, Stat, TxFeedback } from "./ui";

const PERCENT_SHORTCUTS = [25, 50, 75, 100] as const;

export function RedeemForm({
  pool,
  account,
}: {
  pool: Pool;
  account?: Address;
}) {
  const [input, setInput] = useState("");
  const { state, run } = useTxRunner();

  const liquidity = parseAmount(input, LP_DECIMALS);

  const preview = useMemo(() => {
    if (!liquidity) return undefined;

    const { amountA, amountB } = previewRedeem(
      liquidity,
      pool.reserveA,
      pool.reserveB,
      pool.totalLiquidity
    );

    return {
      amountA,
      amountB,
      share:
        pool.totalLiquidity > 0n
          ? Number(liquidity) / Number(pool.totalLiquidity)
          : 0,
    };
  }, [liquidity, pool.reserveA, pool.reserveB, pool.totalLiquidity]);

  const tooMuch = Boolean(liquidity && liquidity > pool.userLiquidity);

  const disabled =
    !account ||
    !liquidity ||
    tooMuch ||
    pool.userLiquidity === 0n ||
    state.status === "pending";

  async function submit() {
    if (!liquidity) return;

    const ok = await run([
      {
        label: "Redeem liquidity",
        request: {
          address: pool.address,
          abi: simpleAmmAbi,
          functionName: "redeem",
          args: [liquidity],
          chainId: targetChainId,
        },
      },
    ]);

    if (ok) setInput("");
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Burning shares returns a proportional slice of both reserves at the current ratio.
      </p>

      <AmountField
        label="LP shares to burn"
        value={input}
        onChange={setInput}
        suffix="LP"
        onMax={() =>
          setInput(formatAmount(pool.userLiquidity, LP_DECIMALS, LP_DECIMALS))
        }
        hint={
          <span className="mono">
            yours {formatAmount(pool.userLiquidity, LP_DECIMALS, 6)}
          </span>
        }
      />

      <div className="flex gap-1">
        {PERCENT_SHORTCUTS.map((percent) => (
          <button
            key={percent}
            type="button"
            className="btn btn-ghost flex-1 px-2 py-1 text-[11px]"
            disabled={pool.userLiquidity === 0n}
            onClick={() =>
              setInput(
                formatAmount(
                  (pool.userLiquidity * BigInt(percent)) / 100n,
                  LP_DECIMALS,
                  LP_DECIMALS
                )
              )
            }
          >
            {percent}%
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat
          label={`You receive ${pool.tokenA.symbol}`}
          value={
            preview
              ? formatAmount(preview.amountA, pool.tokenA.decimals, 6)
              : "-"
          }
          hint={preview ? `${formatPercent(preview.share)} of reserves` : undefined}
        />
        <Stat
          label={`You receive ${pool.tokenB.symbol}`}
          value={
            preview
              ? formatAmount(preview.amountB, pool.tokenB.decimals, 6)
              : "-"
          }
          hint={preview ? `${formatPercent(preview.share)} of reserves` : undefined}
        />
      </div>

      <button
        type="button"
        className="btn btn-primary w-full"
        disabled={disabled}
        onClick={submit}
      >
        {!account
          ? "Connect wallet to redeem"
          : pool.userLiquidity === 0n
            ? "You hold no LP shares in this pool"
            : tooMuch
              ? "More than your LP balance"
              : state.status === "pending"
                ? state.label ?? "Confirming..."
                : "Redeem"}
      </button>

      <TxFeedback state={state} chainId={targetChainId} />
    </div>
  );
}
