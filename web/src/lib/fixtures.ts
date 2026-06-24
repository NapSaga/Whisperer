import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  CostFixture,
  DisplayTurn,
  LongCallFixture,
  StateLedger,
  TranscriptLane,
  TranscriptRole,
  TranscriptTurn,
  VerdictsFixture,
} from "@/lib/contracts";

const fixturesDir = join(process.cwd(), "src", "lib", "fixtures");

function parseJsonFile<T>(name: string): T {
  return JSON.parse(readFileSync(join(fixturesDir, name), "utf8")) as T;
}

function isTranscriptRole(value: unknown): value is TranscriptRole {
  return value === "agent" || value === "caller";
}

function parseTranscriptLine(line: string, index: number): TranscriptTurn {
  const parsed = JSON.parse(line) as Partial<TranscriptTurn>;

  if (
    typeof parsed.turn !== "string" ||
    !isTranscriptRole(parsed.role) ||
    typeof parsed.text !== "string" ||
    typeof parsed.ts !== "string"
  ) {
    throw new Error(`Invalid transcript turn at line ${index + 1}`);
  }

  return {
    turn: parsed.turn,
    role: parsed.role,
    text: parsed.text,
    ts: parsed.ts,
  };
}

export function getTranscript(): TranscriptTurn[] {
  return readFileSync(join(fixturesDir, "transcript.jsonl"), "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map(parseTranscriptLine);
}

export function getStateLedger(): StateLedger {
  return parseJsonFile<StateLedger>("state.json");
}

export function getVerdicts(): VerdictsFixture {
  return parseJsonFile<VerdictsFixture>("verdicts.json");
}

export function getCostFixture(): CostFixture {
  return parseJsonFile<CostFixture>("cost.json");
}

export function getLongCall(): LongCallFixture {
  return parseJsonFile<LongCallFixture>("long-call.json");
}

export function getTranscriptLane(
  turns: TranscriptTurn[],
  lane: TranscriptLane
): DisplayTurn[] {
  const excludedTurn =
    lane === "base" ? "t41_suggeritore" : "t41_base";
  const includedTurn =
    lane === "base" ? "t41_base" : "t41_suggeritore";

  return turns
    .filter((turn) => turn.turn !== excludedTurn)
    .map((turn) => ({
      ...turn,
      displayTurn: turn.turn === includedTurn ? "t41" : turn.turn,
    }));
}
