"use client";

import { useMemo, useState } from "react";
import { erc20Abi, maxUint256, type Address } from "viem";

import { simpleAmmAbi } from "@/lib/abis";
import { matchingDepositAmount, previewDepositShares } from "@/lib/amm";
import { LP_DECIMALS } from "@/lib/constants";
import { targetChainId } from "@/lib/deployments";
import { formatAmount, formatNumber, formatPercent, parseAmount } from "@/lib/format";
import type { Pool } from "@/lib/hooks/usePools";
import { useTxRunner } from "@/lib/hooks/useTxRunner";
import { AmountField, Stat, TxFeedback } from "./ui";

type Position = {
  balanceA: bigint;
  balanceB: bigint;
  allowanceA: bigint;
  allowanceB: bigint;
};

export function DepositForm({
  pool,
  account,
  position,
}: {
  pool: Pool;
  account?: Address;
  position: Position;
}) {
  const [amountAInput, setAmountAInput] = useState("");
  const [amountBInput, setAmountBInput] = useState("");

  const { state, run } = useTxRunner();

  const amountA = parseAmount(amountAInput, pool.tokenA.decimals);
  const amountB = parseAmount(amountBInput, pool.tokenB.decimals);
  const isSeeded = pool.totalLiquidity > 0n;

  const preview = useMemo(() => {
    if (!amountA || !amountB) return undefined;

    const shares = previewDepositShares(
      amountA,
      amountB,
      pool.reserveA,
      pool.reserveB,
      pool.totalLiquidity
    );

    const newTotal = pool.totalLiquidity + shares;
    return {
      shares,
      poolShare: newTotal > 0n ? Number(shares) / Number(newTotal) : 0,
    };
  }, [amountA, amountB, pool.reserveA, pool.reserveB, pool.totalLiquidity]);

  /** Keeps the two inputs on the pool's current ratio, the way Uniswap's add-liquidity form does. */
  function syncFromA(value: string) {
    setAmountAInput(value);
    if (!isSeeded) return;

    const parsed = parseAmount(value, pool.tokenA.decimals);
    if (!parsed) {
      setAmountBInput("");
      return;
    }

    const matched = matchingDepositAmount(parsed, pool.reserveA, pool.reserveB);
    setAmountBInput(
      formatAmount(matched, pool.tokenB.decimals, pool.tokenB.decimals)
    );
  }

  function syncFromB(value: string) {
    setAmountBInput(value);
    if (!isSeeded) return;

    const parsed = parseAmount(value, pool.tokenB.decimals);
    if (!parsed) {
      setAmountAInput("");
      return;
    }

    const matched = matchingDepositAmount(parsed, pool.reserveB, pool.reserveA);
    setAmountAInput(
      formatAmount(matched, pool.tokenA.decimals, pool.tokenA.decimals)
    );
  }

  const insufficient =
    (amountA !== undefined && amountA > position.balanceA) ||
    (amountB !== undefined && amountB > position.balanceB);

  const disabled =
    !account ||
    !amountA ||
    !amountB ||
    insufficient ||
    preview?.shares === 0n ||
    state.status === "pending";

  async function submit() {
    if (!amountA || !amountB) return;

    const steps = [];

    if (position.allowanceA < amountA) {
      steps.push({
        label: `Approve ${pool.tokenA.symbol}`,
        request: {
          address: pool.tokenA.address,
          abi: erc20Abi,
          functionName: "approve",
          args: [pool.address, maxUint256],
          chainId: targetChainId,
        },
      });
    }

    if (position.allowanceB < amountB) {
      steps.push({
        label: `Approve ${pool.tokenB.symbol}`,
        request: {
          address: pool.tokenB.address,
          abi: erc20Abi,
          functionName: "approve",
          args: [pool.address, maxUint256],
          chainId: targetChainId,
        },
      });
    }

    steps.push({
      label: "Deposit liquidity",
      request: {
        address: pool.address,
        abi: simpleAmmAbi,
        functionName: "deposit",
        args: [amountA, amountB],
        chainId: targetChainId,
      },
    });

    const ok = await run(steps);
    if (ok) {
      setAmountAInput("");
      setAmountBInput("");
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        {isSeeded
          ? "Amounts stay matched to the current reserve ratio; an unbalanced deposit only mints shares for the scarcer side."
          : "First deposit sets the starting price and mints sqrt(amountA · amountB) shares."}
      </p>

      <AmountField
        label={`Deposit ${pool.tokenA.symbol}`}
        value={amountAInput}
        onChange={syncFromA}
        suffix={pool.tokenA.symbol}
        onMax={() =>
          syncFromA(
            formatAmount(position.balanceA, pool.tokenA.decimals, pool.tokenA.decimals)
          )
        }
        hint={
          <span className="mono">
            balance {formatAmount(position.balanceA, pool.tokenA.decimals, 4)}
          </span>
        }
      />

      <AmountField
        label={`Deposit ${pool.tokenB.symbol}`}
        value={amountBInput}
        onChange={syncFromB}
        suffix={pool.tokenB.symbol}
        onMax={() =>
          syncFromB(
            formatAmount(position.balanceB, pool.tokenB.decimals, pool.tokenB.decimals)
          )
        }
        hint={
          <span className="mono">
            balance {formatAmount(position.balanceB, pool.tokenB.decimals, 4)}
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-2">
        <Stat
          label="LP shares minted"
          value={
            preview ? formatAmount(preview.shares, LP_DECIMALS, 6) : "-"
          }
          hint={
            preview
              ? `${formatPercent(preview.poolShare)} of the pool`
              : "enter both amounts"
          }
        />
        <Stat
          label="Deposit ratio"
          value={
            amountA && amountB
              ? formatNumber(
                  Number(amountB) /
                    10 ** pool.tokenB.decimals /
                    (Number(amountA) / 10 ** pool.tokenA.decimals),
                  6
                )
              : "-"
          }
          hint={`${pool.tokenB.symbol} per ${pool.tokenA.symbol}`}
        />
      </div>

      <button
        type="button"
        className="btn btn-primary w-full"
        disabled={disabled}
        onClick={submit}
      >
        {!account
          ? "Connect wallet to deposit"
          : insufficient
            ? "Insufficient balance"
            : state.status === "pending"
              ? state.label ?? "Confirming..."
              : "Deposit"}
      </button>

      <TxFeedback state={state} chainId={targetChainId} />
    </div>
  );
}
