"""State ledger store — the typed, append-only artifact of SPEC §1.

The live ledger lives at a runtime file (``server/server/run/state.json``) that
the distiller writes and the injector reads — they couple only through this
path, never through code. When the runtime file does not exist yet, a BLANK
ledger (identity + objective only) is returned, so a fresh live call builds its
state from ONLY what the caller says. ``spec/fixtures/state.json`` is never read
at runtime — it is a mock for the web HUD, not a seed for the live agent.
"""

import json
import os
from pathlib import Path

from pydantic import BaseModel


class Fact(BaseModel):
    id: str
    text: str
    turn: str


class Commitment(BaseModel):
    id: str
    text: str
    turn: str


class StateLedger(BaseModel):
    """Matches `state.json` in SPEC §1 / spec/fixtures/state.json."""

    identity: str
    objective: str
    facts: list[Fact] = []
    commitments: list[Commitment] = []
    last_turn: int = 0


# Resolve relative to this file (not cwd). This file is sdk/whisperer/state_store.py,
# so parents[1] is sdk/ and the runtime ledger lives at sdk/run/state.json.
# (Override with SUGGERITORE_STATE_PATH to relocate it, e.g. under the server.)
_RUNTIME_DEFAULT = Path(__file__).resolve().parents[1] / "run" / "state.json"


def blank() -> StateLedger:
    """The empty starting ledger: identity + objective only, no caller facts.

    A fresh live call starts here so the distiller earns every fact from the
    conversation — the committed fixture is never read at runtime (SPEC §1/§8).
    """
    return StateLedger(
        identity="you are ShopDemo's phone support agent",
        objective="help the caller with their existing order",
        facts=[],
        commitments=[],
        last_turn=0,
    )


def state_path() -> Path:
    """The runtime ledger path: env override, else the local runtime file."""
    override = os.getenv("SUGGERITORE_STATE_PATH")
    return Path(override) if override else _RUNTIME_DEFAULT


def _read(p: Path) -> StateLedger:
    with open(p, "r", encoding="utf-8") as fh:
        return StateLedger.model_validate(json.load(fh))


def load(path: Path | None = None) -> StateLedger:
    """Read the ledger. If the runtime file does not exist yet, return a BLANK
    ledger — the fixture is never read at runtime.
    """
    target = Path(path) if path else state_path()
    return _read(target) if target.exists() else blank()


def current() -> StateLedger:
    """Read the ledger fresh from disk each turn.

    Reading fresh means the injector always sees the latest state the distiller
    has written — no in-process cache to invalidate.
    """
    return load()


def save(state: StateLedger, path: Path | None = None) -> None:
    """Persist the ledger to the same path ``current()`` reads (SPEC §1 shape).

    Written atomically (temp file + replace) so a concurrent reader never sees a
    half-written ledger.
    """
    p = Path(path) if path else state_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(p.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(state.model_dump(), fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    tmp.replace(p)


def reset(path: Path | None = None) -> None:
    """Wipe the runtime ledger back to BLANK so a fresh call starts empty.

    Called at the start of a new suggeritore connection — each rehearsal run
    builds its state from scratch instead of inheriting the previous call's.
    """
    save(blank(), path)
