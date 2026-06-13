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
