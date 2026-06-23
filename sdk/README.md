# whisperer-sdk

The drop-in, model-agnostic **memory layer** for long voice-agent calls, extracted
from the [Whisperer](https://whisperer-xi.vercel.app) demo as an installable package.

A cheap model distills the live conversation into a typed, evidence-backed **state
ledger**, and re-grounds the agent every turn from the compact ledger instead of
re-paying the growing audio context — so the agent never loses the thread.

## What's in the package

| Module | Role |
|---|---|
| `state_store` | The append-only ledger — `StateLedger{identity, objective, facts, commitments}` |
| `distiller` | `distill(state, new_turns)` — `gpt-4o-mini` extracts typed facts/commitments (SPEC §2) |
| `injector` | `compact_input(history, state)` — re-grounds the agent from the ledger (SPEC §3) |
| `watchdog` | `check(state, last_user_turn, agent_response)` — drift guard (SPEC §4) |
| `cost_meter` | `CostMeter` — per-turn token/USD accounting (SPEC §5) |
| `truncation` | `apply_context_cap(history, n)` — base-mode context window |
| `connectors` | `ApiConnector` protocol + `load_connector()` — per-client tool backend |

## Install

```bash
pip install -e .            # from this directory
```

## The two hooks

Wherever transcribed text enters your agent's prompt, wire the two functions:

```python
from whisperer import state_store, distiller, injector

# every N turns: distill the new transcript turns into the ledger
state = await distiller.distill(state_store.current(), new_turns)
state_store.save(state)

# every turn: re-ground the agent from the compact ledger instead of the full history
run_input = injector.compact_input(conversation_history, state_store.current())
```

Toggle behaviour with env vars: `SUGGERITORE_MODE`, `SUGGERITORE_WATCHDOG`,
`SUGGERITORE_INJECT_EVERY`, `SUGGERITORE_STATE_PATH`, `SUGGERITORE_COST_PATH`.
