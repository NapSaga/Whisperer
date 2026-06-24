# `recordings/uncapped/` — full-context base, the COST evidence for long calls

Long-call (64 turns, N=5) run with the base **uncapped** (`SUGGERITORE_BASE_CAP=0`),
so the base re-pays the whole growing conversation every turn instead of a capped window.

This isolates the **cost** dimension of a long call (ROADMAP #3). Pair it with the capped
long-call runs in `../long-call_base_run*.jsonl`, which isolate the **recall** dimension:

| Config | Recall (N=5) | Cost mean (audio-priced lens) | What it shows |
|---|---|---|---|
| base **capped** (`../long-call_*`) | **0/5** — forgets | $0.54 | the recall win (base drops the minute-1 fact) |
| base **uncapped** (here) | 4/5 — mostly remembers (context rot) | **$1.36** | the cost cost: full context costs **2.1× the suggeritore** |
| suggeritore (`../long-call_sug_*`) | **5/5** | $0.65 | remembers *and* stays flat |

Forgetting and cost are coupled: the cheap base is the one that forgets; the base that
remembers (full context) is the expensive one — **$1.36 vs suggeritore $0.65 = 2.1×** at 64
turns, up from 1.30× at 28 turns (`server/evidence/fullcontext-qa/`), trending toward the
7.6× projected on a full 10–20 min call. Whisperer remembers 5/5 *and* stays flat.

`long-call_base_run{1..5}.jsonl` — full-context transcripts (SPEC §7).
`*_cost.jsonl` — per-turn cost_events (SPEC §5).
