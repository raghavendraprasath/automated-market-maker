"use client";

import { explorerAddressUrl, targetChainId } from "@/lib/deployments";
import {
  formatAmount,
  formatCompact,
  formatNumber,
  formatPercent,
  shortAddress,
  toNumber,
} from "@/lib/format";
import type { Pool } from "@/lib/hooks/usePools";
import { LP_DECIMALS } from "@/lib/constants";
import { Card, Stat } from "./ui";

export function PoolStats({ pool }: { pool: Pool }) {
  const reserveA = toNumber(pool.reserveA, pool.tokenA.decimals);
  const reserveB = toNumber(pool.reserveB, pool.tokenB.decimals);
  const k = reserveA * reserveB;
  const priceAinB = reserveA > 0 ? reserveB / reserveA : 0;
  const priceBinA = reserveB > 0 ? reserveA / reserveB : 0;

  const totalLp = toNumber(pool.totalLiquidity, LP_DECIMALS);
  const userLp = toNumber(pool.userLiquidity, LP_DECIMALS);
  const share = totalLp > 0 ? userLp / totalLp : 0;

  const poolUrl = explorerAddressUrl(targetChainId, pool.address);

  return (
    <Card
      title="Pool state"
      action={
        <span className="mono text-[11px] text-muted">
          {poolUrl ? (
            <a
              className="hover:text-accent-soft"
              href={poolUrl}
              target="_blank"
              rel="noreferrer"
            >
              {shortAddress(pool.address)}
            </a>
          ) : (
            shortAddress(pool.address)
          )}
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
        <Stat
          label={`Reserve ${pool.tokenA.symbol} (x)`}
          value={formatAmount(pool.reserveA, pool.tokenA.decimals, 4)}
          hint={pool.tokenA.name}
        />
        <Stat
          label={`Reserve ${pool.tokenB.symbol} (y)`}
          value={formatAmount(pool.reserveB, pool.tokenB.decimals, 4)}
          hint={pool.tokenB.name}
        />
        <Stat
          label="Invariant k = x · y"
          value={formatCompact(k)}
          hint="changes only on deposit / redeem"
        />
        <Stat
          label="Mid price"
          value={`${formatNumber(priceAinB, 6)} ${pool.tokenB.symbol}`}
          hint={`per 1 ${pool.tokenA.symbol}`}
        />
        <Stat
          label="Inverse price"
          value={`${formatNumber(priceBinA, 6)} ${pool.tokenA.symbol}`}
          hint={`per 1 ${pool.tokenB.symbol}`}
        />
        <Stat
          label="LP shares"
          value={formatNumber(totalLp, 4)}
          hint={
            userLp > 0
              ? `yours ${formatNumber(userLp, 4)} (${formatPercent(share)})`
              : "you hold none"
          }
        />
      </div>
    </Card>
  );
}
