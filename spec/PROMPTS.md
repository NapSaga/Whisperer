# PROMPTS — paste-ready Codex kickoffs

Rule: **one closed task at a time, fresh session per task.** Never "build everything".
Always start a folder's first session with its kickoff below. Then drive task-by-task.

## 0. Universal first prompt (every session)
> Read `AGENTS.md` and `spec/SPEC.md`. Work only inside `<server|harness|web>/`. Couple to
> other folders only through the JSON contracts in `SPEC §7` and the data in `spec/fixtures/`.
> Propose a short plan before editing. One task at a time.

## 1. server/ — Daniele
> Read AGENTS.md and spec/SPEC.md. We cloned `openai-voice-agent-sdk-sample` into `server/`.
> Propose the minimal integration plan to add the layer: (1) distiller (SPEC §2) writing
> `state.json` every 4 turns, (2) periodic injection (SPEC §3), (3) emit `transcript.jsonl`
> + `cost_event` (SPEC §5,§7). Watchdog (§4) is a later task. Match the fixture shapes exactly.

## 2. harness/ — Gabriele
> Read AGENTS.md and spec/SPEC.md. Build the binary judge (SPEC §6) with OpenAI structured
> outputs: input transcript + seeded_fact → verdict with citation. Then a batch runner doing
> N=10 runs per side and printing `base X/10, suggeritore Y/10`. Validate against
> `spec/fixtures/transcript.jsonl` and `verdicts.json` before touching the live server.

## 3. web/ — Giovanni
> Read AGENTS.md and spec/SPEC.md. Build a single-page Next.js dashboard (shadcn + ai-elements,
> dark-only) that runs **entirely on `spec/fixtures/`**: split-screen base vs suggeritore
> transcript, a live **memory HUD** rendering `state.json` row-by-row, and a diverging cost
> counter from `cost_event`. No auth, no routing. It must look finished on mock by 13:00;
> wire to the server (poll/WS) only after.
