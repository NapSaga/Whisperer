"use client";

import { Ledger, LedgerEntry } from "@/lib/types";

interface LedgerPanelProps {
  ledger: Ledger | null;
}

function EntryRow({ entry }: { entry: LedgerEntry }) {
  return (
    <li className="flex items-start gap-2 text-sm leading-snug">
      <span className="mt-px shrink-0 rounded bg-neutral-200 px-1.5 py-0.5 font-mono text-[11px] text-neutral-600">
        {entry.turn}
      </span>
      <span className="text-neutral-800">{entry.text}</span>
    </li>
  );
}

function Section({
  title,
  entries,
  empty,
}: {
  title: string;
  entries: LedgerEntry[];
  empty: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {title}
        {entries.length > 0 && (
          <span className="ml-1.5 font-normal text-neutral-400">
            ({entries.length})
          </span>
        )}
      </h3>
      {entries.length === 0 ? (
        <p className="text-sm text-neutral-400">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </div>
  );
}

// Live ledger panel — the proof the agent remembers. Facts and commitments,
// each with a [turn] citation, accumulate in real time as the distiller writes
// state.json and the server pushes `state.updated` over the websocket.
export function LedgerPanel({ ledger }: LedgerPanelProps) {
  return (
    <aside className="hidden md:flex w-80 shrink-0 flex-col gap-5 overflow-y-auto border-l border-neutral-200 bg-neutral-50 p-5">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Live memory
        </span>
        <p className="text-xs text-neutral-400">
          What the agent is remembering from this call.
        </p>
      </div>

      {!ledger ? (
        <p className="text-sm text-neutral-400">Listening…</p>
      ) : (
        <>
          <Section
            title="Facts"
            entries={ledger.facts}
            empty="No facts yet."
          />
          <Section
            title="Commitments"
            entries={ledger.commitments}
            empty="No commitments yet."
          />
        </>
      )}
    </aside>
  );
}
