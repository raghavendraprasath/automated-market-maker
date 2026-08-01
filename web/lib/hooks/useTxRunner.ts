"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Abi, Address, Hex } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";

import { targetChainId, type SupportedChainId } from "../deployments";

/**
 * Minimal request shape the forms build.
 *
 * wagmi's own variables type is generic over the ABI and chain, which does not survive being
 * stored in a plain array of steps, so the request is asserted back at the call site.
 */
export type TxRequest = {
  address: Address;
  abi: Abi | readonly unknown[];
  functionName: string;
  args: readonly unknown[];
  chainId?: SupportedChainId;
};

export type TxStep = {
  label: string;
  request: TxRequest;
};

export type TxState = {
  status: "idle" | "pending" | "success" | "error";
  label?: string;
  hash?: Hex;
  error?: string;
};

/**
 * Runs a sequence of writes (for example `approve` then `swap`), waiting for each receipt before
 * sending the next one, and refreshes every on-chain query once the sequence lands.
 */
export function useTxRunner() {
  const [state, setState] = useState<TxState>({ status: "idle" });
  const { mutateAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: targetChainId });
  const queryClient = useQueryClient();

  const reset = useCallback(() => setState({ status: "idle" }), []);

  const run = useCallback(
    async (steps: TxStep[]) => {
      let hash: Hex | undefined;

      try {
        for (const step of steps) {
          setState({ status: "pending", label: step.label });

          hash = await mutateAsync(step.request as never);
          setState({ status: "pending", label: step.label, hash });

          await publicClient?.waitForTransactionReceipt({ hash });
        }

        setState({ status: "success", label: steps.at(-1)?.label, hash });
        await queryClient.invalidateQueries();
        return true;
      } catch (error) {
        setState({
          status: "error",
          hash,
          error: describeError(error),
        });
        return false;
      }
    },
    [mutateAsync, publicClient, queryClient]
  );

  return { state, run, reset };
}

/** Wallet and node errors are verbose; surface the first meaningful line. */
function describeError(error: unknown): string {
  if (typeof error === "string") return error;

  if (error instanceof Error) {
    const shortMessage = (error as { shortMessage?: string }).shortMessage;
    if (shortMessage) return shortMessage;
    return error.message.split("\n")[0];
  }

  return "Transaction failed";
}
