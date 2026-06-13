"""Re-grounding injector — SPEC §3 (periodic, the safe default).

Before the agent answers, prepend a compact developer message built from the
state ledger (identity + objective + facts + commitments). Periodic cadence:
inject on the first turn and every N turns thereafter.

Mode is selected by the ``SUGGESTORE_MODE`` env var (off = base agent, the
unmodified sample). The injected item is tagged so a prior copy can be stripped
each turn — the history carries at most one compact state message, never a
growing log.
"""

import os

from app.state_store import StateLedger

INJECTION_PREFIX = "Memory ledger (Il Suggeritore)"
_INJECT_ROLE = "developer"


def is_enabled() -> bool:
    return os.getenv("SUGGESTORE_MODE", "off").strip().lower() in {"on", "1", "true", "yes"}


def _every() -> int:
    try:
        n = int(os.getenv("SUGGESTORE_INJECT_EVERY", "4"))
    except ValueError:
        n = 4
    return max(1, n)


def should_inject(turn: int) -> bool:
    if turn <= 0:
        return False
    every = _every()
    return turn == 1 or turn % every == 0


def _is_injection(item) -> bool:
    return (
        isinstance(item, dict)
        and item.get("role") == _INJECT_ROLE
        and isinstance(item.get("content"), str)
        and item["content"].startswith(INJECTION_PREFIX)
    )


def strip(history: list) -> None:
    """Remove any prior injection item in place, keeping history bounded."""
    history[:] = [it for it in history if not _is_injection(it)]


def build_text(state: StateLedger) -> str:
    lines = [
        f"{INJECTION_PREFIX} — established facts from earlier in this call. "
        "Stay grounded in them and do not ask the caller to repeat what is already known.",
        f"Identity: {state.identity}",
        f"Objective: {state.objective}",
    ]
    if state.facts:
        lines.append("Known facts:")
        lines += [f"- [{f.turn}] {f.text}" for f in state.facts]
    if state.commitments:
        lines.append("Open commitments:")
        lines += [f"- [{c.turn}] {c.text}" for c in state.commitments]
    return "\n".join(lines)


def build_item(state: StateLedger) -> dict:
    return {"type": "message", "role": _INJECT_ROLE, "content": build_text(state)}


def with_injection(history: list, state: StateLedger) -> list:
    """Return a NEW list: ``history`` with the re-grounding item placed just
    before the last user turn, so the agent reads the grounding then the
    question. Does not mutate ``history``.
    """
    item = build_item(state)
    idx = len(history)
    for i in range(len(history) - 1, -1, -1):
        if isinstance(history[i], dict) and history[i].get("role") == "user":
            idx = i
            break
    return history[:idx] + [item] + history[idx:]
