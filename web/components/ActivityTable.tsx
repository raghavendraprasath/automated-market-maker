"use client";

import { explorerTxUrl, targetChainId } from "@/lib/deployments";
import { formatAmount, formatNumber, shortAddress } from "@/lib/format";
import type { Pool } from "@/lib/hooks/usePools";
import type { LiquidityEvent, SwapExecution } from "@/lib/logs";
import { Card, EmptyState } from "./ui";

const MAX_ROWS = 12;

type Row = {
  key: string;
  block: bigint;
  hash: string;
  kind: string;
  detail: string;
  price: string;
  tone: string;
};

/** Recent pool activity, decoded from the same `eth_getLogs` response as the charts. */
export function ActivityTable({
  pool,
  executions,
  liquidity,
}: {
  pool: Pool;
  executions: SwapExecution[];
  liquidity: LiquidityEvent[];
}) {
  const swapRows: Row[] = executions.map((execution) => {
    const sellingA = execution.direction === "A->B";
    const tokenIn = sellingA ? pool.tokenA : pool.tokenB;
    const tokenOut = sellingA ? pool.tokenB : pool.tokenA;

    return {
      key: `${execution.event.transactionHash}-${execution.event.logIndex}`,
      block: execution.event.blockNumber,
      hash: execution.event.transactionHash,
      kind: "Swap",
      detail: `${formatNumber(execution.amountIn, 4)} ${tokenIn.symbol} → ${formatNumber(
        execution.amountOut,
        4
      )} ${tokenOut.symbol}`,
      price: `${formatNumber(execution.executionPrice, 6)} ${pool.tokenB.symbol}/${pool.tokenA.symbol}`,
      tone: sellingA ? "text-danger" : "text-teal",
    };
  });

  const liquidityRows: Row[] = liquidity.map((event) => ({
    key: `${event.transactionHash}-${event.logIndex}`,
    block: event.blockNumber,
    hash: event.transactionHash,
    kind: event.kind === "LiquidityDeposited" ? "Deposit" : "Redeem",
    detail: `${formatAmount(event.amountA, pool.tokenA.decimals, 4)} ${pool.tokenA.symbol} + ${formatAmount(
      event.amountB,
      pool.tokenB.decimals,
      4
    )} ${pool.tokenB.symbol}`,
    price: `${formatAmount(event.liquidity, 18, 4)} LP · ${shortAddress(event.provider)}`,
    tone: "text-accent-soft",
  }));

  const rows = [...swapRows, ...liquidityRows]
    .sort((a, b) => Number(b.block - a.block))
    .slice(0, MAX_ROWS);

  return (
    <Card title="Recent activity">
      {rows.length === 0 ? (
        <EmptyState>No pool events yet.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="pb-2 pr-3 font-medium">Block</th>
                <th className="pb-2 pr-3 font-medium">Event</th>
                <th className="pb-2 pr-3 font-medium">Amounts</th>
                <th className="pb-2 pr-3 font-medium">Price / LP</th>
                <th className="pb-2 font-medium">Tx</th>
              </tr>
            </thead>
            <tbody className="mono">
              {rows.map((row) => {
                const url = explorerTxUrl(targetChainId, row.hash);
                return (
                  <tr key={row.key} className="border-t border-line/60">
                    <td className="py-2 pr-3 text-muted">
                      {row.block.toLocaleString("en-US")}
                    </td>
                    <td className={`py-2 pr-3 font-semibold ${row.tone}`}>
                      {row.kind}
                    </td>
                    <td className="py-2 pr-3">{row.detail}</td>
                    <td className="py-2 pr-3 text-muted">{row.price}</td>
                    <td className="py-2 text-muted">
                      {url ? (
                        <a
                          className="hover:text-accent-soft"
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {shortAddress(row.hash)}
                        </a>
                      ) : (
                        shortAddress(row.hash)
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
