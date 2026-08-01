"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Address } from "viem";
import { useConnection } from "wagmi";

import { ActionPanel } from "@/components/ActionPanel";
import { ActivityTable } from "@/components/ActivityTable";
import { FaucetCard } from "@/components/FaucetCard";
import { PoolSelector } from "@/components/PoolSelector";
import { PoolStats } from "@/components/PoolStats";
import { PriceDistributionChart } from "@/components/PriceDistributionChart";
import { PriceHistoryChart } from "@/components/PriceHistoryChart";
import { RawLogsPanel } from "@/components/RawLogsPanel";
import { ReservesCurveChart } from "@/components/ReservesCurveChart";
import { WalletButton } from "@/components/WalletButton";
import { Card, EmptyState, Spinner } from "@/components/ui";
import { chainName, targetChainId } from "@/lib/deployments";
import { usePoolHistory } from "@/lib/hooks/usePoolHistory";
import { usePools, useTokenPosition } from "@/lib/hooks/usePools";
import { toSwapExecutions } from "@/lib/logs";

export default function Home() {
  const { address, isConnected, chainId } = useConnection();
  const { pools, deployment, isLoading, error } = usePools(address);

  // Explicit user choice, if any; otherwise the first pool the factory reports.
  const [selected, setSelected] = useState<Address>();
  const pool =
    pools.find((candidate) => candidate.address === selected) ?? pools[0];
  const position = useTokenPosition(pool, address);
  const historyQuery = usePoolHistory(pool?.address);

  const executions = useMemo(() => {
    if (!pool || !historyQuery.data) return [];
    return toSwapExecutions(
      historyQuery.data.swaps,
      pool.tokenA.decimals,
      pool.tokenB.decimals
    );
  }, [historyQuery.data, pool]);

  const wrongChain = isConnected && chainId !== targetChainId;

  const queryClient = useQueryClient();
  const isRefreshing = isLoading || historyQuery.isFetching;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 lg:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            SimpleAMM Console
          </h1>
          <p className="mt-1 text-sm text-muted">
            Constant-product AMM on {chainName(targetChainId)} · swap, deposit and
            redeem, with the reserves curve and past execution prices read from
            chain events.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={isRefreshing}
            onClick={() => queryClient.invalidateQueries()}
            title="Re-read reserves and re-query eth_getLogs"
          >
            {isRefreshing ? "Refreshing..." : "Refresh data"}
          </button>
          <WalletButton />
        </div>
      </header>

      {!deployment?.factory && (
        <Card className="mb-6">
          <EmptyState>
            No factory configured for {chainName(targetChainId)}. Run{" "}
            <span className="mono">npm run deploy:sepolia</span> and set{" "}
            <span className="mono">NEXT_PUBLIC_FACTORY_ADDRESS</span>.
          </EmptyState>
        </Card>
      )}

      {wrongChain && (
        <div className="mb-6 rounded-xl border border-amber/40 bg-amber/10 px-4 py-3 text-sm text-amber">
          Your wallet is on a different network. Switch to{" "}
          {chainName(targetChainId)} to sign transactions; the data below is read
          directly from {chainName(targetChainId)} either way.
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          Failed to read pools: {error.message}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          <PoolSelector
            pools={pools}
            selected={pool?.address}
            onSelect={setSelected}
            isLoading={isLoading}
            factory={deployment?.factory}
          />

          {pool && (
            <>
              <ActionPanel
                pool={pool}
                account={address}
                position={position}
              />
              <FaucetCard
                pool={pool}
                account={address}
                balances={position}
              />
            </>
          )}
        </div>

        <div className="space-y-4">
          {!pool ? (
            <Card>
              {isLoading ? (
                <Spinner label="Loading pools..." />
              ) : (
                <EmptyState>Select a pool to see its charts.</EmptyState>
              )}
            </Card>
          ) : (
            <>
              <PoolStats pool={pool} />
              <ReservesCurveChart
                pool={pool}
                syncs={historyQuery.data?.syncs ?? []}
              />
              <PriceDistributionChart
                pool={pool}
                executions={executions}
                isLoading={historyQuery.isLoading}
              />
              <PriceHistoryChart pool={pool} executions={executions} />
              <ActivityTable
                pool={pool}
                executions={[...executions].reverse()}
                liquidity={historyQuery.data?.liquidity ?? []}
              />
              <RawLogsPanel history={historyQuery.data} />
            </>
          )}
        </div>
      </div>

      <footer className="mt-8 text-[11px] text-muted">
        INFO7500 Homework 5 · SimpleAMM ·{" "}
        {deployment?.factory
          ? `factory ${deployment.factory}`
          : "no deployment configured"}
      </footer>
    </div>
  );
}
