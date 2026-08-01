"use client";

import type { Address } from "viem";

import { explorerAddressUrl, targetChainId } from "@/lib/deployments";
import { formatCompact, formatNumber, shortAddress, toNumber } from "@/lib/format";
import type { Pool } from "@/lib/hooks/usePools";
import { Card, EmptyState, Spinner } from "./ui";

export function PoolSelector({
  pools,
  selected,
  onSelect,
  isLoading,
  factory,
}: {
  pools: Pool[];
  selected?: Address;
  onSelect: (address: Address) => void;
  isLoading: boolean;
  factory?: Address;
}) {
  const factoryUrl = factory
    ? explorerAddressUrl(targetChainId, factory)
    : undefined;

  return (
    <Card
      title="Pools"
      action={
        factory && (
          <span className="mono text-[11px] text-muted">
            factory{" "}
            {factoryUrl ? (
              <a
                className="hover:text-accent-soft"
                href={factoryUrl}
                target="_blank"
                rel="noreferrer"
              >
                {shortAddress(factory)}
              </a>
            ) : (
              shortAddress(factory)
            )}
          </span>
        )
      }
    >
      {isLoading && pools.length === 0 && <Spinner label="Reading pools from the factory..." />}

      {!isLoading && pools.length === 0 && (
        <EmptyState>
          No pools found. Deploy the contracts and point{" "}
          <span className="mono">NEXT_PUBLIC_FACTORY_ADDRESS</span> at the factory.
        </EmptyState>
      )}

      <div className="grid gap-2">
        {pools.map((pool) => {
          const reserveA = toNumber(pool.reserveA, pool.tokenA.decimals);
          const reserveB = toNumber(pool.reserveB, pool.tokenB.decimals);
          const price = reserveA > 0 ? reserveB / reserveA : 0;
          const isSelected = pool.address === selected;

          return (
            <button
              key={pool.address}
              type="button"
              onClick={() => onSelect(pool.address)}
              className={`rounded-xl border px-3.5 py-3 text-left transition ${
                isSelected
                  ? "border-accent bg-accent/10"
                  : "border-line bg-surface-2/40 hover:border-accent/60"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="whitespace-nowrap text-sm font-semibold">
                  {pool.label}
                </span>
                <span className="mono text-right text-[11px] leading-tight text-muted">
                  1 {pool.tokenA.symbol} = {formatNumber(price, 2)}{" "}
                  {pool.tokenB.symbol}
                </span>
              </div>
              <div className="mono mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted">
                <span>
                  {formatCompact(reserveA)} {pool.tokenA.symbol}
                </span>
                <span>
                  {formatCompact(reserveB)} {pool.tokenB.symbol}
                </span>
                {pool.userLiquidity > 0n && (
                  <span className="text-teal">
                    your LP {formatCompact(toNumber(pool.userLiquidity, 18))}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
