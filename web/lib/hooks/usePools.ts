"use client";

import { useMemo } from "react";
import { erc20Abi, zeroAddress, type Address } from "viem";
import { useReadContract, useReadContracts } from "wagmi";

import { simpleAmmAbi, simpleAmmFactoryAbi } from "../abis";
import { getDeployment, targetChainId } from "../deployments";

export type TokenInfo = {
  address: Address;
  name: string;
  symbol: string;
  decimals: number;
};

export type Pool = {
  address: Address;
  label: string;
  tokenA: TokenInfo;
  tokenB: TokenInfo;
  reserveA: bigint;
  reserveB: bigint;
  totalLiquidity: bigint;
  userLiquidity: bigint;
};

type PoolStateResult = readonly [Address, Address, bigint, bigint, bigint, bigint];

const POOL_REFRESH_MS = 12_000;

/**
 * Discovers every pool from the factory, then reads each pool's tokens, reserves and the
 * connected account's LP balance. Nothing about the pool set is hardcoded in the frontend.
 */
export function usePools(account?: Address) {
  const deployment = getDeployment(targetChainId);
  const factory = deployment?.factory;

  const pairsQuery = useReadContract({
    address: factory,
    abi: simpleAmmFactoryAbi,
    functionName: "getAllPairs",
    chainId: targetChainId,
    query: { enabled: Boolean(factory) },
  });

  const pairAddresses = useMemo(
    () => (pairsQuery.data ?? []) as readonly Address[],
    [pairsQuery.data]
  );

  const stateQuery = useReadContracts({
    allowFailure: false,
    contracts: pairAddresses.map((pool) => ({
      address: pool,
      abi: simpleAmmAbi,
      functionName: "poolState" as const,
      args: [account ?? zeroAddress] as const,
      chainId: targetChainId,
    })),
    query: {
      enabled: pairAddresses.length > 0,
      refetchInterval: POOL_REFRESH_MS,
    },
  });

  const poolStates = useMemo(
    () => (stateQuery.data ?? []) as unknown as PoolStateResult[],
    [stateQuery.data]
  );

  const tokenAddresses = useMemo(() => {
    const unique = new Set<Address>();
    for (const state of poolStates) {
      unique.add(state[0]);
      unique.add(state[1]);
    }
    return [...unique];
  }, [poolStates]);

  const metadataQuery = useReadContracts({
    allowFailure: false,
    contracts: tokenAddresses.flatMap((token) => [
      {
        address: token,
        abi: erc20Abi,
        functionName: "name" as const,
        chainId: targetChainId,
      },
      {
        address: token,
        abi: erc20Abi,
        functionName: "symbol" as const,
        chainId: targetChainId,
      },
      {
        address: token,
        abi: erc20Abi,
        functionName: "decimals" as const,
        chainId: targetChainId,
      },
    ]),
    query: { enabled: tokenAddresses.length > 0 },
  });

  const tokens = useMemo(() => {
    const results = (metadataQuery.data ?? []) as unknown as unknown[];
    const map = new Map<Address, TokenInfo>();

    tokenAddresses.forEach((address, index) => {
      const name = results[index * 3] as string | undefined;
      const symbol = results[index * 3 + 1] as string | undefined;
      const decimals = results[index * 3 + 2] as number | undefined;

      if (name === undefined || symbol === undefined || decimals === undefined) {
        return;
      }
      map.set(address, { address, name, symbol, decimals });
    });

    return map;
  }, [metadataQuery.data, tokenAddresses]);

  const pools = useMemo<Pool[]>(() => {
    return pairAddresses.flatMap((address, index) => {
      const state = poolStates[index];
      if (!state) return [];

      const tokenA = tokens.get(state[0]);
      const tokenB = tokens.get(state[1]);
      if (!tokenA || !tokenB) return [];

      return [
        {
          address,
          label: `${tokenA.symbol} / ${tokenB.symbol}`,
          tokenA,
          tokenB,
          reserveA: state[2],
          reserveB: state[3],
          totalLiquidity: state[4],
          userLiquidity: state[5],
        },
      ];
    });
  }, [pairAddresses, poolStates, tokens]);

  return {
    deployment,
    pools,
    pairCount: pairAddresses.length,
    isLoading:
      pairsQuery.isLoading || stateQuery.isLoading || metadataQuery.isLoading,
    error: pairsQuery.error ?? stateQuery.error ?? metadataQuery.error ?? undefined,
  };
}

/** Wallet balances and pool allowances for one pool's two tokens. */
export function useTokenPosition(pool: Pool | undefined, account?: Address) {
  const enabled = Boolean(pool && account);

  const query = useReadContracts({
    allowFailure: false,
    contracts:
      pool && account
        ? [
            {
              address: pool.tokenA.address,
              abi: erc20Abi,
              functionName: "balanceOf" as const,
              args: [account] as const,
              chainId: targetChainId,
            },
            {
              address: pool.tokenB.address,
              abi: erc20Abi,
              functionName: "balanceOf" as const,
              args: [account] as const,
              chainId: targetChainId,
            },
            {
              address: pool.tokenA.address,
              abi: erc20Abi,
              functionName: "allowance" as const,
              args: [account, pool.address] as const,
              chainId: targetChainId,
            },
            {
              address: pool.tokenB.address,
              abi: erc20Abi,
              functionName: "allowance" as const,
              args: [account, pool.address] as const,
              chainId: targetChainId,
            },
          ]
        : [],
    query: { enabled, refetchInterval: POOL_REFRESH_MS },
  });

  const values = (query.data ?? []) as unknown as bigint[];

  return {
    balanceA: values[0] ?? 0n,
    balanceB: values[1] ?? 0n,
    allowanceA: values[2] ?? 0n,
    allowanceB: values[3] ?? 0n,
    isLoading: query.isLoading,
  };
}
