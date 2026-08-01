/**
 * Historical pool activity, read with raw `eth_getLogs` JSON-RPC calls.
 *
 * Homework 5 asks for the distribution of execution prices of *past* swaps, which is history that
 * lives only in event logs. Rather than hide that behind a helper, this module issues the RPC call
 * itself (`client.request({ method: "eth_getLogs", ... })`) and decodes the returned hex payload
 * with `decodeEventLog`, so the UI can also show the exact request/response it used.
 *
 * A single filter fetches all four pool events by passing an OR-list of topic hashes in `topics[0]`.
 */
import {
  decodeEventLog,
  encodeEventTopics,
  hexToBigInt,
  numberToHex,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

import { simpleAmmAbi } from "./abis";

export type PoolEventName =
  | "Swap"
  | "Sync"
  | "LiquidityDeposited"
  | "LiquidityRedeemed";

const TRACKED_EVENTS: PoolEventName[] = [
  "Swap",
  "Sync",
  "LiquidityDeposited",
  "LiquidityRedeemed",
];

/** topic0 (keccak of the event signature) for every event we care about. */
export const EVENT_TOPICS: Record<PoolEventName, Hex> = Object.fromEntries(
  TRACKED_EVENTS.map((eventName) => [
    eventName,
    encodeEventTopics({ abi: simpleAmmAbi, eventName })[0] as Hex,
  ])
) as Record<PoolEventName, Hex>;

const TOPIC_TO_EVENT = new Map<Hex, PoolEventName>(
  TRACKED_EVENTS.map((eventName) => [EVENT_TOPICS[eventName], eventName])
);

/** Shape of a log object as it comes back over JSON-RPC, before decoding. */
export type RawLog = {
  address: Address;
  topics: Hex[];
  data: Hex;
  blockNumber: Hex;
  transactionHash: Hex;
  logIndex: Hex;
  removed?: boolean;
};

export type GetLogsRequest = {
  address: Address;
  topics: (Hex | Hex[])[];
  fromBlock: Hex;
  toBlock: Hex;
};

export type SwapEvent = {
  kind: "Swap";
  blockNumber: bigint;
  transactionHash: Hex;
  logIndex: number;
  sender: Address;
  to: Address;
  amountAIn: bigint;
  amountBIn: bigint;
  amountAOut: bigint;
  amountBOut: bigint;
  reserveA: bigint;
  reserveB: bigint;
};

export type SyncEvent = {
  kind: "Sync";
  blockNumber: bigint;
  transactionHash: Hex;
  logIndex: number;
  reserveA: bigint;
  reserveB: bigint;
};

export type LiquidityEvent = {
  kind: "LiquidityDeposited" | "LiquidityRedeemed";
  blockNumber: bigint;
  transactionHash: Hex;
  logIndex: number;
  provider: Address;
  amountA: bigint;
  amountB: bigint;
  liquidity: bigint;
  reserveA: bigint;
  reserveB: bigint;
};

export type PoolEvent = SwapEvent | SyncEvent | LiquidityEvent;

export type PoolHistory = {
  swaps: SwapEvent[];
  syncs: SyncEvent[];
  liquidity: LiquidityEvent[];
  /** The last request that was sent, kept so the UI can display the raw RPC payload. */
  lastRequest: GetLogsRequest;
  /** One untouched log from the response, shown next to its decoded form. */
  sampleRawLog?: RawLog;
  fromBlock: bigint;
  toBlock: bigint;
  requestCount: number;
  truncated: boolean;
};

/**
 * Providers disagree on how wide an `eth_getLogs` window may be: Alchemy-class endpoints and a local
 * Hardhat node happily serve ~10k blocks, while some keyless public endpoints cap the range at 1k.
 * We start wide (one request covers everything in the common case) and narrow it on rejection.
 */
const INITIAL_BLOCK_CHUNK = 9_500n;
const MIN_BLOCK_CHUNK = 500n;
/** Safety valve so a long-lived deployment cannot trigger hundreds of requests. */
const MAX_REQUESTS = 30;

export async function fetchPoolHistory(
  client: PublicClient,
  pool: Address,
  deployBlock: bigint
): Promise<PoolHistory> {
  const latestBlock = await client.getBlockNumber();

  const swaps: SwapEvent[] = [];
  const syncs: SyncEvent[] = [];
  const liquidity: LiquidityEvent[] = [];

  let sampleRawLog: RawLog | undefined;
  let toBlock = latestBlock;
  let requestCount = 0;
  let earliestScanned = latestBlock;
  let blockChunk = INITIAL_BLOCK_CHUNK;
  let lastRequest: GetLogsRequest = buildRequest(pool, deployBlock, latestBlock);

  while (toBlock >= deployBlock && requestCount < MAX_REQUESTS) {
    const chunkStart =
      toBlock > deployBlock + blockChunk ? toBlock - blockChunk : deployBlock;

    const request = buildRequest(pool, chunkStart, toBlock);
    requestCount += 1;

    let rawLogs: RawLog[];
    try {
      rawLogs = (await client.request({
        method: "eth_getLogs",
        params: [request],
      } as never)) as unknown as RawLog[];
    } catch (error) {
      if (isRangeRejection(error) && blockChunk > MIN_BLOCK_CHUNK) {
        blockChunk = bigintMax(blockChunk / 4n, MIN_BLOCK_CHUNK);
        continue;
      }
      throw explainLogsFailure(error);
    }

    lastRequest = request;

    for (const rawLog of rawLogs) {
      const event = decodePoolLog(rawLog);
      if (!event) continue;

      sampleRawLog ??= rawLog;

      if (event.kind === "Swap") swaps.push(event);
      else if (event.kind === "Sync") syncs.push(event);
      else liquidity.push(event);
    }

    earliestScanned = chunkStart;
    if (chunkStart === deployBlock) break;
    toBlock = chunkStart - 1n;
  }

  const byBlock = (a: PoolEvent, b: PoolEvent) =>
    a.blockNumber === b.blockNumber
      ? a.logIndex - b.logIndex
      : Number(a.blockNumber - b.blockNumber);

  swaps.sort(byBlock);
  syncs.sort(byBlock);
  liquidity.sort(byBlock);

  return {
    swaps,
    syncs,
    liquidity,
    lastRequest,
    sampleRawLog,
    fromBlock: earliestScanned,
    toBlock: latestBlock,
    requestCount,
    truncated: earliestScanned > deployBlock,
  };
}

function bigintMax(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

function rpcErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const viemError = error as {
      details?: string;
      shortMessage?: string;
      message?: string;
    };
    return (
      viemError.details ?? viemError.shortMessage ?? viemError.message ?? String(error)
    );
  }
  return String(error);
}

/** True when the provider refused the window size rather than the query itself. */
function isRangeRejection(error: unknown): boolean {
  if (
    /exceed|too large|too many|too wide|block range|limit/i.test(
      rpcErrorMessage(error)
    )
  ) {
    return true;
  }

  // Some endpoints reject an over-wide window at the HTTP layer with no usable message body,
  // so the status code is the only signal that a narrower window is worth trying.
  const status = httpStatus(error);
  return status === 400 || status === 413;
}

function httpStatus(error: unknown): number | undefined {
  let current = error;

  for (let depth = 0; current && depth < 5; depth += 1) {
    const { status, cause } = current as { status?: number; cause?: unknown };
    if (typeof status === "number") return status;
    current = cause;
  }

  return undefined;
}

function explainLogsFailure(error: unknown): Error {
  const message = rpcErrorMessage(error).trim();

  // Some keyless endpoints only serve the chain head, which no window size can work around.
  if (/archive|personal token|dedicated|not supported|unsupported|method/i.test(message)) {
    return new Error(
      `This RPC endpoint refuses historical eth_getLogs queries ("${message}"). ` +
        "Set NEXT_PUBLIC_SEPOLIA_RPC_URL to an endpoint that serves past logs."
    );
  }

  return error instanceof Error ? error : new Error(message);
}

function buildRequest(
  pool: Address,
  fromBlock: bigint,
  toBlock: bigint
): GetLogsRequest {
  return {
    address: pool,
    // A nested array in topics[0] means "any of these event signatures".
    topics: [TRACKED_EVENTS.map((eventName) => EVENT_TOPICS[eventName])],
    fromBlock: numberToHex(fromBlock),
    toBlock: numberToHex(toBlock),
  };
}

function decodePoolLog(rawLog: RawLog): PoolEvent | undefined {
  const eventName = TOPIC_TO_EVENT.get(rawLog.topics[0]);
  if (!eventName) return undefined;

  const decoded = decodeEventLog({
    abi: simpleAmmAbi,
    data: rawLog.data,
    topics: rawLog.topics as [Hex, ...Hex[]],
  });

  const base = {
    blockNumber: hexToBigInt(rawLog.blockNumber),
    transactionHash: rawLog.transactionHash,
    logIndex: Number(hexToBigInt(rawLog.logIndex)),
  };

  if (decoded.eventName === "Swap") {
    const args = decoded.args as {
      sender: Address;
      to: Address;
      amountAIn: bigint;
      amountBIn: bigint;
      amountAOut: bigint;
      amountBOut: bigint;
      reserveA: bigint;
      reserveB: bigint;
    };
    return { kind: "Swap", ...base, ...args };
  }

  if (decoded.eventName === "Sync") {
    const args = decoded.args as { reserveA: bigint; reserveB: bigint };
    return { kind: "Sync", ...base, ...args };
  }

  if (
    decoded.eventName === "LiquidityDeposited" ||
    decoded.eventName === "LiquidityRedeemed"
  ) {
    const args = decoded.args as {
      provider: Address;
      amountA: bigint;
      amountB: bigint;
      liquidityMinted?: bigint;
      liquidityBurned?: bigint;
      reserveA: bigint;
      reserveB: bigint;
    };

    return {
      kind: decoded.eventName,
      ...base,
      provider: args.provider,
      amountA: args.amountA,
      amountB: args.amountB,
      liquidity: args.liquidityMinted ?? args.liquidityBurned ?? 0n,
      reserveA: args.reserveA,
      reserveB: args.reserveB,
    };
  }

  return undefined;
}

export type SwapExecution = {
  event: SwapEvent;
  /** "A->B" sells token A into the pool; "B->A" is the opposite. */
  direction: "A->B" | "B->A";
  amountIn: number;
  amountOut: number;
  /** Realized price of the trade, always quoted as units of token B per token A. */
  executionPrice: number;
  /** Pool mid price after the trade, from the reserves carried in the event. */
  midPrice: number;
};

/**
 * Turns raw `Swap` events into execution prices.
 *
 * Prices are normalized to "token B per token A" regardless of trade direction, so both sides of
 * the book land in one distribution.
 */
export function toSwapExecutions(
  swaps: SwapEvent[],
  decimalsA: number,
  decimalsB: number
): SwapExecution[] {
  const scaleA = 10 ** decimalsA;
  const scaleB = 10 ** decimalsB;

  return swaps
    .map((event) => {
      const aIn = Number(event.amountAIn) / scaleA;
      const bIn = Number(event.amountBIn) / scaleB;
      const aOut = Number(event.amountAOut) / scaleA;
      const bOut = Number(event.amountBOut) / scaleB;

      const reserveA = Number(event.reserveA) / scaleA;
      const reserveB = Number(event.reserveB) / scaleB;
      const midPrice = reserveA > 0 ? reserveB / reserveA : 0;

      if (aIn > 0) {
        return {
          event,
          direction: "A->B" as const,
          amountIn: aIn,
          amountOut: bOut,
          executionPrice: bOut / aIn,
          midPrice,
        };
      }

      return {
        event,
        direction: "B->A" as const,
        amountIn: bIn,
        amountOut: aOut,
        executionPrice: aOut > 0 ? bIn / aOut : 0,
        midPrice,
      };
    })
    .filter((execution) => Number.isFinite(execution.executionPrice) && execution.executionPrice > 0);
}

export type PriceBin = {
  label: string;
  binStart: number;
  binEnd: number;
  center: number;
  count: number;
};

/** Buckets execution prices into a histogram for the distribution chart. */
export function buildPriceHistogram(
  prices: number[],
  binCount = 10
): PriceBin[] {
  if (prices.length === 0) return [];

  const min = Math.min(...prices);
  const max = Math.max(...prices);

  // A single distinct price still deserves one visible bar.
  if (max === min) {
    return [
      {
        label: formatBinLabel(min, max),
        binStart: min,
        binEnd: max,
        center: min,
        count: prices.length,
      },
    ];
  }

  const width = (max - min) / binCount;
  const bins: PriceBin[] = Array.from({ length: binCount }, (_, index) => {
    const binStart = min + index * width;
    const binEnd = binStart + width;
    return {
      label: formatBinLabel(binStart, binEnd),
      binStart,
      binEnd,
      center: (binStart + binEnd) / 2,
      count: 0,
    };
  });

  for (const price of prices) {
    const index = Math.min(binCount - 1, Math.floor((price - min) / width));
    bins[index].count += 1;
  }

  return bins;
}

function formatBinLabel(start: number, end: number): string {
  const digits = Math.abs(end) < 1 ? 6 : Math.abs(end) < 100 ? 3 : 1;
  return `${start.toFixed(digits)} – ${end.toFixed(digits)}`;
}
