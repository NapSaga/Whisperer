"use client";

import { Metrics } from "@/lib/types";
import { cn } from "@/components/ui/utils";

function fmtDur(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const ss = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col rounded-lg border border-neutral-200 bg-white px-2 py-1.5">
      <span className="text-sm font-semibold tabular-nums text-neutral-800">{value}</span>
      <span className="text-[9px] uppercase tracking-wide text-neutral-400">{label}</span>
    </div>
  );
}

function Sparkline({ values, max, color }: { values: number[]; max: number; color: string }) {
  const v = values.slice(-16);
  return (
    <div className="flex h-9 items-end gap-[2px]" aria-hidden>
      {v.map((x, i) => (
        <div
          key={i}
          className={cn("w-1 rounded-sm", color)}
          style={{ height: `${Math.max(8, Math.min(100, (x / (max || 1)) * 100))}%` }}
        />
      ))}
    </div>
  );
}

function CompareCard({
  title,
  tag,
  usd,
  perTurn,
  deltaPct,
  values,
  max,
  active,
  sparkColor,
}: {
  title: string;
  tag: string;
  usd: number;
  perTurn: number;
  deltaPct?: number | null;
  values: number[];
  max: number;
  active?: boolean;
  sparkColor: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3 transition",
        active ? "border-emerald-300 bg-emerald-50/60 shadow-sm" : "border-neutral-200 bg-white"
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "text-sm font-semibold",
            active ? "text-emerald-800" : "text-neutral-700"
          )}
        >
          {title}
        </span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px]",
            active ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-500"
          )}
        >
          {tag}
        </span>
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-3">
        <div>
          <div
            className={cn(
              "text-2xl font-semibold tabular-nums",
              active ? "text-emerald-700" : "text-neutral-900"
            )}
          >
            ${usd.toFixed(4)}
          </div>
          <div className="mt-0.5 text-[11px] text-neutral-400">
            ${perTurn.toFixed(4)}/turno
            {deltaPct != null && deltaPct !== 0 ? (
              <span className={cn("ml-1 font-medium", deltaPct > 0 ? "text-red-500" : "text-emerald-600")}>
                {deltaPct > 0 ? "+" : ""}
                {deltaPct}%
              </span>
            ) : null}
          </div>
        </div>
        <Sparkline values={values} max={max} color={sparkColor} />
      </div>
    </div>
  );
}

/**
 * Confronto costi LIVE: "quanto stai pagando" col Suggeritore (reale) vs "quanto
 * sarebbe" con Base pieno / Base cappato (proiezione sugli stessi turni). La forma
 * conta: Base pieno sale, Suggeritore resta piatto.
 */
export function CostCompare({
  durationSec,
  metrics,
}: {
  durationSec: number;
  metrics: Metrics | null;
}) {
  const turns = metrics?.turn ?? 0;
  const sug = metrics?.sug_usd ?? 0;
  const full = metrics?.base_full_usd ?? 0;
  const cap = metrics?.base_cap_usd ?? 0;
  const per = (u: number) => (turns > 0 ? u / turns : 0);
  const delta = (u: number) => (sug > 0 ? Math.round(((u - sug) / sug) * 100) : 0);
  const tSug = metrics?.trend_sug ?? [];
  const tFull = metrics?.trend_full ?? [];
  const tCap = metrics?.trend_cap ?? [];
  const max = Math.max(0.0001, ...tSug, ...tFull, ...tCap);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-4 gap-1.5">
        <MiniStat label="Durata" value={fmtDur(durationSec)} />
        <MiniStat label="Turni" value={String(turns)} />
        <MiniStat label="Latenza" value={metrics?.latency_ms ? `${metrics.latency_ms}ms` : "—"} />
        <MiniStat label="Cache" value={`${Math.round(metrics?.cache_hit_pct ?? 0)}%`} />
      </div>

      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Costo — quanto sta vs quanto sarebbe
      </h3>

      <CompareCard
        title="Suggeritore"
        tag="reale"
        active
        usd={sug}
        perTurn={per(sug)}
        values={tSug}
        max={max}
        sparkColor="bg-emerald-400"
      />
      <CompareCard
        title="Base pieno"
        tag="proiezione"
        usd={full}
        perTurn={per(full)}
        deltaPct={delta(full)}
        values={tFull}
        max={max}
        sparkColor="bg-neutral-400"
      />
      <CompareCard
        title="Base cappato"
        tag="dimentica"
        usd={cap}
        perTurn={per(cap)}
        deltaPct={delta(cap)}
        values={tCap}
        max={max}
        sparkColor="bg-neutral-300"
      />

      <p className="text-[11px] leading-snug text-neutral-400">
        Proiezione sui token reali (gpt-realtime-mini, con caching). A 15 min il divario è
        modesto; cresce con la durata — Base pieno sale, Suggeritore resta piatto.
      </p>
    </div>
  );
}
