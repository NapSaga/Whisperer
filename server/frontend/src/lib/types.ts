import {
  ResponseFunctionToolCall,
  ResponseInputItem,
  ResponseOutputItem,
} from "openai/resources/responses/responses.mjs";

export type ToolCall = ResponseFunctionToolCall & { output?: string };
export type Message = ResponseInputItem | ResponseOutputItem | ToolCall;

// Live ledger (Whisperer SPEC §1) pushed over the websocket as `state.updated`.
// Mirrors the StateLedger pydantic model the distiller writes to state.json.
export interface LedgerEntry {
  id: string;
  text: string;
  turn: string;
}

export interface Ledger {
  identity: string;
  objective: string;
  facts: LedgerEntry[];
  commitments: LedgerEntry[];
  last_turn: number;
}

// Metriche live emesse dal relay realtime dopo ogni risposta (HUD "sta funzionando?").
export interface Metrics {
  turn: number;
  responses: number;
  total_usd: number;
  cache_hit_pct: number;
  input_tokens: number;
  output_tokens: number;
  latency_ms?: number; // time-to-first-audio della risposta (latenza percepita)
  question?: string; // ultima battuta dell'esaminatore (la "domanda corrente")
  user_said?: string; // cosa ha detto lo studente in questo turno
  // Confronto costi LIVE: suggeritore REALE + proiezione base pieno/cappato.
  sug_usd?: number;
  base_full_usd?: number;
  base_cap_usd?: number;
  sug_turn?: number;
  base_full_turn?: number;
  base_cap_turn?: number;
  trend_sug?: number[];
  trend_full?: number[];
  trend_cap?: number[];
}

// Sottotitoli live (dal relay realtime): trascrizione parziale di chi sta parlando.
export interface Transcript {
  user: string;
  assistant: string;
}
