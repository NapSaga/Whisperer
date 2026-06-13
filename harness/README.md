# harness/ — owner: Gabriele

The measurement — **the number**.

- Binary judge (`SPEC §6`), OpenAI **structured outputs**: transcript + seeded_fact →
  verdict with citation.
- Batch runner: **N=10 per side** → `base X/10, suggeritore Y/10`.
- Token/cost meter check (`SPEC §5`): `--cost <file>` for a single `cost.json`, or
  `--cost-dir <dir>` to aggregate the per-run files `batch_run.py` emits
  (`base_run*_cost.jsonl` / `sug_run*_cost.jsonl`) into a mean base-vs-suggeritore
  cost. The ratio is direction-aware — it names whichever side is dearer, since the
  divergence can invert (a capped base is cheap, the suggeritore carries injected state).
- Validate on `spec/fixtures/transcript.jsonl` + `verdicts.json` **before** the live server.
  Kickoff prompt: `spec/PROMPTS.md §2`.
