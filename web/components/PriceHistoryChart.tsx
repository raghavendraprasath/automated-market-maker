"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatNumber } from "@/lib/format";
import type { Pool } from "@/lib/hooks/usePools";
import type { SwapExecution } from "@/lib/logs";
import { Card, EmptyState } from "./ui";

/**
 * Execution price of each past swap against the pool's mid price, ordered by block.
 *
 * Same log data as the histogram, arranged over time: it shows how each trade pushed the mid price
 * and how far its realized price sat from the mid (the constant-product slippage).
 */
export function PriceHistoryChart({
  pool,
  executions,
}: {
  pool: Pool;
  executions: SwapExecution[];
}) {
  const data = useMemo(
    () =>
      executions.map((execution) => ({
        block: Number(execution.event.blockNumber),
        executionPrice: execution.executionPrice,
        midPrice: execution.midPrice,
        direction: execution.direction,
      })),
    [executions]
  );

  const pair = `${pool.tokenB.symbol}/${pool.tokenA.symbol}`;

  return (
    <Card title={`Price history · ${pair}`}>
      {data.length === 0 ? (
        <EmptyState>Swap history will appear here once the pool has trades.</EmptyState>
      ) : (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 24, left: 0 }}>
              <CartesianGrid stroke="#22304f" strokeDasharray="3 3" />
              <XAxis
                dataKey="block"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(value: number) => value.toLocaleString("en-US")}
                label={{
                  value: "block number",
                  position: "insideBottom",
                  offset: -12,
                  fill: "#8b9cc4",
                  fontSize: 11,
                }}
              />
              <YAxis
                domain={["auto", "auto"]}
                tickFormatter={(value: number) => formatNumber(value, 4)}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const datum = payload[0].payload as (typeof data)[number];
                  return (
                    <div className="card mono px-3 py-2 text-[11px]">
                      <p>block {datum.block.toLocaleString("en-US")}</p>
                      <p>
                        executed {formatNumber(datum.executionPrice, 6)} {pair}
                      </p>
                      <p className="text-muted">
                        mid after {formatNumber(datum.midPrice, 6)} {pair}
                      </p>
                      <p className="text-muted">
                        {datum.direction === "A->B"
                          ? `sold ${pool.tokenA.symbol}`
                          : `bought ${pool.tokenA.symbol}`}
                      </p>
                    </div>
                  );
                }}
              />
              <Line
                dataKey="midPrice"
                type="stepAfter"
                stroke="#6d7cff"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Scatter dataKey="executionPrice" fill="#2dd4bf" isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
