"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatNumber } from "@/lib/format";
import type { Pool } from "@/lib/hooks/usePools";
import { buildPriceHistogram, type SwapExecution } from "@/lib/logs";
import { Card, EmptyState, Stat } from "./ui";

/**
 * Distribution of realized execution prices for past swaps.
 *
 * Every bar is a price bucket; height is how many historical swaps executed in that bucket. Prices
 * are normalized to token B per token A so both trade directions share one axis.
 */
export function PriceDistributionChart({
  pool,
  executions,
  isLoading,
}: {
  pool: Pool;
  executions: SwapExecution[];
  isLoading: boolean;
}) {
  const summary = useMemo(() => {
    if (executions.length === 0) return undefined;

    const prices = executions.map((execution) => execution.executionPrice);
    const sorted = [...prices].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    return {
      bins: buildPriceHistogram(prices, Math.min(10, Math.max(4, sorted.length))),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      median:
        sorted.length % 2 === 0
          ? (sorted[mid - 1] + sorted[mid]) / 2
          : sorted[mid],
      mean: prices.reduce((total, price) => total + price, 0) / prices.length,
      count: prices.length,
      latestMid: executions[executions.length - 1].midPrice,
    };
  }, [executions]);

  const pair = `${pool.tokenB.symbol}/${pool.tokenA.symbol}`;

  return (
    <Card
      title={`Execution price distribution · ${pair}`}
      action={
        summary && (
          <span className="mono text-[11px] text-muted">
            {summary.count} swap{summary.count === 1 ? "" : "s"} from logs
          </span>
        )
      }
    >
      {!summary ? (
        <EmptyState>
          {isLoading
            ? "Querying eth_getLogs for past Swap events..."
            : "No swaps recorded for this pool yet. Make a swap and this histogram fills in."}
        </EmptyState>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Cheapest" value={formatNumber(summary.min, 6)} />
            <Stat label="Median" value={formatNumber(summary.median, 6)} />
            <Stat label="Mean" value={formatNumber(summary.mean, 6)} />
            <Stat label="Priciest" value={formatNumber(summary.max, 6)} />
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={summary.bins}
                margin={{ top: 8, right: 12, bottom: 28, left: 0 }}
              >
                <CartesianGrid stroke="#22304f" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="center"
                  tickFormatter={(value: number) => formatNumber(value, 4)}
                  label={{
                    value: `execution price (${pair})`,
                    position: "insideBottom",
                    offset: -16,
                    fill: "#8b9cc4",
                    fontSize: 11,
                  }}
                />
                <YAxis
                  allowDecimals={false}
                  label={{
                    value: "swaps",
                    angle: -90,
                    position: "insideLeft",
                    fill: "#8b9cc4",
                    fontSize: 11,
                  }}
                />
                <Tooltip
                  cursor={{ fill: "#22304f", fillOpacity: 0.35 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const bin = payload[0].payload as {
                      label: string;
                      count: number;
                    };
                    return (
                      <div className="card mono px-3 py-2 text-[11px]">
                        <p>{bin.label}</p>
                        <p className="text-muted">
                          {bin.count} swap{bin.count === 1 ? "" : "s"}
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {summary.bins.map((bin) => (
                    <Cell
                      key={bin.label}
                      fill={
                        summary.latestMid >= bin.binStart &&
                        summary.latestMid <= bin.binEnd
                          ? "#2dd4bf"
                          : "#6d7cff"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <p className="mt-2 text-[11px] text-muted">
            Highlighted bucket contains the pool&apos;s latest mid price (
            {formatNumber(summary.latestMid, 6)} {pair}). Buy and sell directions are both quoted as{" "}
            {pair}, so trades that pushed the price up sit to the right.
          </p>
        </>
      )}
    </Card>
  );
}
