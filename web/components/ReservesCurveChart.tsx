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

import { formatCompact, formatNumber, toNumber } from "@/lib/format";
import type { Pool } from "@/lib/hooks/usePools";
import type { SyncEvent } from "@/lib/logs";
import { Card, EmptyState } from "./ui";

const CURVE_RESOLUTION = 140;
/** How much of the curve to show on either side of the current point. */
const X_LOWER = 0.45;
const X_UPPER = 2.2;

type CurvePoint = { x: number; y: number };

/**
 * The `x * y = k` curve with the pool's current position P marked.
 *
 * Everything here comes from the reserves: the live pair drives the solid curve and P, while the
 * `Sync` events from `eth_getLogs` provide the historical positions and the previous curve, so a
 * swap visibly slides P along one curve and a deposit/redeem visibly shifts the whole curve.
 */
export function ReservesCurveChart({
  pool,
  syncs,
}: {
  pool: Pool;
  syncs: SyncEvent[];
}) {
  const reserveA = toNumber(pool.reserveA, pool.tokenA.decimals);
  const reserveB = toNumber(pool.reserveB, pool.tokenB.decimals);

  const model = useMemo(() => {
    if (reserveA <= 0 || reserveB <= 0) return undefined;

    const k = reserveA * reserveB;
    const xMin = reserveA * X_LOWER;
    const xMax = reserveA * X_UPPER;

    const history = syncs
      .map((event) => ({
        x: toNumber(event.reserveA, pool.tokenA.decimals),
        y: toNumber(event.reserveB, pool.tokenB.decimals),
        blockNumber: event.blockNumber,
      }))
      .filter((point) => point.x > 0 && point.y > 0);

    // k only moves on deposit / redeem, so the newest different k is the pool's previous curve.
    const previousK = history
      .map((point) => point.x * point.y)
      .reverse()
      .find((value) => Math.abs(value - k) / k > 0.001);

    const curve = (invariant: number): CurvePoint[] =>
      Array.from({ length: CURVE_RESOLUTION }, (_, index) => {
        const x = xMin + ((xMax - xMin) * index) / (CURVE_RESOLUTION - 1);
        return { x, y: invariant / x };
      });

    const onCurrentCurve = (point: { x: number; y: number }) =>
      Math.abs(point.x * point.y - k) / k <= 0.001;

    return {
      k,
      previousK,
      xDomain: [xMin, xMax] as [number, number],
      yDomain: [0, (k / xMin) * 1.05] as [number, number],
      currentCurve: curve(k),
      previousCurve: previousK ? curve(previousK) : undefined,
      pastPoints: history.filter(onCurrentCurve).slice(-40),
      shiftedPoints: history.filter((point) => !onCurrentCurve(point)).slice(-20),
      point: [{ x: reserveA, y: reserveB }],
    };
  }, [pool.tokenA.decimals, pool.tokenB.decimals, reserveA, reserveB, syncs]);

  return (
    <Card
      title="Reserves curve · x · y = k"
      action={
        model && (
          <span className="mono text-[11px] text-muted">
            k = {formatCompact(model.k)}
            {model.previousK && (
              <span className="text-amber">
                {" "}
                · previous {formatCompact(model.previousK)}
              </span>
            )}
          </span>
        )
      }
    >
      {!model ? (
        <EmptyState>
          This pool is empty. Deposit both tokens to create the curve.
        </EmptyState>
      ) : (
        <>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
                <CartesianGrid stroke="#22304f" strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="x"
                  domain={model.xDomain}
                  allowDataOverflow
                  tickFormatter={(value: number) => formatCompact(value)}
                  label={{
                    value: `${pool.tokenA.symbol} reserve (x)`,
                    position: "insideBottom",
                    offset: -12,
                    fill: "#8b9cc4",
                    fontSize: 11,
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  domain={model.yDomain}
                  allowDataOverflow
                  tickFormatter={(value: number) => formatCompact(value)}
                  label={{
                    value: `${pool.tokenB.symbol} reserve (y)`,
                    angle: -90,
                    position: "insideLeft",
                    fill: "#8b9cc4",
                    fontSize: 11,
                  }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const datum = payload[0].payload as CurvePoint;
                    return (
                      <div className="card mono px-3 py-2 text-[11px]">
                        <p>
                          x = {formatNumber(datum.x, 4)} {pool.tokenA.symbol}
                        </p>
                        <p>
                          y = {formatNumber(datum.y, 4)} {pool.tokenB.symbol}
                        </p>
                        <p className="text-muted">
                          price = {formatNumber(datum.y / datum.x, 6)}{" "}
                          {pool.tokenB.symbol}/{pool.tokenA.symbol}
                        </p>
                      </div>
                    );
                  }}
                />

                {model.previousCurve && (
                  <Line
                    data={model.previousCurve}
                    dataKey="y"
                    type="monotone"
                    stroke="#fbbf24"
                    strokeWidth={1.4}
                    strokeDasharray="5 5"
                    dot={false}
                    isAnimationActive={false}
                    name="previous curve"
                  />
                )}

                <Line
                  data={model.currentCurve}
                  dataKey="y"
                  type="monotone"
                  stroke="#6d7cff"
                  strokeWidth={2.2}
                  dot={false}
                  isAnimationActive={false}
                  name="current curve"
                />

                {model.shiftedPoints.length > 0 && (
                  <Scatter
                    data={model.shiftedPoints}
                    dataKey="y"
                    shape={<HistoryMarker color="#fbbf24" />}
                    legendType="none"
                    isAnimationActive={false}
                  />
                )}

                <Scatter
                  data={model.pastPoints}
                  dataKey="y"
                  shape={<HistoryMarker color="#a5b0ff" />}
                  legendType="none"
                  isAnimationActive={false}
                />

                <Scatter
                  data={model.point}
                  dataKey="y"
                  shape={<CurrentMarker />}
                  legendType="none"
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
            <Legend color="#2dd4bf">P — current reserves</Legend>
            <Legend color="#6d7cff">current curve</Legend>
            <Legend color="#a5b0ff">past positions on this curve (swaps)</Legend>
            {model.previousCurve && (
              <Legend color="#fbbf24">previous curve (deposit / redeem)</Legend>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

type MarkerProps = { cx?: number; cy?: number };

/** Past reserve positions read from `Sync` events. */
function HistoryMarker({ color, cx, cy }: MarkerProps & { color: string }) {
  if (cx === undefined || cy === undefined) return null;
  return <circle cx={cx} cy={cy} r={3.2} fill={color} fillOpacity={0.75} />;
}

/** The pool's live position P, deliberately louder than the history dots. */
function CurrentMarker({ cx, cy }: MarkerProps) {
  if (cx === undefined || cy === undefined) return null;

  return (
    <g>
      <circle cx={cx} cy={cy} r={11} fill="#2dd4bf" fillOpacity={0.16} />
      <circle
        cx={cx}
        cy={cy}
        r={5}
        fill="#2dd4bf"
        stroke="#070b16"
        strokeWidth={1.5}
      />
      <text
        x={cx + 12}
        y={cy - 8}
        fill="#2dd4bf"
        fontSize={12}
        fontWeight={700}
      >
        P
      </text>
    </g>
  );
}

function Legend({ color, children }: { color: string; children: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block size-2 rounded-full"
        style={{ background: color }}
      />
      {children}
    </span>
  );
}
