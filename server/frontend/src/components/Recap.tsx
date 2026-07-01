"use client";

import { Ledger, Metrics } from "@/lib/types";
import { Button } from "@/components/ui/Button";
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

function Stat({
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
        highlight ? "border-emerald-200 bg-emerald-50" : "border-neutral-200 bg-neutral-50"
      )}
    >
      <span
        className={cn(
          "text-lg font-semibold tabular-nums",
          highlight ? "text-emerald-700" : "text-neutral-800"
        )}
      >
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-wide text-neutral-400">{label}</span>
    </div>
  );
}

/**
 * Riepilogo di fine lezione: la prova del metodo in una schermata. Durata alta ma
 * $/turno piatto + cache-hit alta = costo che non esplode; i fatti ricordati e gli
 * argomenti trattati dimostrano memoria e progressione (niente ripetizioni).
 */
export function Recap({
  durationSec,
  metrics,
  ledger,
  questions,
  onClose,
}: {
  durationSec: number;
  metrics: Metrics | null;
  ledger: Ledger | null;
  questions: string[];
  onClose: () => void;
}) {
  const turns = metrics?.turn ?? 0;
  const usd = metrics?.total_usd ?? 0;
  const perTurn = turns > 0 ? usd / turns : 0;
  const facts = ledger?.facts ?? [];
  const commitments = ledger?.commitments ?? [];

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-6">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-neutral-900">Riepilogo lezione</h2>
        <p className="mt-1 text-xs text-neutral-400">
          Durata alta ma <span className="text-emerald-700">$/turno piatto</span> e{" "}
          <span className="text-emerald-700">cache-hit alta</span> = il costo non esplode.
        </p>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <Stat label="Durata" value={fmtDur(durationSec)} />
          <Stat label="Turni" value={String(turns)} />
          <Stat label="Costo" value={`$${usd.toFixed(4)}`} />
          <Stat label="$/turno" value={`$${perTurn.toFixed(4)}`} highlight />
          <Stat label="Cache-hit" value={`${Math.round(metrics?.cache_hit_pct ?? 0)}%`} highlight />
          <Stat label="Fatti ricordati" value={String(facts.length)} />
        </div>

        {questions.length > 0 && (
          <div className="mt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Argomenti trattati ({questions.length})
            </h3>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-neutral-700">
              {questions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ol>
          </div>
        )}

        {(facts.length > 0 || commitments.length > 0) && (
          <div className="mt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Cosa ha ricordato
            </h3>
            <ul className="mt-2 space-y-1 text-sm text-neutral-700">
              {facts.map((f) => (
                <li key={f.id}>• {f.text}</li>
              ))}
              {commitments.map((c) => (
                <li key={c.id} className="text-emerald-700">
                  ✓ {c.text}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <Button variant="primary" onClick={onClose} className="rounded-full px-6">
            Nuova conversazione
          </Button>
        </div>
      </div>
    </div>
  );
}
