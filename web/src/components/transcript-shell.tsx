"use client";

import { useEffect, useMemo, useState } from "react";
import { PauseIcon, PlayIcon, SkipForwardIcon } from "lucide-react";
import type {
  CostEvent,
  CostFixture,
  DisplayTurn,
  StateLedger,
  StateLedgerEntry,
} from "@/lib/contracts";
import {
  Conversation,
  ConversationContent,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type TranscriptShellProps = {
  baseTurns: DisplayTurn[];
  cost: CostFixture;
  suggeritoreTurns: DisplayTurn[];
  state: StateLedger;
};

type LaneCardProps = {
  title: string;
  description: string;
  turns: DisplayTurn[];
  lane: "base" | "suggeritore";
};

const REPLAY_RATE = 18;
const FRAME_MS = 100;

function roleLabel(role: DisplayTurn["role"]) {
  return role === "caller" ? "Nonna" : "ShopDemo";
}

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

function turnTimestampMap(turns: DisplayTurn[]) {
  return new Map(
    turns.map((turn) => [turn.displayTurn, parseTimestamp(turn.ts)])
  );
}

function isVisibleAt(turn: DisplayTurn, currentSeconds: number) {
  return parseTimestamp(turn.ts) <= currentSeconds;
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
    .sort(
      (a, b) =>
        (turnTimes.get(b.turn) ?? 0) - (turnTimes.get(a.turn) ?? 0)
    )[0];
}

function LaneCard({ title, description, turns, lane }: LaneCardProps) {
  return (
    <Card className="min-h-0 border-white/10 bg-card/90 shadow-2xl shadow-black/30">
      <CardHeader className="border-b border-white/10 pb-5">
        <CardTitle className="text-3xl font-semibold leading-tight">
          {title}
        </CardTitle>
        <CardDescription className="text-base leading-6">
          {description}
        </CardDescription>
        <CardAction>
          <Badge
            variant={lane === "base" ? "destructive" : "outline"}
            className={cn(
              "h-7 rounded-lg px-3 font-mono text-[0.75rem] tracking-normal",
              lane === "suggeritore" &&
                "border-[color:var(--voice-accent)]/60 text-[color:var(--voice-accent)]"
            )}
          >
            {lane === "base" ? "FAIL" : "LAYER ON"}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 px-0 pb-0">
        <ScrollArea className="h-[58vh]">
          <Conversation className="min-h-full">
            <ConversationContent className="gap-6 px-5 py-6">
              {turns.length === 0 ? (
                <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                  <Skeleton className="h-5 w-2/3 rounded-lg" />
                  <p className="text-lg">Press play to start the call.</p>
                </div>
              ) : null}
              {turns.map((turn) => {
                const isCaller = turn.role === "caller";
                const isDivergent = turn.displayTurn === "t41";

                return (
                  <Message
                    key={`${lane}-${turn.turn}`}
                    from={isCaller ? "user" : "assistant"}
                    className={cn(
                      "max-w-[92%]",
                      !isCaller && "mr-auto",
                      isDivergent &&
                        lane === "base" &&
                        "rounded-xl border border-[color:var(--fail)]/60 bg-[color:var(--fail)]/10 p-3",
                      isDivergent &&
                        lane === "suggeritore" &&
                        "rounded-xl border border-[color:var(--voice-accent)]/60 bg-[color:var(--voice-accent)]/10 p-3"
                    )}
                  >
                    <div
                      className={cn(
                        "flex items-center gap-3 font-mono text-xs text-muted-foreground",
                        isCaller && "justify-end"
                      )}
                    >
                      <span>{turn.ts}</span>
                      <span>[{turn.displayTurn}]</span>
                      <span className="text-[color:var(--voice-accent)]">
                        {roleLabel(turn.role)}
                      </span>
                    </div>
                    <MessageContent
                      className={cn(
                        "text-lg leading-8",
                        isCaller
                          ? "rounded-xl bg-secondary px-5 py-4"
                          : "rounded-xl border border-white/10 bg-[color:var(--surface-soft)] px-5 py-4"
                      )}
                    >
                      <MessageResponse>{turn.text}</MessageResponse>
                    </MessageContent>
                  </Message>
                );
              })}
            </ConversationContent>
          </Conversation>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function ReplayControls({
  currentSeconds,
  duration,
  isPlaying,
  recallStart,
  recallEnd,
  onPlayToggle,
  onSeek,
  onJumpToRecall,
}: {
  currentSeconds: number;
  duration: number;
  isPlaying: boolean;
  recallStart: number;
  recallEnd: number;
  onPlayToggle: () => void;
  onSeek: (value: number) => void;
  onJumpToRecall: () => void;
}) {
  const progress = duration === 0 ? 0 : (currentSeconds / duration) * 100;

  return (
    <Card className="border-white/10 bg-card/80">
      <CardHeader className="grid gap-4 pb-4 xl:grid-cols-[1fr_auto] xl:items-center">
        <div className="flex flex-col gap-2">
          <CardTitle className="text-2xl">Replay clock</CardTitle>
          <CardDescription className="font-mono text-base">
            {formatTimestamp(currentSeconds)} / {formatTimestamp(duration)} ·{" "}
            {Math.round(progress)}%
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="lg"
            onClick={onPlayToggle}
            aria-label={isPlaying ? "Pause replay" : "Play replay"}
          >
            {isPlaying ? (
              <PauseIcon data-icon="inline-start" />
            ) : (
              <PlayIcon data-icon="inline-start" />
            )}
            {isPlaying ? "Pause" : "Play"}
          </Button>
          <Button variant="secondary" size="lg" onClick={onJumpToRecall}>
            <SkipForwardIcon data-icon="inline-start" />
            Jump to recall
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Slider
          value={[currentSeconds]}
          min={0}
          max={duration}
          step={1}
          onValueChange={(value) =>
            onSeek(Array.isArray(value) ? (value[0] ?? 0) : value)
          }
          aria-label="Replay timeline"
        />
        <div className="flex items-center justify-between gap-3 font-mono text-xs text-muted-foreground">
          <span>00:00</span>
          <span>
            recall window {formatTimestamp(recallStart)} →{" "}
            {formatTimestamp(recallEnd)}
          </span>
          <span>{formatTimestamp(duration)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function CostReadout({
  event,
  finalValue,
  label,
  tone,
}: {
  event: CostEvent | undefined;
  finalValue: number;
  label: string;
  tone: "runaway" | "steady";
}) {
  const currentValue = event?.usd_cumulative ?? 0;
  const progress = finalValue === 0 ? 0 : (currentValue / finalValue) * 100;

  return (
    <Card
      className={cn(
        "border-white/10 bg-[color:var(--surface-soft)]",
        tone === "runaway" &&
          "border-[color:var(--fail)]/50 shadow-[0_0_36px_color-mix(in_oklch,var(--fail),transparent_78%)]",
        tone === "steady" && "border-[color:var(--voice-accent)]/40"
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="text-xl">{label}</CardTitle>
          <Badge
            variant={tone === "runaway" ? "destructive" : "outline"}
            className={cn(
              "h-7 rounded-lg px-3 font-mono text-[0.72rem]",
              tone === "steady" &&
                "border-[color:var(--voice-accent)]/60 text-[color:var(--voice-accent)]"
            )}
          >
            {event?.turn ?? "t0"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div
          className={cn(
            "font-mono text-5xl font-semibold leading-none tracking-normal",
            tone === "runaway"
              ? "text-[color:var(--fail)]"
              : "text-[color:var(--voice-accent)]"
          )}
        >
          {formatUsd(currentValue)}
        </div>
        <Progress
          value={progress}
          className={cn(
            "[&_[data-slot=progress-track]]:h-3",
            tone === "runaway" &&
              "[&_[data-slot=progress-indicator]]:bg-[color:var(--fail)]",
            tone === "steady" &&
              "[&_[data-slot=progress-indicator]]:bg-[color:var(--voice-accent)]"
          )}
        />
        <div className="flex items-center justify-between gap-3 font-mono text-xs text-muted-foreground">
          <span>
            in {event?.tokens_in ?? 0} · out {event?.tokens_out ?? 0}
          </span>
          <span>{Math.round(progress)}%</span>
        </div>
      </CardContent>
    </Card>
  );
}

function CostCounter({
  cost,
  currentSeconds,
  turnTimes,
}: {
  cost: CostFixture;
  currentSeconds: number;
  turnTimes: Map<string, number>;
}) {
  const baseEvent = latestCostEvent(
    cost.events,
    "base",
    currentSeconds,
    turnTimes
  );
  const suggeritoreEvent = latestCostEvent(
    cost.events,
    "suggeritore",
    currentSeconds,
    turnTimes
  );
  const hasBothAdvanced = Boolean(baseEvent && suggeritoreEvent);
  const gap =
    (baseEvent?.usd_cumulative ?? 0) -
    (suggeritoreEvent?.usd_cumulative ?? 0);

  return (
    <Card className="border-white/10 bg-card/80">
      <CardHeader className="grid gap-4 pb-4 xl:grid-cols-[1fr_auto] xl:items-center">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-2xl">Cost counter</CardTitle>
          <CardDescription className="text-base">
            MOCK — real number from the 13:30 run
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge
            variant="outline"
            className="h-8 rounded-lg border-[color:var(--running)]/70 px-3 font-mono text-xs text-[color:var(--running)]"
          >
            {hasBothAdvanced
              ? `${cost.final.ratio.replace("x", "×")} final`
              : "waiting"}
          </Badge>
          <Badge
            variant="secondary"
            className="h-8 rounded-lg px-3 font-mono text-xs"
          >
            gap {formatUsd(Math.max(0, gap))}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
          <CostReadout
            event={baseEvent}
            finalValue={cost.final.base}
            label="Agente base"
            tone="runaway"
          />
          <CostReadout
            event={suggeritoreEvent}
            finalValue={cost.final.suggeritore}
            label="Suggeritore"
            tone="steady"
          />
          <div className="flex min-w-44 flex-col justify-center gap-2 rounded-xl border border-white/10 bg-[color:var(--surface-soft)] p-4">
            <span className="text-sm text-muted-foreground">Divergence</span>
            <span className="font-mono text-4xl font-semibold text-[color:var(--fail)]">
              {hasBothAdvanced ? cost.final.ratio.replace("x", "×") : "—"}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              final base / suggeritore
            </span>
          </div>
        </div>
        <p className="max-w-5xl text-sm leading-6 text-muted-foreground">
          {cost.pricing_note}
        </p>
      </CardContent>
    </Card>
  );
}

function LedgerEntryRow({
  entry,
  label,
  isVisible,
}: {
  entry: StateLedgerEntry;
  label: string;
  isVisible: boolean;
}) {
  if (!isVisible) {
    return null;
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 flex flex-col gap-2 rounded-xl border border-white/10 bg-[color:var(--surface-soft)] p-4 duration-500">
      <div className="flex items-center justify-between gap-3">
        <Badge
          variant="secondary"
          className="h-6 rounded-lg px-2 font-mono text-[0.7rem]"
        >
          {label}
        </Badge>
        <span className="font-mono text-xs text-muted-foreground">
          [{entry.turn}]
        </span>
      </div>
      <p className="text-base leading-7 text-foreground">{entry.text}</p>
    </div>
  );
}

function MemoryHud({
  state,
  currentSeconds,
  turnTimes,
}: {
  state: StateLedger;
  currentSeconds: number;
  turnTimes: Map<string, number>;
}) {
  const visibleFacts = state.facts.filter(
    (entry) => (turnTimes.get(entry.turn) ?? Infinity) <= currentSeconds
  );
  const visibleCommitments = state.commitments.filter(
    (entry) => (turnTimes.get(entry.turn) ?? Infinity) <= currentSeconds
  );
  const revealedCount = visibleFacts.length + visibleCommitments.length;
  const totalCount = state.facts.length + state.commitments.length;

  return (
    <Card className="h-full border-white/10 bg-card/80">
      <CardHeader className="border-b border-white/10 pb-5">
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="text-2xl text-[color:var(--voice-accent)]">
            Memory HUD
          </CardTitle>
          <Badge
            variant="outline"
            className="h-7 rounded-lg border-[color:var(--voice-accent)]/70 px-3 font-mono text-[0.75rem] text-[color:var(--voice-accent)]"
          >
            {revealedCount}/{totalCount}
          </Badge>
        </div>
        <CardDescription className="text-base">
          Append-only state ledger
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 pt-5">
        <div className="flex items-center justify-between gap-4">
          <Badge
            variant="outline"
            className="h-7 rounded-lg px-3 font-mono text-[0.75rem]"
          >
            last_turn {state.last_turn}
          </Badge>
          <Badge
            variant="outline"
            className="h-7 rounded-lg border-[color:var(--running)]/70 px-3 font-mono text-[0.75rem] text-[color:var(--running)]"
          >
            RUNNING
          </Badge>
        </div>
        <Separator />
        <div className="flex flex-col gap-3 rounded-xl border border-[color:var(--voice-accent)]/30 bg-[color:var(--voice-accent)]/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-[color:var(--voice-accent)]">
              identity
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              [state]
            </span>
          </div>
          <p className="text-base leading-7">{state.identity}</p>
        </div>
        <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-[color:var(--surface-soft)] p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-muted-foreground">
              objective
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              [state]
            </span>
          </div>
          <p className="text-base leading-7">{state.objective}</p>
        </div>
        <Separator />
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">facts[]</h2>
            <span className="font-mono text-xs text-muted-foreground">
              append-only
            </span>
          </div>
          {state.facts.map((entry) => (
            <LedgerEntryRow
              key={entry.id}
              entry={entry}
              label={entry.id}
              isVisible={visibleFacts.some((fact) => fact.id === entry.id)}
            />
          ))}
          {visibleFacts.length === 0 ? (
            <Skeleton className="h-20 rounded-xl" />
          ) : null}
        </div>
        <Separator />
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">commitments[]</h2>
            <span className="font-mono text-xs text-muted-foreground">
              evidence cited
            </span>
          </div>
          {state.commitments.map((entry) => (
            <LedgerEntryRow
              key={entry.id}
              entry={entry}
              label={entry.id}
              isVisible={visibleCommitments.some(
                (commitment) => commitment.id === entry.id
              )}
            />
          ))}
          {visibleCommitments.length === 0 ? (
            <Skeleton className="h-20 rounded-xl" />
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function TranscriptShell({
  baseTurns,
  cost,
  suggeritoreTurns,
  state,
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
    () => parseTimestamp(baseTurns.find((turn) => turn.displayTurn === "t38")?.ts ?? "09:56"),
    [baseTurns]
  );
  const recallEnd = useMemo(
    () => parseTimestamp(baseTurns.find((turn) => turn.displayTurn === "t41")?.ts ?? "10:14"),
    [baseTurns]
  );
  const [currentSeconds, setCurrentSeconds] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const baseVisibleTurns = useMemo(
    () =>
      baseTurns.filter((turn) => isVisibleAt(turn, currentSeconds)).sort((a, b) => parseTurnNumber(a.displayTurn) - parseTurnNumber(b.displayTurn)),
    [baseTurns, currentSeconds]
  );
  const suggeritoreVisibleTurns = useMemo(
    () =>
      suggeritoreTurns.filter((turn) => isVisibleAt(turn, currentSeconds)).sort((a, b) => parseTurnNumber(a.displayTurn) - parseTurnNumber(b.displayTurn)),
    [suggeritoreTurns, currentSeconds]
  );
  const turnTimes = useMemo(() => turnTimestampMap(baseTurns), [baseTurns]);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    const interval = window.setInterval(() => {
      setCurrentSeconds((seconds) => {
        const nextSeconds = Math.min(duration, seconds + REPLAY_RATE * (FRAME_MS / 1000));

        if (nextSeconds >= duration) {
          window.setTimeout(() => setIsPlaying(false), 0);
        }

        return nextSeconds;
      });
    }, FRAME_MS);

    return () => window.clearInterval(interval);
  }, [duration, isPlaying]);

  const handleSeek = (value: number) => {
    setCurrentSeconds(Math.min(duration, Math.max(0, value)));
  };

  const handleJumpToRecall = () => {
    setCurrentSeconds(recallStart);
    setIsPlaying(true);
  };

  return (
    <main className="flex min-h-screen flex-col gap-6 p-6 lg:p-8">
      <header className="grid gap-6 xl:grid-cols-[1fr_36rem]">
        <div className="flex flex-col justify-end gap-4">
          <Badge className="h-8 w-fit rounded-lg bg-secondary px-3 font-mono text-xs text-secondary-foreground">
            HackRome · 13 Jun 2026
          </Badge>
          <div className="flex flex-col gap-3">
            <h1 className="max-w-5xl text-5xl font-semibold leading-tight tracking-normal text-foreground">
              Il Suggeritore
            </h1>
            <p className="max-w-4xl text-xl leading-8 text-muted-foreground">
              Same voice-agent call, replayed side by side from the SPEC
              fixtures.
            </p>
          </div>
        </div>
        <CostCounter
          cost={cost}
          currentSeconds={currentSeconds}
          turnTimes={turnTimes}
        />
      </header>
      <ReplayControls
        currentSeconds={currentSeconds}
        duration={duration}
        isPlaying={isPlaying}
        recallStart={recallStart}
        recallEnd={recallEnd}
        onPlayToggle={() => setIsPlaying((playing) => !playing)}
        onSeek={handleSeek}
        onJumpToRecall={handleJumpToRecall}
      />

      <section className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid min-h-0 gap-6 lg:grid-cols-2">
          <LaneCard
            title="Agente base"
            description="No memory layer"
            turns={baseVisibleTurns}
            lane="base"
          />
          <LaneCard
            title="Suggeritore"
            description="Same prompt and voice, memory layer on"
            turns={suggeritoreVisibleTurns}
            lane="suggeritore"
          />
        </div>
        <MemoryHud
          state={state}
          currentSeconds={currentSeconds}
          turnTimes={turnTimes}
        />
      </section>
    </main>
  );
}
