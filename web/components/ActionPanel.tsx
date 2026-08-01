"use client";

import { useState } from "react";
import type { Address } from "viem";

import type { Pool } from "@/lib/hooks/usePools";
import { DepositForm } from "./DepositForm";
import { RedeemForm } from "./RedeemForm";
import { SwapForm } from "./SwapForm";
import { Card, TabBar } from "./ui";

const TABS = ["swap", "deposit", "redeem"] as const;
type Tab = (typeof TABS)[number];

export function ActionPanel({
  pool,
  account,
  position,
}: {
  pool: Pool;
  account?: Address;
  position: {
    balanceA: bigint;
    balanceB: bigint;
    allowanceA: bigint;
    allowanceB: bigint;
  };
}) {
  const [tab, setTab] = useState<Tab>("swap");

  return (
    <Card title={`Actions · ${pool.label}`}>
      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      <div className="mt-4">
        {tab === "swap" && (
          <SwapForm pool={pool} account={account} position={position} />
        )}
        {tab === "deposit" && (
          <DepositForm pool={pool} account={account} position={position} />
        )}
        {tab === "redeem" && <RedeemForm pool={pool} account={account} />}
      </div>
    </Card>
  );
}
