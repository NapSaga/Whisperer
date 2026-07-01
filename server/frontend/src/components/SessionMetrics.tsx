"use client";

import { Metrics } from "@/lib/types";
import { cn } from "@/components/ui/utils";

function fmtDur(s: number) {
  const m = Math.floor(s / 60)
    .toString()
    .padStart(2, "0");
  const ss = Math.floor(s % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${ss}`;
}

function Cell({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 rounded-lg border px-3 py-2",
        highlight
          ? "border-emerald-200 bg-emerald-50"
          : "border-neutral-200 bg-white"
      )}
    >
      <span
        className={cn(
          "text-base font-semibold tabular-nums",
          highlight ? "text-emerald-700" : "text-neutral-800"
        )}
      >
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-wide text-neutral-400">
        {label}
      </span>
    </div>
  );
}

/**
 * Cruscotto verticale (sidebar) per capire se il metodo funziona: la durata cresce
 * ma $/turno resta piatto e la cache-hit e' alta (le due celle in verde) = il costo
 * non esplode. Sta in cima al pannello, sopra la memoria live.
 */
export function SessionMetrics({
  durationSec,
  metrics,
}: {
  durationSec: number;
  metrics: Metrics | null;
}) {
  const turns = metrics?.turn ?? 0;
  const usd = metrics?.total_usd ?? 0;
  const perTurn = turns > 0 ? usd / turns : 0;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Sessione
      </h3>
      <div className="grid grid-cols-2 gap-2">
        <Cell label="Durata" value={fmtDur(durationSec)} />
        <Cell label="Turni" value={String(turns)} />
        <Cell label="Costo" value={`$${usd.toFixed(4)}`} />
        <Cell label="$/turno" value={`$${perTurn.toFixed(4)}`} highlight />
        <Cell
          label="Cache-hit"
          value={`${Math.round(metrics?.cache_hit_pct ?? 0)}%`}
          highlight
        />
        <Cell
          label="Latenza"
          value={metrics?.latency_ms ? `${metrics.latency_ms}ms` : "—"}
        />
      </div>
    </div>
  );
}
