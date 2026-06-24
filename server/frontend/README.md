# `server/frontend/` — the LIVE voice client (not the dashboard)

This is the **interactive voice client** of the demo: a Next.js app with push-to-talk
audio that connects over a **WebSocket** to the FastAPI engine in `server/server/server.py`.
You talk, it streams audio to the agent and plays the reply.

**Do not confuse it with `web/`.** They are two different front-ends:

| Folder | What it is | Needs a backend? |
|---|---|---|
| `server/frontend/` (this) | Live voice client — push-to-talk, real WebSocket to `server.py` | **Yes** — the FastAPI server on `:8000` |
| `web/` (repo root) | Static dashboard/HUD — split-screen base vs suggeritore, cost meter, replay of fixtures | **No** — runs mock-first on `spec/fixtures/` |

Referenced by `server/Makefile` (`make sync` / `make serve`) and `server/README.md`.
See the repo-root `README.md` "Repo layout" for the full picture.
