"use client";

import type { ReactNode } from "react";

import { explorerTxUrl } from "@/lib/deployments";
import type { TxState } from "@/lib/hooks/useTxRunner";

export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card p-5 ${className}`}>
      {(title || action) && (
        <header className="mb-4 flex items-center justify-between gap-3">
          {title ? <h2 className="card-title">{title}</h2> : <span />}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/60 px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wider text-muted">{label}</p>
      <p className="mono mt-1 text-sm text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

export function AmountField({
  label,
  value,
  onChange,
  onMax,
  suffix,
  hint,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onMax?: () => void;
  suffix?: string;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-xs text-muted">
        <span>{label}</span>
        {hint}
      </span>
      <span className="relative mt-1.5 block">
        <input
          className="field pr-24"
          inputMode="decimal"
          placeholder="0.0"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(sanitize(event.target.value))}
        />
        <span className="absolute inset-y-0 right-2 flex items-center gap-1.5">
          {onMax && (
            <button
              type="button"
              className="rounded-md border border-line px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted hover:border-accent hover:text-ink"
              onClick={onMax}
            >
              Max
            </button>
          )}
          {suffix && (
            <span className="mono text-xs text-muted">{suffix}</span>
          )}
        </span>
      </span>
    </label>
  );
}

function sanitize(value: string): string {
  const cleaned = value.replace(/[^0-9.]/g, "");
  const [whole, ...rest] = cleaned.split(".");
  return rest.length > 0 ? `${whole}.${rest.join("")}` : whole;
}

export function TabBar<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly T[];
  active: T;
  onChange: (tab: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-xl border border-line bg-canvas p-1">
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onChange(tab)}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold capitalize transition ${
            active === tab
              ? "bg-accent text-white"
              : "text-muted hover:text-ink"
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

export function TxFeedback({
  state,
  chainId,
}: {
  state: TxState;
  chainId: number;
}) {
  if (state.status === "idle") return null;

  const tone =
    state.status === "error"
      ? "border-danger/40 text-danger"
      : state.status === "success"
        ? "border-teal/40 text-teal"
        : "border-line text-muted";

  const explorer = state.hash ? explorerTxUrl(chainId, state.hash) : undefined;

  return (
    <div className={`mt-3 rounded-xl border px-3 py-2 text-xs ${tone}`}>
      <p className="font-semibold">
        {state.status === "pending" && `${state.label ?? "Transaction"} pending...`}
        {state.status === "success" && `${state.label ?? "Transaction"} confirmed`}
        {state.status === "error" && (state.error ?? "Transaction failed")}
      </p>
      {state.hash && (
        <p className="mono mt-1 break-all text-[11px] text-muted">
          {explorer ? (
            <a
              className="hover:text-accent-soft"
              href={explorer}
              target="_blank"
              rel="noreferrer"
            >
              {state.hash}
            </a>
          ) : (
            state.hash
          )}
        </p>
      )}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-32 items-center justify-center rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
      {children}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted">
      <span className="size-3 animate-spin rounded-full border-2 border-line border-t-accent" />
      {label}
    </div>
  );
}
