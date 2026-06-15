<h1 align="center">Whisperer</h1>

<p align="center"><em>A drop-in, model-agnostic memory layer for long voice-agent calls.</em></p>

<p align="center">
A cheap model distills the live conversation into a typed, evidence-backed <strong>state ledger</strong><br>
and re-grounds the agent every turn — so it never loses the thread, and the audio context isn't re-paid each turn.
</p>

<p align="center">
  <img alt="HackRome" src="https://img.shields.io/badge/HackRome-13_Jun_2026-111111">
  <img alt="OpenAI Agents SDK" src="https://img.shields.io/badge/OpenAI-Agents_SDK-111111">
  <img alt="ElevenLabs" src="https://img.shields.io/badge/ElevenLabs-voice-111111">
  <img alt="Built with Codex" src="https://img.shields.io/badge/built_with-Codex-111111">
  <img alt="recall" src="https://img.shields.io/badge/recall-0%2F10_→_10%2F10-111111">
</p>

<p align="center"><sub>Built at HackRome · 13 Jun 2026 — <a href="https://www.linkedin.com/in/giovanni-di-fonzo-111692297/">Giovanni Di Fonzo</a> (product) · <a href="https://www.linkedin.com/in/daniele-giovanardi/">Daniele Giovanardi</a> (engine) · <a href="https://www.linkedin.com/in/gabriele-loreti-b4a537155/">Gabriele Loreti</a> (measurement)</sub></p>

<p align="center"><b><a href="https://www.facebook.com/share/v/1BBnwLGhvK/">Watch the demo →</a></b> &nbsp;·&nbsp; <a href="https://devpost.com/software/whisperers">Devpost</a> &nbsp;·&nbsp; <a href="https://luma.com/n14m3k83">HackRome</a></p>

---

> **Long voice calls drift and get expensive.** OpenAI itself notes that *"instruction adherence can drift"* as context grows, and that *"turns later in the session will be more expensive."* Managed platforms ship hard limits to cope — Retell caps context around 32k, OpenAI documents blind truncation — so by minute 10 the agent has quietly **forgotten what the caller said at minute 1**.

Today the fix is artisanal: every team rewrites its own context handling. **Whisperer packages it** as an add-on you bolt onto any voice stack (OpenAI Realtime, ElevenLabs Agents, Vapi, Retell). We are customer zero — StudierAI goes to production with it.

## The number — measured, not claimed

Same agent, same prompt, same call. A binary judge asks *"does it recall the minute-1 fact?"* — yes/no, with the turn citation. Batch of **N=10 per side**.

| Side | Recall (N=10) | How |
|---|---|---|
| **base** (no layer) | **0 / 10** | item-capped window → the minute-1 fact falls out by recall time |
| **suggeritore** (Whisperer on) | **10 / 10** | answers from the compact ledger; every verdict carries a `[t16]` citation |

Plus: a split-screen demo, a live HUD that **writes the ledger to screen by itself**, and the recall moment — the base flounders, Whisperer answers exactly, with proof.

## What we built — the precise truth

```text
caller speaks  →  distiller writes the ledger (every 4 turns)  →  injector sends [ledger + question]  →  agent answers from memory  →  judge scores recall (N=10)
```

Whisperer is a memory layer that sits next to the voice agent. Three real pieces, all in the code:

1. **The distiller** — `gpt-4o-mini`, structured output. Every 4 turns it reads the live transcript and writes a typed, append-only **state ledger**: identity · objective · facts · commitments. Every entry cites the transcript turn that proves it. A deterministic `_reconcile` step drops any fact that doesn't point to a real caller turn → **no hallucinated memory**. *This is the IP.*
   → `server/server/app/state_store.py` · `spec/SPEC.md §1–2`

2. **Compact re-grounding** — `compact_input`, the real session-rotation of `SPEC §3`. Each turn, instead of resending the whole conversation, Whisperer sends **`[compact ledger + current question]`**. The agent answers from the distilled state — light while the base re-pays its growing window. *This is the product, and it's measured.*
   → `server/server/app/injector.py`

3. **The judge + harness** — a binary judge reads a recording and returns `remembers: yes/no` with the turn citation. In batch (N=10/side) it produces the number. It runs against the **real workflow**, so the number isn't gamed at the measurement layer.
   → `harness/judge.py` · `harness/runner.py`

## Honesty notes — the limits are the credibility

We under-promise by a hair, on purpose. State these proactively; keep them ready in Q&A.

- **Cost — the important one.** The on-screen counter shows **real, measured** numbers from `server/evidence/fullcontext-qa` (28-turn batch, N=10): base **$0.30** vs Whisperer **$0.23**, **1.30×** — the base re-pays its growing context every turn while Whisperer sends a compact ledger and stays flat. That's the *direction*, measured, labeled **"misurato"**. The dramatic *magnitude* (e.g. 7.6×, or our StudierAI production €4.50 vs €0.13) is a **projection** for a full 10–20 min call — stated verbally, never passed off as the measured on-screen number. On a short 28-turn demo forgetting and cost-magnitude are coupled, so the live gap is a modest 1.3×; on a real call it compounds as the base keeps climbing and Whisperer stays flat. The mock `cost.json` is gone.
- **Why the base forgets.** The base is capped to reproduce the **real 32k hard-cap** managed platforms ship (Retell) and the blind truncation OpenAI documents. The number measures recall *under that real condition* — not an invented handicap.
- **Watchdog (if asked).** Designed, not shipped today (`SPEC §4`). The current build uses periodic re-grounding + compact state — the safe default. The watchdog is the next module.
- **Distiller cost (if asked).** Yes, the layer runs a cheap text model; its overhead is small next to the audio context the base re-pays every turn.

> **Backup evidence** for Q&A lives in `server/evidence/fullcontext-qa/`: a full-context base experiment showing **5/10 even with uncapped context** (context rot), and a **1.30× real, measured** cost divergence in the right direction — *"we measured the direction; we project the magnitude."*

## Repo layout — three owners, parallel work

| Path | Owner | What lives here |
|---|---|---|
| `server/` | Daniele | FastAPI voice agent (from `openai-voice-agent-sdk-sample`) + the layer: distiller, injector, cost meter |
| `harness/` | Gabriele | Binary judge + batch runner (N=10/side) → the number · token/cost meter |
| `web/` | Giovanni | Next.js dashboard: split-screen base vs suggeritore + live memory HUD + cost counter |
| `spec/` | shared | `SPEC.md` (design + JSON contracts) · `PROMPTS.md` (Codex kickoffs) · `fixtures/` (mock data) |

The three folders couple **only** through the JSON contracts in `spec/SPEC.md §7`. Each side builds against `spec/fixtures/`, never against each other — which is what lets `web/` run with **no backend** (mock-first).

## Run it

**Prereqs:** Node 18+, [`uv`](https://docs.astral.sh/uv/), and a `.env` in the repo root (copy `.env.example`) with `OPENAI_API_KEY` (+ `ELEVENLABS_API_KEY` for voice).

**1. The dashboard (the demo)** — runs on fixtures, no backend needed

```bash
cd web
npm install
npm run dev          # http://localhost:3000 — split-screen, live HUD, cost meter
```

**2. The harness (the number)**

```bash
# validate the judge against the bundled fixture
python harness/runner.py --mode fixture

# score N real recordings per side, and aggregate per-run cost
python harness/runner.py --mode live \
  --base recordings/base_run*.jsonl \
  --suggeritore recordings/sug_run*.jsonl \
  --cost-dir recordings/
```

**3. The live server (engine)**

```bash
cd server && make sync                        # npm install + uv sync
cd server/server && uv run python server.py   # FastAPI + /ws on :8000

# generate a fresh batch of recordings (N=10 per side)
uv run python batch_run.py --mode suggeritore --n 10
uv run python batch_run.py --mode base        --n 10
```

The layer is toggled by env vars (read by `server/server/app/`): `SUGGERITORE_MODE` (on/off), `SUGGERITORE_STATE_PATH`, `SUGGERITORE_COST_PATH`, `SUGGERITORE_INJECT_EVERY`, `SUGGERITORE_DISTILL_EVERY`, `SUGGERITORE_BASE_CAP`.

> **Naming:** `suggeritore` is the internal identifier for the layer-on side (the project's original name). The product is **Whisperer**.

## The contracts — `spec/SPEC.md §7`

Four JSON shapes are the only coupling between folders; mocks live in `spec/fixtures/`:

| Shape | What it is |
|---|---|
| `transcript turn` | one line of the call — `[t{n}]`, role, text |
| `state.json` | the append-only ledger — identity · objective · facts · commitments, each with a citing turn |
| `cost_event` | per-turn `{ agent, turn, tokens_in, tokens_out, usd_cumulative }` (`SPEC §5`) |
| `verdict` | the judge output — `{ remembers, citation, … }` (`SPEC §6`) |

## Demo audio

Real recordings of a grandmother (Neapolitan, with consent) live in `web/public/audio/`, named by transcript turn and matching `spec/fixtures/transcript.jsonl` word for word: the gift is **a watch for grandson Luca**, it must arrive **before the 20th** (graduation), order **4471**, delivered to neighbor **sig.ra Pina, interno 3**. At minute 10 the base asks the caller to repeat everything; **Whisperer confirms the deadline and delivery from memory**.

## Built with — an agentic coding stack

**Codex was the primary builder**, and the Codex-signed commit trail is the **proof of build**: the repo's history shows the layer, the judge, and the dashboard built today, in the open. Every feature started from one closed prompt — *"read `spec/SPEC.md`, propose the integration plan into the sample"* — never "build everything". One task at a time, a fresh session per task, gated against hallucination.

| Tool | Role in the build |
|---|---|
| **OpenAI Codex** | Primary builder — server, harness, dashboard · the signed commit trail |
| **Claude Code** (Opus) | Orchestration — scaffold, `SPEC.md`, all fixtures, audio pipeline, verdict view, docs |
| **Context7 MCP** | Fresh library docs at build time — zero hallucinated APIs |
| **shadcn** | Official CLI + MCP for real UI components — never hand-rolled |
| **Magic** (21st.dev) MCP | On-demand component generation |

Discipline that kept it honest: library APIs via Context7, UI via the shadcn CLI, one closed task per session, **mock-first** against `spec/fixtures/` so every folder builds in parallel without touching the others.

## Sponsors used

**OpenAI** Agents SDK · structured outputs (`gpt-4o-mini` distiller + binary judge) · **ElevenLabs** (voice) · **Codex** (the builder, and the commit trail).

## Team

| | Role | |
|---|---|---|
| **Giovanni Di Fonzo** | Product · pitch · dashboard | [LinkedIn](https://www.linkedin.com/in/giovanni-di-fonzo-111692297/) |
| **Daniele Giovanardi** | Engine · server + memory layer | [LinkedIn](https://www.linkedin.com/in/daniele-giovanardi/) |
| **Gabriele Loreti** | Measurement · judge + harness | [LinkedIn](https://www.linkedin.com/in/gabriele-loreti-b4a537155/) |
