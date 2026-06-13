# Whisperer

**A drop-in, model-agnostic memory layer for long voice-agent calls.** A cheap model
distills the live conversation into a typed, evidence-backed **state ledger** and re-grounds
the agent every turn — so it never loses the thread, and the audio context isn't re-paid on
every turn.

Built at **HackRome — 13 Jun 2026** · Daniele (engine) · Gabriele (measurement) · Giovanni (product).

<!-- Drop the demo capture here before submitting (assets/demo.gif). -->
![Whisperer demo — same agent, one long call: base forgets, Whisperer remembers](assets/demo.gif)

---

## The problem

Long voice calls **drift and get expensive**. OpenAI itself notes that *"instruction
adherence can drift"* as context grows and that *"turns later in the session will be more
expensive."* Managed platforms ship hard limits to cope — Retell caps context around 32k,
OpenAI documents blind truncation — so by minute 10 the agent has quietly forgotten what the
caller said at minute 1.

Today the fix is artisanal: every team rewrites its own context handling. **Whisperer packages
it** as an add-on you bolt onto any voice stack (OpenAI Realtime, ElevenLabs Agents, Vapi,
Retell). We are customer zero — [StudierAI](#) goes to production with it.

---

## What we built (the precise truth)

Whisperer is a memory layer that sits **next to** the voice agent. Three real pieces, all in
the code:

1. **The distiller** (`gpt-4o-mini`, structured output) — every 4 turns it reads the live
   transcript and writes a **typed, append-only state ledger**: identity, objective, facts,
   commitments. Every entry **cites the transcript turn that proves it**. A deterministic
   `_reconcile` step drops any fact that doesn't point to a real caller turn → **no
   hallucinated memory**. This is the IP.
   → `server/server/app/state_store.py`, `spec/SPEC.md §1–2`

2. **Compact re-grounding** (`compact_input`, the real session-rotation of `SPEC §3`) — each
   turn, instead of resending the whole conversation, Whisperer sends `[compact ledger + the
   current question]`. The agent answers from the distilled state. **This is the product, and
   it's measured**: the Whisperer side stays light while the base re-pays its growing window.
   → `server/server/app/injector.py`

3. **The judge + harness** — a binary judge reads a recorded call plus the seeded fact and
   returns *remembers: yes/no* with the **turn citation**. In batch (N=10/side) it produces
   **the number**. It runs against the *real* workflow, so the number isn't gamed at the
   measurement layer.
   → `harness/judge.py`, `harness/runner.py`

### The result (measured)

| Side | Recall (N=10) | How |
|---|---|---|
| `base` (no layer) | **0 / 10** | item-capped window → minute-1 fact falls out by recall |
| `suggeritore` (Whisperer on) | **10 / 10** | answers from the compact ledger, every verdict carries a `[t16]` citation |

Plus: split-screen demo, a live HUD that writes the ledger to screen by itself, and the
**recall moment** — the base flounders, Whisperer answers exactly, with proof.

---

## Honesty notes (the limits are the credibility)

We under-promise by a hair on purpose. State these proactively; keep them ready in Q&A.

- **Cost — the important one.** What's *real and measured*: the Whisperer side is genuinely
  **lighter** because it sends compact state instead of resending history. The **magnitude**
  of the saving (e.g. 7.6×) is a **projection** from official Realtime rates + our StudierAI
  bill (€4.50 vs €0.13) — the on-screen counter is labeled **"projection"**, never "measured",
  and the mock `cost.json` is never passed off as a measurement. On a short 28-turn demo the
  dramatic divergence does not exist (forgetting and cost-magnitude are coupled and only both
  hold on a long call); on a real 10–20 min call the gap compounds.

- **Why the base forgets.** The base is capped to reproduce the **real** 32k hard-cap managed
  platforms ship (Retell) and the blind truncation OpenAI documents. The number measures
  recall under that real condition — not an invented handicap.

- **Watchdog (if asked).** Designed, not shipped today (`SPEC §4`). The current build uses
  periodic re-grounding + compact state — the safe default. The watchdog is the next module.

- **Distiller cost (if asked).** Yes, the layer runs a cheap text model; its overhead is
  limited and small next to the audio context the base re-pays every turn.

Backup evidence for Q&A lives in **`server/evidence/fullcontext-qa/`**: a full-context base
experiment showing **5/10 even uncapped** (documented context rot) and a **1.30× real,
measured** cost divergence in the right direction — *"we measured the direction; we project
the magnitude."*

---

## Repo layout — three owners, parallel work

| Path | Owner | What lives here |
|---|---|---|
| `server/` | Daniele | FastAPI voice agent (from `openai-voice-agent-sdk-sample`) + the layer: distiller, injector, cost meter |
| `harness/` | Gabriele | Binary judge + batch runner (N=10/side) → **the number** · token/cost meter |
| `web/` | Giovanni | Next.js dashboard: split-screen `base` vs `suggeritore` + live **memory HUD** + cost counter |
| `spec/` | shared | `SPEC.md` (design + JSON contracts), `PROMPTS.md` (Codex kickoffs), `fixtures/` (mock data) |

The three folders couple **only** through the JSON contracts in `spec/SPEC.md §7`. Each side
builds against `spec/fixtures/`, never against each other — which is what lets `web/` run with
no backend (mock-first).

---

## Built with Codex

**Codex was the primary builder.** Every feature was driven by an opening prompt of the form
*"read `spec/SPEC.md`, propose the integration plan into the sample"* — never "build
everything" — one closed task at a time, a fresh session per task, gated against
hallucination (library APIs via Context7 MCP, UI via the official shadcn CLI). The
**Codex-signed commit trail is the proof of build**: the repo's history shows the layer, the
judge, and the dashboard built today, in the open.

---

## Run it

**Prereqs:** Node 18+, [`uv`](https://github.com/astral-sh/uv), and a `.env` in the repo root
(copy `.env.example`) with `OPENAI_API_KEY` (+ `ELEVENLABS_API_KEY` for voice).

### 1. The dashboard (the demo) — runs on fixtures, no backend needed
```bash
cd web
npm install
npm run dev          # http://localhost:3000 — split-screen, live HUD, cost meter
```

### 2. The harness (the number)
```bash
# validate the judge against the bundled fixture
python harness/runner.py --mode fixture

# score N real recordings per side, and aggregate per-run cost
python harness/runner.py --mode live \
  --base recordings/base_run*.jsonl \
  --suggeritore recordings/sug_run*.jsonl \
  --cost-dir recordings/
```

### 3. The live server (engine)
```bash
cd server && make sync                       # npm install + uv sync
cd server/server && uv run python server.py  # FastAPI + /ws on :8000

# generate a fresh batch of recordings (N=10 per side)
uv run python batch_run.py --mode suggeritore --n 10
uv run python batch_run.py --mode base        --n 10
```

The layer is toggled by env vars (read by `server/server/app/`):
`SUGGERITORE_MODE` (`on`/`off`), `SUGGERITORE_STATE_PATH`, `SUGGERITORE_COST_PATH`,
`SUGGERITORE_INJECT_EVERY`, `SUGGERITORE_DISTILL_EVERY`, `SUGGERITORE_BASE_CAP`.

> Note: `suggeritore` is the internal identifier for the *layer-on* side (the project's
> original name). The product is **Whisperer**.

---

## The contracts (`spec/SPEC.md §7`)

Four JSON shapes are the only coupling between folders — mocks live in `spec/fixtures/`:

- **`transcript turn`** — one line of the call (`[t{n}]`, role, text)
- **`state.json`** — the append-only ledger (identity · objective · facts · commitments, each with a citing turn)
- **`cost_event`** — per-turn `{agent, turn, tokens_in, tokens_out, usd_cumulative}` (`SPEC §5`)
- **`verdict`** — the judge output `{remembers, citation, …}` (`SPEC §6`)

---

## Demo audio

Real grandmother recordings (Neapolitan, with consent) live in `web/public/audio/`, named by
transcript turn and matching `spec/fixtures/transcript.jsonl` word for word: the gift is a
**watch** for grandson Luca, it must arrive **before the 20th** (graduation), order **4471**,
delivered to neighbor **sig.ra Pina, interno 3**. At minute 10 the base asks the caller to
repeat everything; Whisperer confirms the deadline and delivery from memory.

---

## Sponsors used

OpenAI **Agents SDK** · **structured outputs** (`gpt-4o-mini` distiller + binary judge) ·
**ElevenLabs** (voice) · **Codex** (the builder, and the commit trail).
