export type TranscriptRole = "agent" | "caller";

export type TranscriptTurn = {
  turn: string;
  role: TranscriptRole;
  text: string;
  ts: string;
};

export type StateLedgerEntry = {
  id: string;
  text: string;
  turn: string;
};

export type StateLedger = {
  identity: string;
  objective: string;
  facts: StateLedgerEntry[];
  commitments: StateLedgerEntry[];
  last_turn: number;
};

export type CostEvent = {
  agent: "base" | "suggeritore";
  turn: string;
  tokens_in: number;
  tokens_out: number;
  usd_cumulative: number;
};

export type CostFixture = {
  pricing_note: string;
  unit?: string;
  final: {
    base: number;
    suggeritore: number;
    ratio: string;
  };
  events: CostEvent[];
};

export type Verdict = {
  remembers: boolean;
  citation: string;
  identity_held: boolean;
  objective_correct: boolean;
  reason: string;
};

export type VerdictRun = Verdict & {
  run: number;
};

export type VerdictsFixture = {
  seeded_fact: string;
  question_turn: string;
  runs: {
    base: VerdictRun[];
    suggeritore: VerdictRun[];
  };
  score: {
    base: string;
    suggeritore: string;
  };
};

export type TranscriptLane = "base" | "suggeritore";

export type DisplayTurn = TranscriptTurn & {
  displayTurn: string;
};

/* Long-call evidence (ROADMAP #3) — measured on a 64-turn call, N=5.
   Derived from recordings/long-call_* + recordings/uncapped/ via per-turn
   aggregation of the SPEC §5 cost events. The curve is what makes the thesis
   visible: full-context base cost climbs, Whisperer stays flat. */
export type LongCallConfig = {
  recall: string;
  cost: number;
  note: string;
};

export type LongCallScalingPoint = {
  turns: string;
  ratio: number;
  kind: "misurato" | "proiettato";
  note: string;
};

export type LongCallCurvePoint = {
  turn: number;
  baseFull: number;
  sug: number;
  baseCapped: number;
};

export type LongCallFixture = {
  callTurns: number;
  runs: number;
  pricingNote: string;
  headline: {
    baseCapped: LongCallConfig;
    baseFull: LongCallConfig;
    suggeritore: LongCallConfig;
    ratio: number;
  };
  scaling: LongCallScalingPoint[];
  curve: LongCallCurvePoint[];
};

/* StudierAI oral-exam demo — the real configured customer-zero measurement
   (ROADMAP #4). Same recall/cost shape as the long call, plus the full StudierAI
   stack configuration (model, voice, cost lens) surfaced for the "see all the
   configs" view. Built from recordings/studierai-oral_* via per-turn aggregation. */
export type StudieraiConfig = {
  modelHarness: string;
  modelProd: string;
  agentProfile: string;
  scenario: string;
  stt: string;
  tts: string;
  baseCap: number;
  costLens: string;
  source: string;
};

export type StudieraiFixture = {
  callTurns: number;
  sessionMinutes: number;
  runs: number;
  subject: string;
  config: StudieraiConfig;
  headline: {
    baseCapped: LongCallConfig;
    baseFull: LongCallConfig;
    suggeritore: LongCallConfig;
    ratio: number;
  };
  curve: LongCallCurvePoint[];
};
