"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  SkipForwardIcon,
  TrendingUpIcon,
  Volume2Icon,
  VolumeXIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import type {
  CostEvent,
  CostFixture,
  DisplayTurn,
  LongCallFixture,
  StateLedger,
  StateLedgerEntry,
  VerdictsFixture,
} from "@/lib/contracts";
import { VerdictView } from "@/components/verdict-view";
import { LongCallView } from "@/components/long-call-view";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

/*
 * DESIGN SYSTEM — "evidence board", light premium editorial (defined, not vibe).
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
  longCall: LongCallFixture;
  suggeritoreTurns: DisplayTurn[];
  state: StateLedger;
  verdicts: VerdictsFixture;
};

const REPLAY_RATE = 12;
const FRAME_MS = 100;
const WINDOW = 6;
// caller turns = real nonna recordings; agent turns (t6/t10/t39/t41) = ElevenLabs
// "Aurora" Italian voice → call-and-response on deadline / delivery / memory test.
// CUT for a punchy demo: opening seeds 3 facts with voice (t1 watch · t5 deadline
// · t9 delivery) + one agent reply (t6), then the finale (t38→t41). Drop t7/t10.
// HEARD: the opening (t1) + the whole recall finale. Everything else is muted —
// the team's voice-over runs over the middle.
const AUDIO_TURNS = ["t1", "t38", "t39", "t40", "t41"];
// MUTED but visually highlighted: the two seeded facts the recall depends on.
const HIGHLIGHT_TURNS = ["t5", "t9"];
// finale clips play at natural speed (the climax); the opening (t1) is sped up.
const FINALE_TURNS = ["t38", "t39", "t40", "t41"];
const SEED_RATE = 1.4;

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
        cost · measured
      </span>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[0.66rem] uppercase tracking-wide text-muted-foreground">base</span>
        <span className="font-mono text-base font-semibold tabular-nums text-[color:var(--fail)]">
          {formatUsd(baseValue)}
        </span>
      </div>
      <Separator orientation="vertical" className="h-5" />
      <div className="flex items-baseline gap-1.5">
        <span className="text-[0.66rem] uppercase tracking-wide text-muted-foreground">whisp.</span>
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
  speakerLabel,
  phase,
  percent,
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
  speakerLabel: string;
  phase: string;
  percent: number;
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
          Jump to recall
        </Button>
        <Button variant="outline" size="sm" className="h-9" onClick={onRestart}>
          <RotateCcwIcon data-icon="inline-start" />
          From the start
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-9"
          onClick={onPlayPause}
          aria-label={isPlaying ? "Pause" : "Resume"}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-9"
          onClick={onToggleMute}
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? <VolumeXIcon /> : <Volume2Icon />}
        </Button>

        <div className="ml-auto flex items-center gap-3">
          {speaking ? (
            <span className="flex items-center gap-1.5 font-mono text-sm text-[color:var(--voice-accent)]">
              <span className="size-2 animate-pulse rounded-full bg-[color:var(--voice-accent)]" />
              {speakerLabel} is speaking…
            </span>
          ) : (
            <span className="rounded-md bg-[color:var(--surface-soft)] px-2.5 py-1 font-mono text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
              {phase}
            </span>
          )}
          <span className="font-mono text-xl font-bold tabular-nums text-foreground">
            {percent}%
          </span>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {formatTimestamp(currentSeconds)} / {formatTimestamp(duration)}
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
          aria-label="Call timeline"
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

// Live caption: reveal the spoken line word-by-word in sync with the audio.
// Upcoming words are NOT shown (no preview) — only what's already been said,
// followed by a blinking caret. The bubble grows as the voice speaks.
function KaraokeText({ text, progress }: { text: string; progress: number }) {
  const tokens = text.split(" ");
  const reveal =
    progress <= 0 ? 0 : Math.max(1, Math.round(progress * tokens.length));
  const shown = tokens.slice(0, reveal).join(" ");
  const done = reveal >= tokens.length;
  return (
    <>
      {shown}
      {!done ? (
        <span
          aria-hidden="true"
          className="ml-0.5 inline-block h-[0.95em] w-[2px] translate-y-[1px] animate-pulse rounded-full bg-[color:var(--voice-accent)] align-middle"
        />
      ) : null}
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
  highlightTurn,
  clipProgress,
}: {
  title: string;
  subtitle: string;
  turns: DisplayTurn[];
  lane: "base" | "suggeritore";
  recallActive: boolean;
  speakingTurn: string | null;
  highlightTurn: string | null;
  clipProgress: number;
}) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turns.length, recallActive]);

  const isSug = lane === "suggeritore";
  const stateLabel = recallActive
    ? isSug
      ? "REMEMBERS"
      : "FORGETS"
    : isSug
      ? "memory on"
      : "no memory";

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
            Press play to start the call.
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {turns.map((turn) => {
              const isCaller = turn.role === "caller";
              const isDivergent = recallActive && turn.displayTurn === "t41";
              const isWin = isDivergent && isSug;
              const isFail = isDivergent && !isSug;
              // the t41 clip is the suggeritore WIN line — only that lane karaokes
              // it; the base lane shows its FAIL text in full.
              const isSpeaking =
                speakingTurn === turn.displayTurn &&
                !(turn.displayTurn === "t41" && lane === "base");
              const isHighlight = highlightTurn === turn.displayTurn;
              const emphasized = isSpeaking || isHighlight;

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
                      {isCaller ? "Grandmother" : "Agent"}
                    </span>
                    <span>·</span>
                    <span>{turn.ts}</span>
                    <span className="opacity-60">[{turn.displayTurn}]</span>
                    {emphasized ? (
                      <span className="size-1.5 animate-pulse rounded-full bg-[color:var(--voice-accent)]" />
                    ) : null}
                  </div>

                  <div
                    className={cn(
                      "max-w-[95%] rounded-lg px-3 py-2 text-[0.95rem] leading-6 transition-all",
                      isCaller && "bg-secondary text-foreground",
                      !isCaller &&
                        "border border-black/10 bg-[color:var(--surface-soft)] text-foreground",
                      emphasized &&
                        "border-[color:var(--voice-accent)]/45 text-[1.06rem] font-medium ring-1 ring-[color:var(--voice-accent)]/35 shadow-sm",
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
                      <XIcon className="size-3" /> asks for everything all over again
                    </span>
                  ) : null}
                  {isWin ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="flex items-center gap-1 font-mono text-[0.68rem] text-[color:var(--recall)]">
                        <CheckIcon className="size-3" /> proof
                      </span>
                      <span className="rounded bg-[color:var(--recall)]/15 px-1.5 py-0.5 font-mono text-[0.7rem] text-[color:var(--recall)]">
                        [t5] deadline
                      </span>
                      <span className="rounded bg-[color:var(--recall)]/15 px-1.5 py-0.5 font-mono text-[0.7rem] text-[color:var(--recall)]">
                        [t9] delivery
                      </span>
                    </div>
                  ) : null}
                  {isHighlight ? (
                    <span className="flex items-center gap-1 font-mono text-[0.68rem] text-[color:var(--voice-accent)]">
                      <CheckIcon className="size-3" /> saved to memory
                    </span>
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
            Live memory
          </h2>
          <p className="text-[0.72rem] text-muted-foreground">writes itself</p>
        </div>
        <span className="rounded bg-[color:var(--voice-accent)]/15 px-2 py-0.5 font-mono text-[0.64rem] text-[color:var(--voice-accent)]">
          {revealed}/{total}
        </span>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {recallActive ? (
          <div className="animate-in fade-in slide-in-from-bottom-1 rounded-md border border-[color:var(--recall)] bg-[color:var(--recall)]/10 px-3 py-2 shadow-[0_0_24px_var(--recall-glow)] duration-500">
            <p className="font-mono text-[0.62rem] uppercase tracking-wide text-[color:var(--recall)]">
              recall proof · t41
            </p>
            <p className="mt-0.5 text-[0.78rem] leading-5 text-foreground">
              Whisperer cites the deadline and delivery from memory.
            </p>
          </div>
        ) : null}

        <div>
          <p className="mb-1.5 text-[0.72rem] font-medium uppercase tracking-wider text-muted-foreground">
            Who it is
          </p>
          <p className="rounded-md border border-[color:var(--voice-accent)]/25 bg-[color:var(--voice-accent)]/10 px-2.5 py-2 text-[0.78rem] leading-5">
            {state.identity}
          </p>
        </div>

        <div>
          <p className="mb-1.5 text-[0.72rem] font-medium uppercase tracking-wider text-muted-foreground">
            What it wants
          </p>
          <p className="rounded-md border border-black/10 bg-[color:var(--surface-soft)] px-2.5 py-2 text-[0.78rem] leading-5">
            {state.objective}
          </p>
        </div>

        <Separator />

        <div>
          <p className="mb-1.5 text-[0.72rem] font-medium uppercase tracking-wider text-muted-foreground">
            What I remembered
          </p>
          <div className="flex flex-col gap-1.5">
            {visibleFacts.length === 0 ? (
              <p className="rounded-md border border-dashed border-black/10 px-2.5 py-2 text-center text-[0.74rem] text-muted-foreground">
                listening…
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
            What I promised
          </p>
          <div className="flex flex-col gap-1.5">
            {visibleCommitments.length === 0 ? (
              <p className="rounded-md border border-dashed border-black/10 px-2.5 py-2 text-center text-[0.74rem] text-muted-foreground">
                no commitments yet
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
        <span className="font-mono text-[0.66rem] uppercase tracking-wider">verdict</span>
        <span>The judge scores memory at the end of the call — N=10 runs per side</span>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 flex shrink-0 flex-wrap items-center justify-between gap-4 rounded-xl border border-[color:var(--recall)]/50 bg-[color:var(--card)] px-5 py-2.5 shadow-[0_12px_40px_-10px_var(--recall-glow)] duration-500">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
        <span className="font-mono text-[0.66rem] uppercase tracking-wider text-[color:var(--recall)]">
          the verdict · run-1330 · measured
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
        The proofs · {verdicts.runs.base.length + verdicts.runs.suggeritore.length} runs
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
          aria-label="Close the proofs"
        >
          <XIcon />
        </Button>
        <VerdictView verdicts={verdicts} />
      </div>
    </div>
  );
}

function LongCallOverlay({
  longCall,
  onClose,
}: {
  longCall: LongCallFixture;
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
        className="relative max-h-[88vh] w-full max-w-4xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-3 top-3 z-10 size-9"
          onClick={onClose}
          aria-label="Close the long call"
        >
          <XIcon />
        </Button>
        <LongCallView longCall={longCall} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ shell */

export function TranscriptShell({
  baseTurns,
  cost,
  longCall,
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
  // from delivery (t9) to the memory test (t38) there is no voice — fast-forward
  // it at 2× so the replay reaches the recall quickly.
  const consegnaSeconds = useMemo(() => secondsForTurn(baseTurns, "t9") ?? 168, [baseTurns]);
  const turnTimes = useMemo(
    () => new Map(baseTurns.map((turn) => [turn.displayTurn, parseTimestamp(turn.ts)])),
    [baseTurns]
  );

  const markers = useMemo(() => {
    const out: { label: string; seconds: number; recall?: boolean }[] = [];
    const scadenza = secondsForTurn(baseTurns, "t5");
    const consegna = secondsForTurn(baseTurns, "t9");
    if (scadenza != null) out.push({ label: "deadline", seconds: scadenza });
    if (consegna != null) out.push({ label: "delivery", seconds: consegna });
    out.push({ label: "memory test", seconds: recallStart, recall: true });
    return out;
  }, [baseTurns, recallStart]);

  // beats = audible turns + muted-highlight turns (t5/t9), sorted by time
  const beatTurns = useMemo(
    () =>
      [...AUDIO_TURNS, ...HIGHLIGHT_TURNS]
        .map((id) => [id, turnTimes.get(id)] as const)
        .filter((pair): pair is [string, number] => typeof pair[1] === "number")
        .sort((a, b) => a[1] - b[1]),
    [turnTimes]
  );
  const audioSet = useMemo(() => new Set(AUDIO_TURNS), []);

  const [currentSeconds, setCurrentSeconds] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speakingTurn, setSpeakingTurn] = useState<string | null>(null);
  // a muted-but-highlighted turn (t5/t9) — emphasized on screen, no audio
  const [highlightTurn, setHighlightTurn] = useState<string | null>(null);
  // 0→1 progress of the clip currently being spoken, drives the karaoke reveal
  const [clipProgress, setClipProgress] = useState(0);
  const [showProof, setShowProof] = useState(false);
  const [showLongCall, setShowLongCall] = useState(false);
  const recallToastFiredRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevSecondsRef = useRef(0);
  const holdRef = useRef(false);
  const currentSecondsRef = useRef(0);
  // curated "≈9 minutes later — the memory held" beat that skips the small talk
  const [interlude, setInterlude] = useState(false);
  const interludeActiveRef = useRef(false);
  const interludeDoneRef = useRef(false);

  // opening ends right after the delivery fact (t9) — then the interlude skips
  // the small talk straight to the recall.
  const seedEndSeconds = useMemo(
    () => secondsForTurn(baseTurns, "t9") ?? consegnaSeconds,
    [baseTurns, consegnaSeconds]
  );

  const recallActive = currentSeconds >= recallEnd;
  const speakerLabel = useMemo(() => {
    if (!speakingTurn) return "";
    const t = allTurns.find((x) => x.displayTurn === speakingTurn);
    return t?.role === "agent" ? "Agent" : "Grandmother";
  }, [speakingTurn, allTurns]);

  // warm the first clip so the opening voice starts with no cold-start delay
  useEffect(() => {
    const el = audioRef.current;
    if (el && !el.getAttribute("src")) {
      el.src = "/audio/t1.mp3";
      el.load();
    }
  }, []);

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

  useEffect(() => {
    currentSecondsRef.current = currentSeconds;
  }, [currentSeconds]);

  // auto-advance — frozen while a clip speaks (holdRef) or during the interlude.
  // Curated 3 acts: once the facts are seeded (past t10), skip the ~9 minutes of
  // small talk with a brief "the memory held" interlude, then jump to the recall.
  useEffect(() => {
    if (!isPlaying) return;
    const id = window.setInterval(() => {
      if (holdRef.current || interludeActiveRef.current) return;
      const cs = currentSecondsRef.current;
      if (!interludeDoneRef.current && cs >= seedEndSeconds && cs < recallStart) {
        interludeDoneRef.current = true;
        interludeActiveRef.current = true;
        setInterlude(true);
        window.setTimeout(() => {
          interludeActiveRef.current = false;
          setInterlude(false);
          prevSecondsRef.current = recallStart - 0.5;
          setCurrentSeconds(recallStart);
        }, 2800);
        return;
      }
      setCurrentSeconds((seconds) => {
        const next = Math.min(duration, seconds + REPLAY_RATE * (FRAME_MS / 1000));
        if (next >= duration) window.setTimeout(() => setIsPlaying(false), 0);
        return next;
      });
    }, FRAME_MS);
    return () => window.clearInterval(id);
  }, [duration, isPlaying, seedEndSeconds, recallStart]);

  // recall payoff toast
  useEffect(() => {
    if (currentSeconds < recallEnd) {
      recallToastFiredRef.current = false;
      return;
    }
    if (recallToastFiredRef.current) return;
    recallToastFiredRef.current = true;
    toast("Remembers ✓", {
      duration: 2600,
      className:
        "border-[color:var(--recall)] bg-[color:var(--surface-strong)] text-[color:var(--recall)] shadow-[0_0_44px_var(--recall-glow)]",
    });
  }, [currentSeconds, recallEnd]);

  // on a forward crossing: an AUDIO turn plays + holds; a HIGHLIGHT turn (t5/t9)
  // is emphasized for a beat with NO sound (the team's voice-over talks over it).
  useEffect(() => {
    const prev = prevSecondsRef.current;
    prevSecondsRef.current = currentSeconds;
    if (currentSeconds < prev) {
      holdRef.current = false;
      return;
    }
    if (currentSeconds <= prev) return;
    const crossed = beatTurns.filter(([, sec]) => sec > prev && sec <= currentSeconds);
    if (crossed.length === 0) return;
    const [turn] = crossed[crossed.length - 1];

    if (!audioSet.has(turn)) {
      // muted highlight (deadline / delivery): emphasize ~1.6s, no audio
      holdRef.current = true;
      setHighlightTurn(turn);
      window.setTimeout(() => {
        holdRef.current = false;
        setHighlightTurn(null);
      }, 1600);
      return;
    }
    if (muted) return; // global mute → audio turn makes no sound, clock continues
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
    el.preservesPitch = true;
    el.playbackRate = FINALE_TURNS.includes(turn) ? 1 : SEED_RATE;
    holdRef.current = true;
    setClipProgress(0);
    setSpeakingTurn(turn);
    void el.play().catch(release);
  }, [currentSeconds, muted, beatTurns, audioSet]);

  // karaoke clock — reveal the spoken line in sync with the real audio position.
  // Driven by the audio element's currentTime so it freezes exactly on pause and
  // resumes from the same word. Quantized to 1% to avoid 60fps re-renders.
  useEffect(() => {
    if (speakingTurn == null) return;
    // tracks the audio's real currentTime — frozen automatically when the clip is
    // paused, and keeps running even after the clock reaches the end (the t41 win
    // clip plays out as the timeline finishes).
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
  }, [speakingTurn]);

  const stopClip = useCallback(() => {
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
    holdRef.current = false;
    interludeActiveRef.current = false;
    setSpeakingTurn(null);
    setHighlightTurn(null);
    setClipProgress(0);
    setInterlude(false);
  }, []);

  const handleSeek = (value: number) => {
    stopClip();
    const v = Math.min(duration, Math.max(0, value));
    interludeDoneRef.current = v >= seedEndSeconds; // re-arm only if scrubbed before the seed end
    setCurrentSeconds(v);
  };

  const handleRestart = () => {
    stopClip();
    interludeDoneRef.current = false; // replay the curated interlude
    // jump to just before the first spoken line so the voice + first bubble land
    // in ~0.1s instead of after a long silent lead-in.
    prevSecondsRef.current = firstTs - 0.2;
    setCurrentSeconds(Math.max(0, firstTs - 0.05));
    setIsPlaying(true);
  };

  const handleJumpToRecall = () => {
    stopClip();
    interludeDoneRef.current = true; // jumping straight to the finale, skip the interlude
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
            Whisperer
          </span>
          <span className="font-mono text-[0.7rem] text-muted-foreground">HackRome · 13 Jun 2026</span>
        </div>
        <div className="flex items-center gap-2.5">
          <PressureMeter
            cost={cost}
            currentSeconds={currentSeconds}
            turnTimes={turnTimes}
            recallActive={recallActive}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-auto shrink-0 flex-col items-start gap-0 px-3 py-1 leading-tight"
            onClick={() => setShowLongCall(true)}
          >
            <span className="flex items-center gap-1.5 font-mono text-[0.6rem] uppercase tracking-wider text-muted-foreground">
              <TrendingUpIcon className="size-3" /> long call
            </span>
            <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
              {longCall.callTurns} turn ·{" "}
              <span className="text-[color:var(--fail)]">{longCall.headline.ratio}×</span>
            </span>
          </Button>
        </div>
      </div>

      {/* operative title */}
      <header className="flex shrink-0 flex-col">
        <h1 className="text-2xl font-semibold leading-tight tracking-tight text-foreground lg:text-3xl">
          The same call. One forgets, one remembers.
        </h1>
        <p className="text-sm text-muted-foreground">
          {recallActive
            ? "At 10:14 the base asks for everything again. Whisperer confirms — with proof."
            : "Same prompt, same voice. The only difference is the memory layer."}
        </p>
      </header>

      <ReplayBar
        currentSeconds={currentSeconds}
        duration={duration}
        isPlaying={isPlaying}
        muted={muted}
        speaking={speakingTurn != null && isPlaying}
        speakerLabel={speakerLabel}
        phase={
          interlude
            ? "memory holds"
            : currentSeconds >= recallEnd
              ? "recall ✓"
              : currentSeconds >= recallStart
                ? "recall"
                : "the facts"
        }
        percent={duration ? Math.round((currentSeconds / duration) * 100) : 0}
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
          title="Base agent"
          subtitle="no memory · re-pays the whole context"
          turns={baseWindow}
          lane="base"
          recallActive={recallActive}
          speakingTurn={speakingTurn}
          highlightTurn={highlightTurn}
          clipProgress={clipProgress}
        />
        <LaneColumn
          title="Whisperer"
          subtitle="same prompt and voice · memory on"
          turns={suggeritoreWindow}
          lane="suggeritore"
          recallActive={recallActive}
          speakingTurn={speakingTurn}
          highlightTurn={highlightTurn}
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

      {interlude ? (
        <div className="animate-in fade-in fixed inset-0 z-40 grid place-items-center bg-[color:var(--background)]/75 p-6 backdrop-blur-sm duration-300">
          <div className="animate-in zoom-in-95 flex max-w-2xl flex-col items-center gap-3 rounded-2xl border border-black/10 bg-[color:var(--card)] px-10 py-8 text-center shadow-2xl duration-500">
            <span className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">
              the call continues
            </span>
            <p className="text-3xl font-semibold tracking-tight text-foreground">≈ 9 minutes later</p>
            <p className="text-base leading-6 text-muted-foreground">
              The grandmother talks about the weather, the party, her daughter. The base fills up
              with context and loses the thread.
            </p>
            <p className="text-base leading-6 text-foreground">
              <span className="font-semibold text-[color:var(--recall)]">
                Whisperer kept it all:
              </span>{" "}
              watch · graduation · before the 20th · Pina, apt 3.
            </p>
          </div>
        </div>
      ) : null}

      {showProof ? (
        <ProofOverlay verdicts={verdicts} onClose={() => setShowProof(false)} />
      ) : null}

      {showLongCall ? (
        <LongCallOverlay longCall={longCall} onClose={() => setShowLongCall(false)} />
      ) : null}
    </main>
  );
}
