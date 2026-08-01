import type { Address } from "viem";
import { hardhat, sepolia } from "viem/chains";

import deploymentsJson from "./deployments.json";

export type DeployedToken = {
  name: string;
  symbol: string;
  address: Address;
};

export type DeployedPool = {
  address: Address;
  tokenA: Address;
  tokenB: Address;
  label: string;
};

export type Deployment = {
  chainId: number;
  network: string;
  factory: Address;
  deployBlock: number;
  deployer: Address;
  deployedAt: string;
  tokens: DeployedToken[];
  pools: DeployedPool[];
};

const records = deploymentsJson as unknown as Record<string, Deployment>;

export const SUPPORTED_CHAINS = [sepolia, hardhat] as const;

export type SupportedChainId = (typeof SUPPORTED_CHAINS)[number]["id"];

/** Chain the UI reads from. Overridable so the same build can target a local node. */
export const targetChainId = Number(
  process.env.NEXT_PUBLIC_CHAIN_ID ?? sepolia.id
) as SupportedChainId;

/**
 * Resolves the factory for a chain. Environment variables win over the committed
 * `deployments.json`, which lets a Vercel deployment point at a fresh deploy without a rebuild
 * of the contracts package.
 */
export function getDeployment(chainId: number): Deployment | undefined {
  const record = records[String(chainId)];

  const envFactory = process.env.NEXT_PUBLIC_FACTORY_ADDRESS as
    | Address
    | undefined;
  const envDeployBlock = process.env.NEXT_PUBLIC_DEPLOY_BLOCK;

  if (chainId === targetChainId && envFactory) {
    return {
      chainId,
      network: chainName(chainId),
      factory: envFactory,
      deployBlock: Number(envDeployBlock ?? record?.deployBlock ?? 0),
      deployer: record?.deployer ?? "0x0000000000000000000000000000000000000000",
      deployedAt: record?.deployedAt ?? "",
      tokens: record?.tokens ?? [],
      pools: record?.pools ?? [],
    };
  }

  return record;
}

export function chainName(chainId: number): string {
  return SUPPORTED_CHAINS.find((chain) => chain.id === chainId)?.name ?? `chain ${chainId}`;
}

export function explorerAddressUrl(chainId: number, address: string): string | undefined {
  const base = SUPPORTED_CHAINS.find((chain) => chain.id === chainId)?.blockExplorers
    ?.default.url;
  return base ? `${base}/address/${address}` : undefined;
}

export function explorerTxUrl(chainId: number, hash: string): string | undefined {
  const base = SUPPORTED_CHAINS.find((chain) => chain.id === chainId)?.blockExplorers
    ?.default.url;
  return base ? `${base}/tx/${hash}` : undefined;
}
