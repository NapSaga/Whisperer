"""State ledger store — the typed, append-only artifact of SPEC §1.

The live ledger lives at a runtime file (``server/server/run/state.json``) that
the distiller writes and the injector reads — they couple only through this
path, never through code. The committed ``spec/fixtures/state.json`` is a
read-only seed: when the runtime file does not exist yet, it is read and
returned, but it is never written to.
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


# Resolve relative to this file (not cwd). This file is server/server/app/...,
# so parents[1] is server/server/ and parents[3] is the repo root (suggeritore/).
_RUNTIME_DEFAULT = Path(__file__).resolve().parents[1] / "run" / "state.json"
_FIXTURE_SEED = Path(__file__).resolve().parents[3] / "spec" / "fixtures" / "state.json"


def state_path() -> Path:
    """The runtime ledger path: env override, else the local runtime file."""
    override = os.getenv("SUGGERITORE_STATE_PATH")
    return Path(override) if override else _RUNTIME_DEFAULT


def _read(p: Path) -> StateLedger:
    with open(p, "r", encoding="utf-8") as fh:
        return StateLedger.model_validate(json.load(fh))


def load(path: Path | None = None) -> StateLedger:
    """Read the ledger. If the runtime file does not exist yet, seed from the
    read-only fixture (read and return it) — never write to the fixture.
    """
    target = Path(path) if path else state_path()
    return _read(target if target.exists() else _FIXTURE_SEED)


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
