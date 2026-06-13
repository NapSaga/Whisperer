# harness/ — owner: Gabriele

The measurement — **the number**.

- Binary judge (`SPEC §6`), OpenAI **structured outputs**: transcript + seeded_fact →
  verdict with citation.
- Batch runner: **N=10 per side** → `base X/10, suggeritore Y/10`.
- Token/cost meter check (`SPEC §5`).
- Validate on `spec/fixtures/transcript.jsonl` + `verdicts.json` **before** the live server.
  Kickoff prompt: `spec/PROMPTS.md §2`.
