"use client";

import { parseUnits, type Address } from "viem";

import { mockErc20Abi } from "@/lib/abis";
import { FAUCET_AMOUNT } from "@/lib/constants";
import { targetChainId } from "@/lib/deployments";
import { formatAmount } from "@/lib/format";
import type { Pool } from "@/lib/hooks/usePools";
import { useTxRunner } from "@/lib/hooks/useTxRunner";
import { Card, TxFeedback } from "./ui";

/** The deployed test tokens expose a public `mint`, so the UI can hand out balances to graders. */
export function FaucetCard({
  pool,
  account,
  balances,
}: {
  pool: Pool;
  account?: Address;
  balances: { balanceA: bigint; balanceB: bigint };
}) {
  const { state, run } = useTxRunner();

  async function mint(token: Pool["tokenA"]) {
    if (!account) return;

    await run([
      {
        label: `Mint ${FAUCET_AMOUNT} ${token.symbol}`,
        request: {
          address: token.address,
          abi: mockErc20Abi,
          functionName: "mint",
          args: [account, parseUnits(String(FAUCET_AMOUNT), token.decimals)],
          chainId: targetChainId,
        },
      },
    ]);
  }

  return (
    <Card title="Test token faucet">
      <p className="text-xs text-muted">
        Mint {FAUCET_AMOUNT} of either pool token to the connected wallet.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {[
          { token: pool.tokenA, balance: balances.balanceA },
          { token: pool.tokenB, balance: balances.balanceB },
        ].map(({ token, balance }) => (
          <button
            key={token.address}
            type="button"
            className="btn btn-ghost flex-col items-start gap-0.5 py-2"
            disabled={!account || state.status === "pending"}
            onClick={() => mint(token)}
          >
            <span>Mint {token.symbol}</span>
            <span className="mono text-[10px] font-normal text-muted">
              balance {formatAmount(balance, token.decimals, 2)}
            </span>
          </button>
        ))}
      </div>

      <TxFeedback state={state} chainId={targetChainId} />
    </Card>
  );
}
