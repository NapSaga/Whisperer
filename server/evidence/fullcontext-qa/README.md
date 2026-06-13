# Q&A evidence — full-context base experiment (NOT the headline number)

Kept as backup/Q&A material only. **The shipped number remains `spec/fixtures/verdicts.json`:
base 0/10 · suggeritore 10/10**, produced by the committed item-cap base path. This folder
documents a side experiment; it does not change the demo number.

## What was tried
Option A for SPEC §5: drop the base context cap so **base re-pays the FULL conversation
context every turn** (the literal §5 story — no fabricated tokens, the meter prices exactly
what base sends), while the suggeritore sends a compact ledger every turn
(`injector.compact_input`, session-rotation §3). Call length: 28 turns (the lengthened script).

## Result (real recordings, judge = harness/judge.py)
- **base 5/10**, **suggeritore 10/10** (judge verdict over N=10 each).
- Cost (real tokens, audio-priced demo lens), cumulative per run:
  - base mean **$0.2983**, climbing per-turn `tokens_in` ~`249 → 876`.
  - sug  mean **$0.2288**, flat per-turn `tokens_in` ~`375 → 495`.
  - ratio **1.30×** (base > sug — the §5 inversion is fixed; shape is right: base climbs, sug flat).

## Why this was NOT shipped
The `≤3/10` base lock failed: full-context base at 28 turns retrieves the seeded fact ~half
the time. At 28 turns the dialogue is only ~640 tokens (the rest of `tokens_in` is the fixed
~235-tok system+tools baseline), so the two goals are coupled against each other:
- reliable forgetting needs the early seeds **out** of context → a small window;
- base ≫ sug cost needs base to send **a lot** → full/large context.
No single setting does both at 28 turns; only a longer call resolves it (base loses the fact
reliably AND the cost gap widens). Lengthening was out of scope.

## Decision (freeze)
- Keep committed `verdicts.json` (0/10 vs 10/10) as the shipped number.
- Revert the server **base** branch to the cap so a live recall matches the 0/10 story.
- **Keep** `injector.compact_input` on the suggeritore side (the session-rotation cost win).
- No re-run, no lengthen. This experiment lives here as evidence.

## Files
`base_run{1..10}.jsonl` / `sug_run{1..10}.jsonl` — full-context transcripts (SPEC §7 shape).
`*_cost.jsonl` — per-turn `cost_event`s (SPEC §5) for each run.
