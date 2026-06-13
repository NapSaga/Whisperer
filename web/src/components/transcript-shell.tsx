"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  SkipForwardIcon,
  Volume2Icon,
  VolumeXIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import type {
  CostEvent,
  CostFixture,
  DisplayTurn,
  StateLedger,
  StateLedgerEntry,
  VerdictsFixture,
} from "@/lib/contracts";
import { VerdictView } from "@/components/verdict-view";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

/*
 * DESIGN SYSTEM — "tabellone delle prove", light premium editorial (defined, not vibe).
 *  bg            soft off-white radial (globals.css), white cards + subtle shadow
 *  surface       --card (white) / --surface-soft (light gray) ; hairline border-black/10
 *  fail (base)   red    — the agent that forgets = the problem
 *  recall (sug)  emerald — the solution; SCARCE: only the win + memory writes
 *  voice-accent  violet — the memory layer / the caller's voice
 *  running       amber  — live / in-progress
 *  data type     Geist Mono — timestamps, [tN] citations, $, scores
 *  motif         every claim carries its [tN] citation = receipts, no vibes
 */

type TranscriptShellProps = {
  baseTurns: DisplayTurn[];
  cost: CostFixture;
  suggeritoreTurns: DisplayTurn[];
  state: StateLedger;
  verdicts: VerdictsFixture;
};

const REPLAY_RATE = 12;
const FRAME_MS = 100;
const WINDOW = 6;
const AUDIO_TURNS = ["t1", "t5", "t7", "t9", "t38", "t40"];

function parseTimestamp(ts: string) {
  const [minutes = "0", seconds = "0"] = ts.split(":");
  return Number(minutes) * 60 + Number(seconds);
}

function formatTimestamp(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function parseTurnNumber(turn: string) {
  const match = turn.match(/^t(\d+)/);
  return match ? Number(match[1]) : 0;
}

function secondsForTurn(turns: DisplayTurn[], id: string) {
  const found = turns.find((turn) => turn.displayTurn === id);
  return found ? parseTimestamp(found.ts) : null;
}

function formatUsd(value: number) {
  return `$${value.toFixed(2)}`;
}

function latestCostEvent(
  events: CostEvent[],
  agent: CostEvent["agent"],
  currentSeconds: number,
  turnTimes: Map<string, number>
) {
  return events
    .filter(
      (event) =>
        event.agent === agent &&
        (turnTimes.get(event.turn) ?? Infinity) <= currentSeconds
    )
    .sort((a, b) => (turnTimes.get(b.turn) ?? 0) - (turnTimes.get(a.turn) ?? 0))[0];
}

/* ----------------------------------------------------------- cost pressure meter */

function PressureMeter({
  cost,
  currentSeconds,
  turnTimes,
  recallActive,
}: {
  cost: CostFixture;
  currentSeconds: number;
  turnTimes: Map<string, number>;
  recallActive: boolean;
}) {
  const baseEvent = latestCostEvent(cost.events, "base", currentSeconds, turnTimes);
  const sugEvent = latestCostEvent(cost.events, "suggeritore", currentSeconds, turnTimes);
  const baseValue = baseEvent?.usd_cumulative ?? 0;
  const sugValue = sugEvent?.usd_cumulative ?? 0;
  const live = baseValue > 0 && sugValue > 0 ? (baseValue / sugValue).toFixed(1) : null;

  return (
    <div className="flex items-center gap-4 rounded-lg border border-black/10 bg-[color:var(--card)] px-4 py-1.5 shadow-sm">
      <span className="font-mono text-[0.62rem] uppercase tracking-wider text-muted-foreground">
        costo · stima
      </span>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[0.66rem] uppercase tracking-wide text-muted-foreground">base</span>
        <span className="font-mono text-base font-semibold tabular-nums text-[color:var(--fail)]">
          {formatUsd(baseValue)}
        </span>
      </div>
      <Separator orientation="vertical" className="h-5" />
      <div className="flex items-baseline gap-1.5">
        <span className="text-[0.66rem] uppercase tracking-wide text-muted-foreground">sugg.</span>
        <span className="font-mono text-base font-semibold tabular-nums text-[color:var(--voice-accent)]">
          {formatUsd(sugValue)}
        </span>
      </div>
      <Separator orientation="vertical" className="h-5" />
      <span
        className={cn(
          "font-mono font-bold tabular-nums transition-all",
          recallActive ? "text-xl text-[color:var(--fail)]" : "text-sm text-muted-foreground"
        )}
      >
        {live ? `${live}×` : "—"}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------- replay bar */

function ReplayBar({
  currentSeconds,
  duration,
  isPlaying,
  muted,
  speaking,
  markers,
  onPlayPause,
  onRestart,
  onSeek,
  onJumpToRecall,
  onToggleMute,
}: {
  currentSeconds: number;
  duration: number;
  isPlaying: boolean;
  muted: boolean;
  speaking: boolean;
  markers: { label: string; seconds: number; recall?: boolean }[];
  onPlayPause: () => void;
  onRestart: () => void;
  onSeek: (value: number) => void;
  onJumpToRecall: () => void;
  onToggleMute: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-black/10 bg-[color:var(--card)] px-4 py-2.5 shadow-sm">
      <div className="flex items-center gap-2.5">
        <Button
          size="sm"
          onClick={onJumpToRecall}
          className="h-9 bg-[color:var(--recall)] px-4 font-semibold text-white hover:bg-[color:var(--recall)]/90"
        >
          <SkipForwardIcon data-icon="inline-start" />
          Vai al recall
        </Button>
        <Button variant="outline" size="sm" className="h-9" onClick={onRestart}>
          <RotateCcwIcon data-icon="inline-start" />
          Dall&apos;inizio
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-9"
          onClick={onPlayPause}
          aria-label={isPlaying ? "Pausa" : "Riprendi"}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-9"
          onClick={onToggleMute}
          aria-label={muted ? "Riattiva la voce" : "Disattiva la voce"}
        >
          {muted ? <VolumeXIcon /> : <Volume2Icon />}
        </Button>

        <div className="ml-auto flex items-center gap-3">
          {speaking ? (
            <span className="flex items-center gap-1.5 font-mono text-xs text-[color:var(--voice-accent)]">
              <span className="size-2 animate-pulse rounded-full bg-[color:var(--voice-accent)]" />
              Nonna sta parlando…
            </span>
          ) : null}
          <span className="font-mono text-sm tabular-nums text-muted-foreground">
            <span className="text-foreground">{formatTimestamp(currentSeconds)}</span>
            {" / "}
            {formatTimestamp(duration)}
          </span>
        </div>
      </div>

      <div className="relative pb-4 pt-0.5">
        <Slider
          value={[currentSeconds]}
          min={0}
          max={duration}
          step={1}
          onValueChange={(value) => onSeek(Array.isArray(value) ? value[0] ?? 0 : value)}
          aria-label="Timeline della chiamata"
        />
        {markers.map((marker) => {
          const left = duration ? (marker.seconds / duration) * 100 : 0;
          return (
            <div
              key={marker.label}
              className="pointer-events-none absolute top-0.5 flex -translate-x-1/2 flex-col items-center"
              style={{ left: `${left}%` }}
            >
              <span
                className={cn(
                  "h-2 w-0.5 rounded-full",
                  marker.recall ? "bg-[color:var(--recall)]" : "bg-black/25"
                )}
              />
              <span
                className={cn(
                  "mt-0.5 whitespace-nowrap text-[0.7rem]",
                  marker.recall ? "font-medium text-[color:var(--recall)]" : "text-muted-foreground"
                )}
              >
                {marker.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- lane */

// Reveal a spoken line word-by-word in sync with the audio: revealed words are
// solid, the rest stay faint and "light up" as the voice reaches them.
function KaraokeText({ text, progress }: { text: string; progress: number }) {
  const tokens = text.split(" ");
  const reveal = Math.round(progress * tokens.length);
  return (
    <>
      {tokens.map((word, i) => (
        <span
          key={i}
          className={cn(
            "transition-opacity duration-200",
            i < reveal ? "opacity-100" : "opacity-25"
          )}
        >
          {word}
          {i < tokens.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
}

function LaneColumn({
  title,
  subtitle,
  turns,
  lane,
  recallActive,
  speakingTurn,
  clipProgress,
}: {
  title: string;
  subtitle: string;
  turns: DisplayTurn[];
  lane: "base" | "suggeritore";
  recallActive: boolean;
  speakingTurn: string | null;
  clipProgress: number;
}) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turns.length, recallActive]);

  const isSug = lane === "suggeritore";
  const stateLabel = recallActive
    ? isSug
      ? "RICORDA"
      : "DIMENTICA"
    : isSug
      ? "memoria attiva"
      : "nessuna memoria";

  return (
    <section
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-xl border bg-[color:var(--card)] shadow-sm transition-colors",
        recallActive && isSug && "border-[color:var(--recall)]/60",
        recallActive && !isSug && "border-[color:var(--fail)]/50",
        !recallActive && "border-black/10"
      )}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-black/10 px-4 py-2.5">
        <div className="flex flex-col">
          <h2 className="text-base font-semibold leading-tight">{title}</h2>
          <p className="text-[0.72rem] text-muted-foreground">{subtitle}</p>
        </div>
        <span
          className={cn(
            "rounded px-2 py-0.5 font-mono text-[0.64rem] uppercase tracking-wide",
            recallActive && isSug && "bg-[color:var(--recall)]/15 text-[color:var(--recall)]",
            recallActive && !isSug && "bg-[color:var(--fail)]/15 text-[color:var(--fail)]",
            !recallActive && isSug && "bg-[color:var(--voice-accent)]/15 text-[color:var(--voice-accent)]",
            !recallActive && !isSug && "bg-black/[0.05] text-muted-foreground"
          )}
        >
          {stateLabel}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {turns.length === 0 ? (
          <div className="flex h-full min-h-32 items-center justify-center text-center text-sm text-muted-foreground">
            Premi play per avviare la chiamata.
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {turns.map((turn) => {
              const isCaller = turn.role === "caller";
              const isDivergent = recallActive && turn.displayTurn === "t41";
              const isWin = isDivergent && isSug;
              const isFail = isDivergent && !isSug;
              const isSpeaking = speakingTurn === turn.displayTurn && isCaller;

              return (
                <div
                  key={`${lane}-${turn.turn}`}
                  className={cn("flex flex-col gap-1", isCaller ? "items-end" : "items-start")}
                >
                  <div
                    className={cn(
                      "flex items-center gap-1.5 font-mono text-[0.62rem] text-muted-foreground",
                      isCaller && "flex-row-reverse"
                    )}
                  >
                    <span className={cn(isCaller && "text-[color:var(--voice-accent)]")}>
                      {isCaller ? "Nonna" : "Agente"}
                    </span>
                    <span>·</span>
                    <span>{turn.ts}</span>
                    <span className="opacity-60">[{turn.displayTurn}]</span>
                    {isSpeaking ? (
                      <span className="size-1.5 animate-pulse rounded-full bg-[color:var(--voice-accent)]" />
                    ) : null}
                  </div>

                  <div
                    className={cn(
                      "max-w-[95%] rounded-lg px-3 py-2 text-[0.88rem] leading-6 transition-all",
                      isCaller && "bg-secondary text-foreground",
                      !isCaller &&
                        "border border-black/10 bg-[color:var(--surface-soft)] text-foreground",
                      isSpeaking &&
                        "border-[color:var(--voice-accent)]/60 ring-2 ring-[color:var(--voice-accent)]/70 shadow-[0_0_34px_color-mix(in_oklch,var(--voice-accent),transparent_66%)]",
                      isFail &&
                        "border-[color:var(--fail)] bg-[color:var(--fail)]/12 text-foreground shadow-[0_0_24px_color-mix(in_oklch,var(--fail),transparent_82%)]",
                      isWin &&
                        "border border-[color:var(--recall)] bg-[color:var(--recall)] font-medium text-white shadow-[0_8px_30px_-6px_var(--recall-glow)]"
                    )}
                  >
                    {isSpeaking ? (
                      <KaraokeText text={turn.text} progress={clipProgress} />
                    ) : (
                      turn.text
                    )}
                  </div>

                  {isFail ? (
                    <span className="flex items-center gap-1 font-mono text-[0.68rem] text-[color:var(--fail)]">
                      <XIcon className="size-3" /> chiede di nuovo tutto da capo
                    </span>
                  ) : null}
                  {isWin ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="flex items-center gap-1 font-mono text-[0.68rem] text-[color:var(--recall)]">
                        <CheckIcon className="size-3" /> prova
                      </span>
                      <span className="rounded bg-[color:var(--recall)]/15 px-1.5 py-0.5 font-mono text-[0.7rem] text-[color:var(--recall)]">
                        [t5] scadenza
                      </span>
                      <span className="rounded bg-[color:var(--recall)]/15 px-1.5 py-0.5 font-mono text-[0.7rem] text-[color:var(--recall)]">
                        [t9] consegna
                      </span>
                    </div>
                  ) : null}
                </div>
              );
            })}
            <div ref={endRef} aria-hidden="true" />
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ memory rail */

function MemoryItem({ entry, recalled }: { entry: StateLedgerEntry; recalled: boolean }) {
  return (
    <div
      className={cn(
        "animate-in fade-in slide-in-from-bottom-1 flex items-start gap-2 rounded-md border px-2.5 py-2 duration-500",
        recalled
          ? "border-[color:var(--recall)]/60 bg-[color:var(--recall)]/10"
          : "border-black/10 bg-[color:var(--surface-soft)]"
      )}
    >
      <CheckIcon
        className={cn(
          "mt-0.5 size-3 shrink-0",
          recalled ? "text-[color:var(--recall)]" : "text-[color:var(--voice-accent)]"
        )}
      />
      <p className="flex-1 text-[0.78rem] leading-5 text-foreground">{entry.text}</p>
      <span
        className={cn(
          "mt-0.5 shrink-0 font-mono text-[0.6rem]",
          recalled ? "text-[color:var(--recall)]" : "text-muted-foreground"
        )}
      >
        [{entry.turn}]
      </span>
    </div>
  );
}

function MemoryRail({
  state,
  currentSeconds,
  turnTimes,
  recallActive,
}: {
  state: StateLedger;
  currentSeconds: number;
  turnTimes: Map<string, number>;
  recallActive: boolean;
}) {
  const isVisible = (entry: StateLedgerEntry) =>
    (turnTimes.get(entry.turn) ?? Infinity) <= currentSeconds;
  const visibleFacts = state.facts.filter(isVisible);
  const visibleCommitments = state.commitments.filter(isVisible);
  const revealed = visibleFacts.length + visibleCommitments.length;
  const total = state.facts.length + state.commitments.length;
  const recalledIds = ["f3", "f5"];

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-black/10 bg-[color:var(--card)] shadow-sm">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-black/10 px-4 py-2.5">
        <div className="flex flex-col">
          <h2 className="text-base font-semibold leading-tight text-[color:var(--voice-accent)]">
            Memoria viva
          </h2>
          <p className="text-[0.72rem] text-muted-foreground">si scrive da sola</p>
        </div>
        <span className="rounded bg-[color:var(--voice-accent)]/15 px-2 py-0.5 font-mono text-[0.64rem] text-[color:var(--voice-accent)]">
          {revealed}/{total}
        </span>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {recallActive ? (
          <div className="animate-in fade-in slide-in-from-bottom-1 rounded-md border border-[color:var(--recall)] bg-[color:var(--recall)]/10 px-3 py-2 shadow-[0_0_24px_var(--recall-glow)] duration-500">
            <p className="font-mono text-[0.62rem] uppercase tracking-wide text-[color:var(--recall)]">
              prova del recall · t41
            </p>
            <p className="mt-0.5 text-[0.78rem] leading-5 text-foreground">
              Suggeritore cita scadenza e consegna dalla memoria.
            </p>
          </div>
        ) : null}

        <div>
          <p className="mb-1.5 text-[0.72rem] font-medium uppercase tracking-wider text-muted-foreground">
            Chi è
          </p>
          <p className="rounded-md border border-[color:var(--voice-accent)]/25 bg-[color:var(--voice-accent)]/10 px-2.5 py-2 text-[0.78rem] leading-5">
            {state.identity}
          </p>
        </div>

        <div>
          <p className="mb-1.5 text-[0.72rem] font-medium uppercase tracking-wider text-muted-foreground">
            Cosa vuole
          </p>
          <p className="rounded-md border border-black/10 bg-[color:var(--surface-soft)] px-2.5 py-2 text-[0.78rem] leading-5">
            {state.objective}
          </p>
        </div>

        <Separator />

        <div>
          <p className="mb-1.5 text-[0.72rem] font-medium uppercase tracking-wider text-muted-foreground">
            Cosa ho ricordato
          </p>
          <div className="flex flex-col gap-1.5">
            {visibleFacts.length === 0 ? (
              <p className="rounded-md border border-dashed border-black/10 px-2.5 py-2 text-center text-[0.74rem] text-muted-foreground">
                in ascolto…
              </p>
            ) : (
              visibleFacts.map((entry) => (
                <MemoryItem
                  key={entry.id}
                  entry={entry}
                  recalled={recallActive && recalledIds.includes(entry.id)}
                />
              ))
            )}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[0.72rem] font-medium uppercase tracking-wider text-muted-foreground">
            Cosa ho promesso
          </p>
          <div className="flex flex-col gap-1.5">
            {visibleCommitments.length === 0 ? (
              <p className="rounded-md border border-dashed border-black/10 px-2.5 py-2 text-center text-[0.74rem] text-muted-foreground">
                nessun impegno ancora
              </p>
            ) : (
              visibleCommitments.map((entry) => (
                <MemoryItem key={entry.id} entry={entry} recalled={false} />
              ))
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------- verdict reveal bar */

function VerdictBar({
  verdicts,
  recallActive,
  onOpenProof,
}: {
  verdicts: VerdictsFixture;
  recallActive: boolean;
  onOpenProof: () => void;
}) {
  if (!recallActive) {
    return (
      <div className="flex shrink-0 items-center justify-center gap-3 rounded-lg border border-black/10 bg-[color:var(--card)] px-5 py-2.5 text-sm text-muted-foreground shadow-sm">
        <span className="font-mono text-[0.66rem] uppercase tracking-wider">verdetto</span>
        <span>Il giudice valuta la memoria a fine chiamata — N=10 run per lato</span>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 flex shrink-0 flex-wrap items-center justify-between gap-4 rounded-xl border border-[color:var(--recall)]/50 bg-[color:var(--card)] px-5 py-2.5 shadow-[0_12px_40px_-10px_var(--recall-glow)] duration-500">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
        <span className="font-mono text-[0.66rem] uppercase tracking-wider text-[color:var(--recall)]">
          il verdetto · run-1330 · misurato
        </span>
        <div className="flex items-baseline gap-2">
          <span className="text-[0.72rem] uppercase tracking-wide text-muted-foreground">base</span>
          <span className="font-mono text-3xl font-bold tabular-nums leading-none text-[color:var(--fail)]">
            {verdicts.score.base}
          </span>
        </div>
        <span className="text-sm text-muted-foreground">vs</span>
        <div className="flex items-baseline gap-2">
          <span className="text-[0.72rem] uppercase tracking-wide text-muted-foreground">
            suggeritore
          </span>
          <span className="font-mono text-3xl font-bold tabular-nums leading-none text-[color:var(--recall)]">
            {verdicts.score.suggeritore}
          </span>
        </div>
      </div>
      <Button variant="outline" size="sm" className="h-9" onClick={onOpenProof}>
        Le prove · {verdicts.runs.base.length + verdicts.runs.suggeritore.length} run
      </Button>
    </div>
  );
}

function ProofOverlay({
  verdicts,
  onClose,
}: {
  verdicts: VerdictsFixture;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="animate-in fade-in fixed inset-0 z-50 grid place-items-center bg-black/75 p-6 backdrop-blur-sm duration-200"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="relative max-h-[86vh] w-full max-w-4xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-3 top-3 z-10 size-9"
          onClick={onClose}
          aria-label="Chiudi le prove"
        >
          <XIcon />
        </Button>
        <VerdictView verdicts={verdicts} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ shell */

export function TranscriptShell({
  baseTurns,
  cost,
  suggeritoreTurns,
  state,
  verdicts,
}: TranscriptShellProps) {
  const allTurns = useMemo(
    () => [...baseTurns, ...suggeritoreTurns],
    [baseTurns, suggeritoreTurns]
  );
  const duration = useMemo(
    () => Math.max(...allTurns.map((turn) => parseTimestamp(turn.ts))),
    [allTurns]
  );
  // first spoken line — we start the replay here so Play hits voice immediately
  // (no dead air crawling from 00:00 to the first turn)
  const firstTs = useMemo(
    () => Math.min(...allTurns.map((turn) => parseTimestamp(turn.ts))),
    [allTurns]
  );
  const recallStart = useMemo(() => secondsForTurn(baseTurns, "t38") ?? 596, [baseTurns]);
  const recallEnd = useMemo(() => secondsForTurn(baseTurns, "t41") ?? 614, [baseTurns]);
  const turnTimes = useMemo(
    () => new Map(baseTurns.map((turn) => [turn.displayTurn, parseTimestamp(turn.ts)])),
    [baseTurns]
  );

  const markers = useMemo(() => {
    const out: { label: string; seconds: number; recall?: boolean }[] = [];
    const scadenza = secondsForTurn(baseTurns, "t5");
    const consegna = secondsForTurn(baseTurns, "t9");
    if (scadenza != null) out.push({ label: "scadenza", seconds: scadenza });
    if (consegna != null) out.push({ label: "consegna", seconds: consegna });
    out.push({ label: "test memoria", seconds: recallStart, recall: true });
    return out;
  }, [baseTurns, recallStart]);

  const audioTurns = useMemo(
    () =>
      AUDIO_TURNS.map((id) => [id, turnTimes.get(id)] as const)
        .filter((pair): pair is [string, number] => typeof pair[1] === "number")
        .sort((a, b) => a[1] - b[1]),
    [turnTimes]
  );

  const [currentSeconds, setCurrentSeconds] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speakingTurn, setSpeakingTurn] = useState<string | null>(null);
  // 0→1 progress of the clip currently being spoken, drives the karaoke reveal
  const [clipProgress, setClipProgress] = useState(0);
  const [showProof, setShowProof] = useState(false);
  const recallToastFiredRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevSecondsRef = useRef(0);
  const holdRef = useRef(false);

  const recallActive = currentSeconds >= recallEnd;

  const baseWindow = useMemo(
    () =>
      baseTurns
        .filter((turn) => parseTimestamp(turn.ts) <= currentSeconds)
        .sort((a, b) => parseTurnNumber(a.displayTurn) - parseTurnNumber(b.displayTurn))
        .slice(-WINDOW),
    [baseTurns, currentSeconds]
  );
  const suggeritoreWindow = useMemo(
    () =>
      suggeritoreTurns
        .filter((turn) => parseTimestamp(turn.ts) <= currentSeconds)
        .sort((a, b) => parseTurnNumber(a.displayTurn) - parseTurnNumber(b.displayTurn))
        .slice(-WINDOW),
    [suggeritoreTurns, currentSeconds]
  );

  // auto-advance — frozen while a clip speaks (holdRef)
  useEffect(() => {
    if (!isPlaying) return;
    const id = window.setInterval(() => {
      if (holdRef.current) return;
      setCurrentSeconds((seconds) => {
        const next = Math.min(duration, seconds + REPLAY_RATE * (FRAME_MS / 1000));
        if (next >= duration) window.setTimeout(() => setIsPlaying(false), 0);
        return next;
      });
    }, FRAME_MS);
    return () => window.clearInterval(id);
  }, [duration, isPlaying]);

  // recall payoff toast
  useEffect(() => {
    if (currentSeconds < recallEnd) {
      recallToastFiredRef.current = false;
      return;
    }
    if (recallToastFiredRef.current) return;
    recallToastFiredRef.current = true;
    toast("Ricorda ✓", {
      duration: 2600,
      className:
        "border-[color:var(--recall)] bg-[color:var(--surface-strong)] text-[color:var(--recall)] shadow-[0_0_44px_var(--recall-glow)]",
    });
  }, [currentSeconds, recallEnd]);

  // play the real nonna voice on forward crossings and HOLD until the clip ends
  useEffect(() => {
    const prev = prevSecondsRef.current;
    prevSecondsRef.current = currentSeconds;
    if (currentSeconds < prev) {
      holdRef.current = false;
      return;
    }
    if (muted || currentSeconds <= prev) return;
    const crossed = audioTurns.filter(([, sec]) => sec > prev && sec <= currentSeconds);
    if (crossed.length === 0) return;
    const [turn] = crossed[crossed.length - 1];
    const el = audioRef.current;
    if (!el) return;
    const release = () => {
      holdRef.current = false;
      setSpeakingTurn(null);
    };
    el.onended = release;
    el.onerror = release;
    el.src = `/audio/${turn}.mp3`;
    el.currentTime = 0;
    el.volume = 1;
    holdRef.current = true;
    setClipProgress(0);
    setSpeakingTurn(turn);
    void el.play().catch(release);
  }, [currentSeconds, muted, audioTurns]);

  // karaoke clock — reveal the spoken line in sync with the real audio position.
  // Driven by the audio element's currentTime so it freezes exactly on pause and
  // resumes from the same word. Quantized to 1% to avoid 60fps re-renders.
  useEffect(() => {
    if (speakingTurn == null || !isPlaying) return;
    let raf = 0;
    const tick = () => {
      const el = audioRef.current;
      if (el && el.duration > 0) {
        const next = Math.round(Math.min(1, el.currentTime / el.duration) * 100) / 100;
        setClipProgress((prev) => (Math.abs(prev - next) >= 0.01 ? next : prev));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [speakingTurn, isPlaying]);

  const stopClip = useCallback(() => {
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
    holdRef.current = false;
    setSpeakingTurn(null);
    setClipProgress(0);
  }, []);

  const handleSeek = (value: number) => {
    stopClip();
    setCurrentSeconds(Math.min(duration, Math.max(0, value)));
  };

  const handleRestart = () => {
    stopClip();
    // jump to just before the first spoken line so the voice + first bubble land
    // in ~0.1s instead of after a long silent lead-in.
    prevSecondsRef.current = firstTs - 1;
    setCurrentSeconds(Math.max(0, firstTs - 0.5));
    setIsPlaying(true);
  };

  const handleJumpToRecall = () => {
    stopClip();
    // land just before t38 so the jump always counts as a forward crossing of
    // the recall question (replayable across rehearsals) and ONLY t38 fires.
    prevSecondsRef.current = recallStart - 0.5;
    setCurrentSeconds(recallStart);
    setIsPlaying(true);
  };

  const handlePlayPause = () => {
    const el = audioRef.current;
    if (isPlaying) {
      // pause EVERYTHING — freeze the clock and the voice mid-clip
      setIsPlaying(false);
      if (el && !el.paused) el.pause();
      return;
    }
    // resume
    if (currentSeconds >= duration) {
      handleRestart();
      return;
    }
    if (holdRef.current && el && el.paused && el.currentSrc) {
      // a clip was paused mid-way — finish it (onended releases the hold)
      void el.play().catch(() => {
        holdRef.current = false;
        setSpeakingTurn(null);
      });
    } else {
      prevSecondsRef.current = currentSeconds; // resume without replaying the last clip
    }
    setIsPlaying(true);
  };

  return (
    <main className="flex h-dvh flex-col gap-3 overflow-hidden p-5">
      <audio ref={audioRef} preload="auto" aria-hidden="true" />

      {/* top strip — brand + demoted cost meter */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-sm font-semibold uppercase tracking-[0.2em] text-foreground">
            Il Suggeritore
          </span>
          <span className="font-mono text-[0.7rem] text-muted-foreground">HackRome · 13 giu 2026</span>
        </div>
        <PressureMeter
          cost={cost}
          currentSeconds={currentSeconds}
          turnTimes={turnTimes}
          recallActive={recallActive}
        />
      </div>

      {/* operative title */}
      <header className="flex shrink-0 flex-col">
        <h1 className="text-2xl font-semibold leading-tight tracking-tight text-foreground lg:text-3xl">
          La stessa chiamata. Uno dimentica, uno ricorda.
        </h1>
        <p className="text-sm text-muted-foreground">
          {recallActive
            ? "A 10:14 il base richiede tutto da capo. Il Suggeritore conferma — con la prova."
            : "Stesso prompt, stessa voce. L'unica differenza è il layer di memoria."}
        </p>
      </header>

      <ReplayBar
        currentSeconds={currentSeconds}
        duration={duration}
        isPlaying={isPlaying}
        muted={muted}
        speaking={speakingTurn != null && isPlaying}
        markers={markers}
        onPlayPause={handlePlayPause}
        onRestart={handleRestart}
        onSeek={handleSeek}
        onJumpToRecall={handleJumpToRecall}
        onToggleMute={() => setMuted((value) => !value)}
      />

      {/* stage — the three panels are the hero, bounded to fit the viewport */}
      <section className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_20rem]">
        <LaneColumn
          title="Agente base"
          subtitle="nessuna memoria · ripaga tutto il contesto"
          turns={baseWindow}
          lane="base"
          recallActive={recallActive}
          speakingTurn={speakingTurn}
          clipProgress={clipProgress}
        />
        <LaneColumn
          title="Suggeritore"
          subtitle="stesso prompt e voce · memoria attiva"
          turns={suggeritoreWindow}
          lane="suggeritore"
          recallActive={recallActive}
          speakingTurn={speakingTurn}
          clipProgress={clipProgress}
        />
        <MemoryRail
          state={state}
          currentSeconds={currentSeconds}
          turnTimes={turnTimes}
          recallActive={recallActive}
        />
      </section>

      <VerdictBar
        verdicts={verdicts}
        recallActive={recallActive}
        onOpenProof={() => setShowProof(true)}
      />

      {showProof ? (
        <ProofOverlay verdicts={verdicts} onClose={() => setShowProof(false)} />
      ) : null}
    </main>
  );
}
