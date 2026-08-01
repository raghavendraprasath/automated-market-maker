import { formatUnits, parseUnits } from "viem";

/** Token amount as a human number, used for chart math. */
export function toNumber(amount: bigint, decimals: number): number {
  return Number(formatUnits(amount, decimals));
}

export function formatAmount(
  amount: bigint,
  decimals: number,
  maxFractionDigits = 4
): string {
  return formatNumber(toNumber(amount, decimals), maxFractionDigits);
}

export function formatNumber(value: number, maxFractionDigits = 4): string {
  if (!Number.isFinite(value)) return "-";
  if (value !== 0 && Math.abs(value) < 0.0001) return value.toExponential(2);

  return value.toLocaleString("en-US", {
    maximumFractionDigits: maxFractionDigits,
    minimumFractionDigits: 0,
  });
}

export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return value.toLocaleString("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  });
}

export function formatPercent(fraction: number, maxFractionDigits = 2): string {
  if (!Number.isFinite(fraction)) return "-";
  return `${(fraction * 100).toFixed(maxFractionDigits)}%`;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/** Parses user input, tolerating empty strings and stray whitespace. */
export function parseAmount(value: string, decimals: number): bigint | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  try {
    const parsed = parseUnits(trimmed, decimals);
    return parsed > 0n ? parsed : undefined;
  } catch {
    return undefined;
  }
}
