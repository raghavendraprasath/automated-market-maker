"use client";

import { useState } from "react";

import { EVENT_TOPICS, type PoolHistory } from "@/lib/logs";
import { Card } from "./ui";

/**
 * Shows the actual `eth_getLogs` JSON-RPC call behind the charts, plus one raw log next to its
 * decoded form. This is the part of Homework 5 that is otherwise invisible in a UI.
 */
export function RawLogsPanel({ history }: { history?: PoolHistory }) {
  const [open, setOpen] = useState(false);

  if (!history) return null;

  const request = {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_getLogs",
    params: [history.lastRequest],
  };

  const sample = history.sampleRawLog;
  const decodedSample = sample
    ? {
        event: Object.entries(EVENT_TOPICS).find(
          ([, topic]) => topic === sample.topics[0]
        )?.[0],
        blockNumber: Number(BigInt(sample.blockNumber)),
        transactionHash: sample.transactionHash,
        indexedTopics: sample.topics.slice(1),
        dataWords: chunkData(sample.data),
      }
    : undefined;

  return (
    <Card
      title="Raw eth_getLogs"
      action={
        <button
          type="button"
          className="btn btn-ghost px-2.5 py-1 text-[11px]"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Hide" : "Show"} payload
        </button>
      }
    >
      <div className="grid gap-2 sm:grid-cols-3">
        <Metric
          label="Blocks scanned"
          value={`${history.fromBlock.toLocaleString("en-US")} → ${history.toBlock.toLocaleString("en-US")}`}
        />
        <Metric label="RPC requests" value={String(history.requestCount)} />
        <Metric
          label="Events decoded"
          value={String(
            history.swaps.length + history.syncs.length + history.liquidity.length
          )}
        />
      </div>

      {history.truncated && (
        <p className="mt-2 text-[11px] text-amber">
          Older history was skipped: the scan stops after a fixed number of chunked requests to stay
          within public RPC limits.
        </p>
      )}

      {open && (
        <div className="mt-3 space-y-3">
          <CodeBlock title="Request" code={JSON.stringify(request, null, 2)} />
          {sample && (
            <CodeBlock
              title="One log from the response"
              code={JSON.stringify(sample, null, 2)}
            />
          )}
          {decodedSample && (
            <CodeBlock
              title="Same log after decodeEventLog"
              code={JSON.stringify(decodedSample, null, 2)}
            />
          )}
          <CodeBlock
            title="Event signature hashes (topic0)"
            code={JSON.stringify(EVENT_TOPICS, null, 2)}
          />
        </div>
      )}
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/60 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wider text-muted">{label}</p>
      <p className="mono mt-0.5 text-xs">{value}</p>
    </div>
  );
}

function CodeBlock({ title, code }: { title: string; code: string }) {
  return (
    <div>
      <p className="mb-1 text-[11px] uppercase tracking-wider text-muted">{title}</p>
      <pre className="mono max-h-64 overflow-auto rounded-xl border border-line bg-canvas p-3 text-[11px] leading-relaxed text-accent-soft">
        {code}
      </pre>
    </div>
  );
}

/** Splits ABI-encoded event data into its 32-byte words, the way Etherscan displays it. */
function chunkData(data: string): string[] {
  const body = data.replace(/^0x/, "");
  const words: string[] = [];

  for (let index = 0; index < body.length; index += 64) {
    words.push(`0x${body.slice(index, index + 64)}`);
  }

  return words;
}
