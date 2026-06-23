"""Cost meter — SPEC §5 (server emits, harness/web consume).

Per turn we price the model usage at OpenAI **Realtime audio** rates and
accumulate a running USD total per agent, appending one ``cost_event`` line to a
runtime JSONL the web counter reads.

Demo semantic (read this before trusting the number): the live distiller/agent
run on TEXT tokens, but we deliberately price those tokens at the *audio* rate
(~$32/M in, $64/M out — matching ``spec/fixtures/cost.json`` ``pricing_note``).
This is not a literal bill. It makes the context-retransmission divergence
visible: the base agent re-pays the full conversation context every turn, while
the suggeritore sends only its compact state ledger — so over one call the base
cumulative climbs far faster. The shape is real (per-turn tokens from the SDK);
the unit price is a demo lens, not an invoice.
"""

import json
import os
from pathlib import Path

# OpenAI Realtime audio pricing, USD per 1M tokens (see module docstring / the
# fixture pricing_note). Applied to text tokens on purpose — demo semantic.
AUDIO_USD_PER_M_IN = 32.0
AUDIO_USD_PER_M_OUT = 64.0

# Resolve relative to this file (not cwd), mirroring state_store: this file is
# server/server/app/..., so parents[1] is server/server/ and run/ is the runtime
# location the web counter reads.
_RUNTIME_DEFAULT = Path(__file__).resolve().parents[1] / "run" / "cost_event.jsonl"


def cost_path() -> Path:
    """The runtime cost-event path: env override, else the local runtime file.

    Same resolution style as ``state_store.state_path()`` so batch runs can point
    each run at its own file via ``SUGGERITORE_COST_PATH``.
    """
    override = os.getenv("SUGGERITORE_COST_PATH")
    return Path(override) if override else _RUNTIME_DEFAULT


def _price(tokens_in: int, tokens_out: int) -> float:
    return tokens_in / 1_000_000 * AUDIO_USD_PER_M_IN + tokens_out / 1_000_000 * AUDIO_USD_PER_M_OUT


class CostMeter:
    """One instance per ``Workflow`` so cumulative cost never leaks across runs.

    ``add`` records a turn's token usage and grows ``usd_cumulative``; ``emit``
    appends the resulting ``cost_event`` (SPEC §5 shape) to the cost file.
    """

    def __init__(self, path: Path | None = None) -> None:
        self._path = Path(path) if path else cost_path()
        self.usd_cumulative = 0.0
        self._last_in = 0
        self._last_out = 0

    def add(self, tokens_in: int, tokens_out: int) -> float:
        """Record this turn's usage and add its audio-priced cost to the total."""
        self._last_in = int(tokens_in or 0)
        self._last_out = int(tokens_out or 0)
        self.usd_cumulative += _price(self._last_in, self._last_out)
        return self.usd_cumulative

    def emit(self, agent: str, turn: str) -> dict:
        """Append a ``cost_event`` for the last ``add`` to the cost file (JSONL)."""
        event = {
            "agent": agent,
            "turn": turn,
            "tokens_in": self._last_in,
            "tokens_out": self._last_out,
            "usd_cumulative": round(self.usd_cumulative, 4),
        }
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with open(self._path, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(event, ensure_ascii=False) + "\n")
        return event


def reset(path: Path | None = None) -> None:
    """Truncate the runtime cost file so a fresh call starts with an empty counter.

    Called at the start of a new connection (parallel to ``state_store.reset()``)
    so the web counter shows only the current call. Unlike the state reset, this
    runs for BOTH base and suggeritore modes — both emit cost events.
    """
    p = Path(path) if path else cost_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "w", encoding="utf-8") as fh:
        fh.write("")
