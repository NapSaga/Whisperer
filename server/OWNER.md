# server/ — owner: Daniele

FastAPI voice agent **+ the memory layer**.

- Clone `openai-voice-agent-sdk-sample` and bring its **backend** in here.
- Add: distiller (`SPEC §2`) → `state.json` every 4 turns · injection (`SPEC §3`) ·
  watchdog (`SPEC §4`, later task).
- **Emit** `transcript.jsonl`, `state.json`, `cost_event` exactly as in `SPEC §7`
  (web + harness read these).
- Keys from project-root `.env`. Kickoff prompt: `spec/PROMPTS.md §1`.
