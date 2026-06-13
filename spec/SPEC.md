# SPEC — Il Suggeritore (the memory layer)

The agent under test runs twice on the **same** prompt and voice: `base` (no layer) and
`suggeritore` (layer on). Only memory differs. Target: at minute 10 the base forgets a
fact seeded at minute 1; the suggeritore recalls it, and the judge proves it on N runs.

---

## 1. State ledger — the core artifact
A typed, **append-only** ledger (NOT a prose summary). Every entry carries the transcript
turn that proves it. The distiller writes it, the HUD renders it, the judge reads it.

```json
// state.json — the live state at any moment
{
  "identity":  "you are ShopDemo's phone support agent",
  "objective": "track the delivery date of a gift order",
  "facts":       [{ "id": "f1", "text": "gift is for the caller's grandson", "turn": "t1" }],
  "commitments": [{ "id": "c1", "text": "agent will check the warehouse", "turn": "t9" }],
  "last_turn": 0
}
```
Rules: append-only (entries are added or superseded **by `id`**, never silently rewritten);
`turn` is the evidence ref into the transcript; every `text` is one short clause. Compact
on purpose — the win is fewer tokens, not a log.

## 2. Distiller — `server/`, every 4 turns
Cheap model (`gpt-4o-mini` / Haiku class), **structured output** matching `state.json`.
- **IN** `{ state, new_turns: [{turn, role, text}] }` → **OUT** updated `state`.
- Extract: new facts/commitments the **caller** states; update `objective` if it shifts.
- Discard: pleasantries, repetition, the agent's own filler.

## 3. Injection — re-grounding the agent
Before the agent answers, prepend a compact system update built from `state.json`
(identity + objective + facts/commitments relevant to the current question).
- **periodic** (safe default): inject the compact state every N turns.
- **watchdog** (the edge, §4): inject only on drift.
- **session-rotation** variant: on long calls, start a fresh session **rehydrated from
  `state.json`** instead of resending the audio history → this is the cost win.

## 4. Watchdog — `server/`, the risky piece (fallback ready)
After each agent response, a cheap check compares it to `state.json`: does it contradict
or ignore a known fact the caller just relied on?
- **IN** `{ state, last_user_turn, agent_response }` →
  **OUT** `{ drift: bool, fact_id, reinjected_text }`.
- On drift → re-inject that **single** fact and let the agent answer again.
- **FALLBACK (decide by 16:30):** if unstable, ship periodic injection (§3) and present
  the watchdog as design. §1 and §6 must be real regardless.

## 5. Cost meter — `server/` emits, `harness/` can verify
Per turn: `tokens × realtime audio price`, accumulated per agent. The base re-pays the full
audio context each turn; the suggeritore sends the compact text state → the two diverge.
```json
// cost_event
{ "agent": "base", "turn": "t10", "tokens_in": 4200, "tokens_out": 180, "usd_cumulative": 1.84 }
```

## 6. Judge — `harness/`, the deliverable (the number)
Binary verdict, **structured output**, with citation. No vibes.
```json
// IN
{ "transcript": [...], "seeded_fact": "the order is football boots, size 38, for the grandson" }
// OUT
{ "remembers": true, "citation": "t41", "identity_held": true, "objective_correct": true,
  "reason": "agent restated the boots and recipient at t41" }
```
Batch: **N=10 runs per side** → `"base X/10, suggeritore Y/10"`. Produced at **13:30** so the
number is safe early. Honest target, not 10/10.

## 7. Contracts — the ONLY coupling between folders
`server/` **produces**, `harness/` + `web/` **consume**. Build against `spec/fixtures/`,
integrate at 13:30 / 15:00. **These shapes do not change** — agree transport at 10:30 only.
| Object | Produced by | Consumed by | Shape |
|---|---|---|---|
| transcript turn | server | web, harness | `{ turn, role: "agent"|"caller", text, ts }` |
| `state.json` | server (distiller) | web (HUD), harness (judge) | §1 |
| `cost_event` | server | web (counter) | §5 |
| `verdict` | harness (judge) | web (verdict view) | §6 |
Transport = simplest that works: server writes `state.json` + a `transcript.jsonl` to disk
**and/or** a WS channel; web polls or streams; harness reads the recorded run. The fixtures
in `spec/fixtures/` mirror these shapes exactly.

## 8. Demo determinism
The suggeritore side is ~deterministic (the fact is in `state.json`) → run **live**.
The base failure is probabilistic → record one real failing run at 13:30 and **replay it**.
The "remember minute 1" moment must be reproducible on command. Land the plane before the airshow.

## 9. Fixtures (`spec/fixtures/`) — build the mocks first
- `state.json` — the ledger at minute 10 (what the HUD renders).
- `transcript.jsonl` — one full base call: fact seeded at t1, base forgets at t41.
- `verdicts.json` — 10 base + 10 suggeritore verdicts → the X/10 vs Y/10 number for the UI.
