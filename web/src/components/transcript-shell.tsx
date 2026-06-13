"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckIcon,
  PauseIcon,
  PlayIcon,
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

type TranscriptShellProps = {
  baseTurns: DisplayTurn[];
  cost: CostFixture;
  suggeritoreTurns: DisplayTurn[];
  state: StateLedger;
  verdicts: VerdictsFixture;
};

// Replay pacing. The clock auto-HOLDS while a real nonna clip plays, so the
// voice and the transcript advance together on the spoken lines (audio effect).
const REPLAY_RATE = 12;
const FRAME_MS = 100;
// how many recent turns stay on the projector at once — a moving window, not the
// whole 9-minute scroll, so the divergence at t41 reads from the back of the room
const WINDOW = 6;
// caller turns that have a real recorded clip in /public/audio (see AGENTS.md)
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
  const sugEvent = latestCostEvent(
    cost.events,
    "suggeritore",
    currentSeconds,
    turnTimes
  );
  const baseValue = baseEvent?.usd_cumulative ?? 0;
  const sugValue = sugEvent?.usd_cumulative ?? 0;
  const baseFill = cost.final.base ? (baseValue / cost.final.base) * 100 : 0;
  const sugFill = cost.final.suggeritore
    ? (sugValue / cost.final.suggeritore) * 100
    : 0;
  const live =
    baseValue > 0 && sugValue > 0 ? (baseValue / sugValue).toFixed(1) : null;

  return (
    <div className="flex items-stretch gap-5 rounded-xl border border-white/10 bg-[color:var(--surface-soft)]/70 px-5 py-2.5">
      <div className="flex min-w-[8.5rem] flex-col justify-center gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[0.68rem] uppercase tracking-wider text-muted-foreground">
            base
          </span>
          <span className="font-mono text-lg font-semibold tabular-nums text-[color:var(--fail)]">
            {formatUsd(baseValue)}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-[color:var(--fail)] transition-[width] duration-200"
            style={{ width: `${Math.min(100, baseFill)}%` }}
          />
        </div>
        <span className="text-[0.64rem] text-muted-foreground">
          ripaga tutto l&apos;audio, ogni turno
        </span>
      </div>

      <Separator orientation="vertical" className="h-auto" />

      <div className="flex min-w-[8.5rem] flex-col justify-center gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[0.68rem] uppercase tracking-wider text-muted-foreground">
            suggeritore
          </span>
          <span className="font-mono text-lg font-semibold tabular-nums text-[color:var(--voice-accent)]">
            {formatUsd(sugValue)}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-[color:var(--voice-accent)] transition-[width] duration-200"
            style={{ width: `${Math.min(100, sugFill)}%` }}
          />
        </div>
        <span className="text-[0.64rem] text-muted-foreground">
          manda solo lo stato compatto
        </span>
      </div>

      <Separator orientation="vertical" className="h-auto" />

      <div className="flex flex-col items-center justify-center px-1">
        <span
          className={cn(
            "font-mono font-semibold leading-none tabular-nums transition-all",
            recallActive
              ? "text-3xl text-[color:var(--fail)]"
              : "text-xl text-muted-foreground"
          )}
        >
          {live ? `${live}×` : "—"}
        </span>
        <span className="mt-1 text-[0.6rem] uppercase tracking-wide text-muted-foreground">
          più caro
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- replay bar */

function ReplayBar({
  currentSeconds,
  duration,
  isPlaying,
  muted,
  markers,
  onPlayToggle,
  onSeek,
  onJumpToRecall,
  onToggleMute,
}: {
  currentSeconds: number;
  duration: number;
  isPlaying: boolean;
  muted: boolean;
  markers: { label: string; seconds: number; recall?: boolean }[];
  onPlayToggle: () => void;
  onSeek: (value: number) => void;
  onJumpToRecall: () => void;
  onToggleMute: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-[color:var(--surface-soft)]/60 px-5 py-3.5">
      <div className="flex items-center gap-3">
        <Button
          size="lg"
          onClick={onJumpToRecall}
          className="bg-[color:var(--recall)] font-semibold text-black hover:bg-[color:var(--recall)]/90"
        >
          <SkipForwardIcon data-icon="inline-start" />
          Vai al momento del recall
        </Button>
        <Button variant="outline" size="lg" onClick={onPlayToggle}>
          {isPlaying ? (
            <PauseIcon data-icon="inline-start" />
          ) : (
            <PlayIcon data-icon="inline-start" />
          )}
          {isPlaying ? "Pausa" : "Riproduci dall'inizio"}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleMute}
          aria-label={muted ? "Riattiva la voce" : "Disattiva la voce"}
        >
          {muted ? <VolumeXIcon /> : <Volume2Icon />}
        </Button>
        <div className="ml-auto font-mono text-sm tabular-nums text-muted-foreground">
          <span className="text-foreground">{formatTimestamp(currentSeconds)}</span>
          {" / "}
          {formatTimestamp(duration)}
        </div>
      </div>

      <div className="relative pb-5 pt-1">
        <Slider
          value={[currentSeconds]}
          min={0}
          max={duration}
          step={1}
          onValueChange={(value) =>
            onSeek(Array.isArray(value) ? value[0] ?? 0 : value)
          }
          aria-label="Timeline della chiamata"
        />
        {markers.map((marker) => {
          const left = duration ? (marker.seconds / duration) * 100 : 0;
          return (
            <div
              key={marker.label}
              className="pointer-events-none absolute top-1 flex -translate-x-1/2 flex-col items-center"
              style={{ left: `${left}%` }}
            >
              <span
                className={cn(
                  "h-2.5 w-0.5 rounded-full",
                  marker.recall ? "bg-[color:var(--recall)]" : "bg-white/30"
                )}
              />
              <span
                className={cn(
                  "mt-1 whitespace-nowrap text-[0.6rem]",
                  marker.recall
                    ? "font-medium text-[color:var(--recall)]"
                    : "text-muted-foreground"
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

function LaneColumn({
  title,
  subtitle,
  turns,
  lane,
  recallActive,
}: {
  title: string;
  subtitle: string;
  turns: DisplayTurn[];
  lane: "base" | "suggeritore";
  recallActive: boolean;
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
        "flex flex-col overflow-hidden rounded-xl border bg-[color:var(--surface-strong)]/60 transition-colors",
        recallActive && isSug && "border-[color:var(--recall)]/60",
        recallActive && !isSug && "border-[color:var(--fail)]/50",
        !recallActive && "border-white/10"
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3.5">
        <div className="flex flex-col">
          <h2 className="text-lg font-semibold leading-tight">{title}</h2>
          <p className="text-[0.78rem] text-muted-foreground">{subtitle}</p>
        </div>
        <span
          className={cn(
            "rounded-md px-2.5 py-1 font-mono text-[0.68rem] uppercase tracking-wide",
            recallActive &&
              isSug &&
              "bg-[color:var(--recall)]/15 text-[color:var(--recall)]",
            recallActive &&
              !isSug &&
              "bg-[color:var(--fail)]/15 text-[color:var(--fail)]",
            !recallActive &&
              isSug &&
              "bg-[color:var(--voice-accent)]/15 text-[color:var(--voice-accent)]",
            !recallActive && !isSug && "bg-white/5 text-muted-foreground"
          )}
        >
          {stateLabel}
        </span>
      </header>

      <div className="h-[52vh] overflow-y-auto px-5 py-5">
        {turns.length === 0 ? (
          <div className="flex h-full min-h-40 items-center justify-center text-center text-sm text-muted-foreground">
            Premi play per avviare la chiamata.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {turns.map((turn) => {
              const isCaller = turn.role === "caller";
              const isDivergent = recallActive && turn.displayTurn === "t41";
              const isWin = isDivergent && isSug;
              const isFail = isDivergent && !isSug;

              return (
                <div
                  key={`${lane}-${turn.turn}`}
                  className={cn(
                    "flex flex-col gap-1.5",
                    isCaller ? "items-end" : "items-start"
                  )}
                >
                  <div
                    className={cn(
                      "flex items-center gap-2 font-mono text-[0.66rem] text-muted-foreground",
                      isCaller && "flex-row-reverse"
                    )}
                  >
                    <span className={cn(isCaller && "text-[color:var(--voice-accent)]")}>
                      {isCaller ? "Nonna" : "Agente"}
                    </span>
                    <span>·</span>
                    <span>{turn.ts}</span>
                    <span className="opacity-60">[{turn.displayTurn}]</span>
                  </div>

                  <div
                    className={cn(
                      "max-w-[94%] rounded-xl px-4 py-3 text-[0.95rem] leading-7 transition-all",
                      isCaller && "bg-secondary text-foreground",
                      !isCaller &&
                        "border border-white/10 bg-[color:var(--surface-soft)] text-foreground",
                      isFail &&
                        "border-[color:var(--fail)] bg-[color:var(--fail)]/12 text-foreground shadow-[0_0_30px_color-mix(in_oklch,var(--fail),transparent_80%)]",
                      isWin &&
                        "border border-[color:var(--recall)] bg-[color:var(--recall)] font-medium text-black shadow-[0_0_48px_var(--recall-glow)]"
                    )}
                  >
                    {turn.text}
                  </div>

                  {isFail ? (
                    <span className="flex items-center gap-1.5 font-mono text-[0.72rem] text-[color:var(--fail)]">
                      <XIcon className="size-3.5" /> chiede di nuovo tutto da capo
                    </span>
                  ) : null}
                  {isWin ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1.5 font-mono text-[0.72rem] text-[color:var(--recall)]">
                        <CheckIcon className="size-3.5" /> prova
                      </span>
                      <span className="rounded bg-[color:var(--recall)]/15 px-1.5 py-0.5 font-mono text-[0.66rem] text-[color:var(--recall)]">
                        [t5] scadenza
                      </span>
                      <span className="rounded bg-[color:var(--recall)]/15 px-1.5 py-0.5 font-mono text-[0.66rem] text-[color:var(--recall)]">
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

function MemoryItem({
  entry,
  recalled,
}: {
  entry: StateLedgerEntry;
  recalled: boolean;
}) {
  return (
    <div
      className={cn(
        "animate-in fade-in slide-in-from-bottom-1 flex items-start gap-3 rounded-lg border px-3 py-2.5 duration-500",
        recalled
          ? "border-[color:var(--recall)]/60 bg-[color:var(--recall)]/10"
          : "border-white/10 bg-[color:var(--surface-soft)]"
      )}
    >
      <CheckIcon
        className={cn(
          "mt-0.5 size-3.5 shrink-0",
          recalled
            ? "text-[color:var(--recall)]"
            : "text-[color:var(--voice-accent)]"
        )}
      />
      <p className="flex-1 text-[0.84rem] leading-6 text-foreground">{entry.text}</p>
      <span
        className={cn(
          "mt-0.5 shrink-0 font-mono text-[0.64rem]",
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
    <aside className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-[color:var(--surface-strong)]/60">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3.5">
        <div className="flex flex-col">
          <h2 className="text-lg font-semibold leading-tight text-[color:var(--voice-accent)]">
            Memoria viva
          </h2>
          <p className="text-[0.78rem] text-muted-foreground">si scrive da sola</p>
        </div>
        <span className="rounded-md bg-[color:var(--voice-accent)]/15 px-2.5 py-1 font-mono text-[0.68rem] text-[color:var(--voice-accent)]">
          {revealed}/{total}
        </span>
      </header>

      <div className="h-[52vh] space-y-5 overflow-y-auto px-5 py-5">
        {recallActive ? (
          <div className="animate-in fade-in slide-in-from-bottom-1 rounded-lg border border-[color:var(--recall)] bg-[color:var(--recall)]/10 px-4 py-3 shadow-[0_0_30px_var(--recall-glow)] duration-500">
            <p className="font-mono text-[0.68rem] uppercase tracking-wide text-[color:var(--recall)]">
              prova del recall · t41
            </p>
            <p className="mt-1 text-[0.84rem] leading-6 text-foreground">
              Il Suggeritore ha citato scadenza e consegna direttamente dalla
              memoria.
            </p>
          </div>
        ) : null}

        <div>
          <p className="mb-2 text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
            Chi è
          </p>
          <p className="rounded-lg border border-[color:var(--voice-accent)]/25 bg-[color:var(--voice-accent)]/10 px-3 py-2.5 text-[0.84rem] leading-6">
            {state.identity}
          </p>
        </div>

        <div>
          <p className="mb-2 text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
            Cosa vuole
          </p>
          <p className="rounded-lg border border-white/10 bg-[color:var(--surface-soft)] px-3 py-2.5 text-[0.84rem] leading-6">
            {state.objective}
          </p>
        </div>

        <Separator />

        <div>
          <p className="mb-2 text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
            Cosa ho ricordato
          </p>
          <div className="flex flex-col gap-2">
            {visibleFacts.length === 0 ? (
              <p className="rounded-lg border border-dashed border-white/10 px-3 py-3 text-center text-[0.78rem] text-muted-foreground">
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
          <p className="mb-2 text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
            Cosa ho promesso
          </p>
          <div className="flex flex-col gap-2">
            {visibleCommitments.length === 0 ? (
              <p className="rounded-lg border border-dashed border-white/10 px-3 py-3 text-center text-[0.78rem] text-muted-foreground">
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
  const recallStart = useMemo(
    () => secondsForTurn(baseTurns, "t38") ?? 596,
    [baseTurns]
  );
  const recallEnd = useMemo(
    () => secondsForTurn(baseTurns, "t41") ?? 614,
    [baseTurns]
  );
  const turnTimes = useMemo(
    () =>
      new Map(baseTurns.map((turn) => [turn.displayTurn, parseTimestamp(turn.ts)])),
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
  const recallToastFiredRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevSecondsRef = useRef(0);
  const holdRef = useRef(false); // true while a nonna clip is speaking — pauses the clock

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

  // auto-advance the replay clock — but never while a clip is speaking (holdRef)
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

  // Play the real nonna voice on forward crossings, and HOLD the clock until the
  // clip ends so the voice and the transcript stay in lockstep (forward only,
  // never on load — only after the user presses Play / Vai al recall).
  useEffect(() => {
    const prev = prevSecondsRef.current;
    prevSecondsRef.current = currentSeconds;
    if (currentSeconds < prev) {
      holdRef.current = false; // seeking back releases any hold
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
    };
    el.onended = release;
    el.onerror = release;
    el.src = `/audio/${turn}.mp3`;
    el.currentTime = 0;
    el.volume = 1;
    holdRef.current = true;
    void el.play().catch(() => {
      holdRef.current = false;
    });
  }, [currentSeconds, muted, audioTurns]);

  const handleSeek = (value: number) => {
    holdRef.current = false;
    setCurrentSeconds(Math.min(duration, Math.max(0, value)));
  };

  const handleJumpToRecall = () => {
    holdRef.current = false;
    // land just before t38 so the jump counts as a forward crossing of the
    // recall question every time (replayable across rehearsal run-throughs),
    // and only t38 fires — never the earlier clips.
    prevSecondsRef.current = recallStart - 0.5;
    setCurrentSeconds(recallStart);
    setIsPlaying(true);
  };

  return (
    <main className="flex min-h-screen flex-col gap-5 p-6 lg:p-8">
      <audio ref={audioRef} preload="auto" aria-hidden="true" />

      {/* top strip — wordmark + demoted cost pressure meter */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-sm font-semibold uppercase tracking-[0.2em] text-foreground">
            Il Suggeritore
          </span>
          <span className="font-mono text-[0.72rem] text-muted-foreground">
            HackRome · 13 giu 2026
          </span>
        </div>
        <PressureMeter
          cost={cost}
          currentSeconds={currentSeconds}
          turnTimes={turnTimes}
          recallActive={recallActive}
        />
      </div>

      {/* operative title — the drama, stated */}
      <header className="flex flex-col gap-1.5">
        <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground lg:text-4xl">
          La stessa chiamata. Uno dimentica, uno ricorda.
        </h1>
        <p className="text-base text-muted-foreground">
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
        markers={markers}
        onPlayToggle={() => setIsPlaying((playing) => !playing)}
        onSeek={handleSeek}
        onJumpToRecall={handleJumpToRecall}
        onToggleMute={() => setMuted((value) => !value)}
      />

      {/* stage — the three panels are the hero */}
      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_21rem]">
        <LaneColumn
          title="Agente base"
          subtitle="nessuna memoria · ripaga tutto il contesto"
          turns={baseWindow}
          lane="base"
          recallActive={recallActive}
        />
        <LaneColumn
          title="Suggeritore"
          subtitle="stesso prompt e voce · memoria attiva"
          turns={suggeritoreWindow}
          lane="suggeritore"
          recallActive={recallActive}
        />
        <MemoryRail
          state={state}
          currentSeconds={currentSeconds}
          turnTimes={turnTimes}
          recallActive={recallActive}
        />
      </section>

      <p className="text-center font-mono text-[0.66rem] text-muted-foreground/70">
        stima costi modellata sul pricing OpenAI Realtime · il numero del recall è
        reale (run 13:30 · base 0/10 · suggeritore 10/10)
      </p>

      {/* the payoff — il numero del judge */}
      <VerdictView verdicts={verdicts} />
    </main>
  );
}
