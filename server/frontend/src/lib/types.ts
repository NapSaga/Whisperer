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
