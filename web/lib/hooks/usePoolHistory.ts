"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address, PublicClient } from "viem";
import { usePublicClient } from "wagmi";

import { getDeployment, targetChainId } from "../deployments";
import { fetchPoolHistory, type PoolHistory } from "../logs";

const HISTORY_REFRESH_MS = 20_000;

/**
 * Loads a pool's event history through raw `eth_getLogs` calls.
 *
 * Kept out of wagmi's read hooks on purpose: this is a log query, not a contract call, and the
 * result carries the raw request/response that the UI displays.
 */
export function usePoolHistory(pool: Address | undefined) {
  const client = usePublicClient({ chainId: targetChainId });
  const deployment = getDeployment(targetChainId);
  const deployBlock = BigInt(deployment?.deployBlock ?? 0);

  const query = useQuery<PoolHistory>({
    queryKey: ["pool-history", targetChainId, pool, deployBlock.toString()],
    enabled: Boolean(client && pool),
    staleTime: HISTORY_REFRESH_MS,
    // Polled as well as invalidated after a local transaction, so the charts also pick up pool
    // actions made by other accounts.
    refetchInterval: HISTORY_REFRESH_MS,
    queryFn: () =>
      fetchPoolHistory(client as PublicClient, pool as Address, deployBlock),
  });

  return query;
}
