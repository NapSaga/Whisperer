# `web/src/lib/fixtures/` — build-time copy of `spec/fixtures/`

These files (`cost.json`, `state.json`, `transcript.jsonl`, `verdicts.json`) are a copy of
the canonical fixtures in the repo-root `spec/fixtures/`, kept **inside `web/`** so the
Next.js build imports them without reaching outside the app directory.

This is what lets `web/` run **mock-first, with no backend** (see the repo-root `README.md`).

**Canonical source:** `spec/fixtures/`. If you change a fixture there, re-sync the copy here.
