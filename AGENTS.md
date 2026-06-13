# AGENTS.md — Il Suggeritore

> A drop-in memory layer for long voice-agent calls. A cheap model distills the live
> conversation into a typed, evidence-backed **state ledger** and re-grounds the agent so
> it never loses the thread. Model-agnostic add-on (OpenAI Realtime, ElevenLabs Agents, …).
> Built at HackRome — 13 Jun 2026.

## The build in one screen
Run the **same** agent (same prompt, same voice) twice over one long call:
**base** (no layer) vs **suggeritore** (layer on). At minute 10 the base forgets a fact
seeded at minute 1; the suggeritore recalls it — and the judge proves it on N runs.
Read **`spec/SPEC.md`** before writing any code. It is the source of truth.

## Repo layout — three owners, parallel work
| Path | Owner | What lives here |
|---|---|---|
| `server/` | Daniele | FastAPI voice agent (from `openai-voice-agent-sdk-sample`) + the layer: distiller, injector, watchdog |
| `harness/` | Gabriele | Binary judge + batch runner (N=10/side) → **the number**; token/cost meter |
| `web/` | Giovanni | Next.js dashboard: split-screen base vs suggeritore + live **memory HUD** + cost counter |
| `spec/` | shared | `SPEC.md` (design + JSON contracts), `PROMPTS.md` (paste-ready Codex kickoffs), `fixtures/` (mock data) |

## How to work
- The three folders couple **only** through the JSON contracts in `SPEC.md §7`. Build
  against `spec/fixtures/`, never against each other. This is what lets web run before any
  server exists.
- **Codex is the primary builder.** First prompt is always
  *"read AGENTS.md and spec/SPEC.md, propose the integration plan into the sample"* —
  never "build everything". One closed task at a time, fresh session per task.
- **Mock-first**: `web/` must run on `spec/fixtures/*` by **13:00**, before anything is live.
- Reused scaffolding (`openai-voice-agent-sdk-sample`, `ai-elements`, `elevenlabs-python`)
  is declared, not hidden. The layer, judge and dashboard are built today.

## Git
- One repo, branch `main`, **no PRs**. Each owner commits only inside their folder →
  parallel pushes, no conflicts. `git pull --rebase` before every push, ~every 25 min.
- **First push 10:45 (Giovanni)**: repo + this file + `spec/` + README. The timestamp
  certifies the build starts today.
- Integration windows **13:30** and **15:00**, ordered: `server → harness → web`.
  Whoever pushes announces "pushing" first; the other two wait and rebase.
- Commit prefix = folder + what: `server: watchdog v1`, `harness: judge N=10`.
  Keep Codex-signed commits — the trail is the proof of build (OpenAI prize).
- Tags at milestones: `run-1330` (the number) · `freeze-1630` · `demo-final`.

## Hard checkpoints — past these, cut, don't debug
- **13:00** web runs on mock · **13:30** the number exists · **16:30** full freeze + backup video.
- Zero new features after 14:00.

## Minimum winning demo — the floor
If by 16:30 you have these 4, the demo exists:
1. base agent forgets (recorded, real) · 2. suggeritore remembers (live) ·
3. split-screen · 4. memory HUD writing itself.
Cut order if behind: **watchdog → cost counter → judge drill-down**. Never cut: the judge number.

Status @ 13:30: ✅ 1 (base 0/10, recorded) · ✅ 2 (suggeritore 10/10, live) · ✅ 3 · ✅ 4 — **demo floor complete**.

## Keys
`.env` (OpenAI + ElevenLabs) is in the project root, gitignored, never committed.
