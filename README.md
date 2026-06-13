# Il Suggeritore

**A drop-in memory layer for long voice-agent calls.** A cheap model distills the live
conversation into a typed, evidence-backed state ledger and re-grounds the agent, so it
never loses the thread — and the audio context isn't re-paid every turn.

Long calls drift and get expensive: OpenAI itself notes *"instruction adherence can drift"*
as context grows, and *"turns later in the session will be more expensive"*. Today the fix
is artisanal — every team rewrites its own context handling. We package it: a model-agnostic
add-on for anyone building on OpenAI Realtime, ElevenLabs Agents, Vapi, Retell.

**Demo:** the same agent on one long call, side-by-side — `base` forgets minute 1 by minute
10, `suggeritore` remembers, with a binary judge scoring it on N runs.

Built at **HackRome**, 13 Jun 2026 — Daniele (engine) · Gabriele (measurement) · Giovanni (product).

## Start here
1. Read **`AGENTS.md`** then **`spec/SPEC.md`**.
2. `server/` `harness/` `web/` — one owner each, parallel work, coupled only via `SPEC §7`.
3. `web/` runs on `spec/fixtures/` with no backend. Mock-first.

Built today with OpenAI Agents SDK · structured outputs · ElevenLabs · Codex.
