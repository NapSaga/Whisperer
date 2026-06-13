"""State ledger store — the typed, append-only artifact of SPEC §1.

Task 1 reads the ledger from disk (defaults to ``spec/fixtures/state.json``).
The distiller (next task) will write the live file the injector reads, so the
two couple only through this JSON path, never through code.
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


# server runs from server/server/; the fixture lives at suggeritore/spec/fixtures/.
_FIXTURE_DEFAULT = Path(__file__).resolve().parents[3] / "spec" / "fixtures" / "state.json"


def state_path() -> Path:
    override = os.getenv("SUGGESTORE_STATE_PATH")
    return Path(override) if override else _FIXTURE_DEFAULT


def load(path: Path | None = None) -> StateLedger:
    p = path or state_path()
    with open(p, "r", encoding="utf-8") as fh:
        return StateLedger.model_validate(json.load(fh))


def current() -> StateLedger:
    """Read the ledger fresh from disk each turn.

    Reading fresh means the injector always sees the latest state the distiller
    has written — no in-process cache to invalidate.
    """
    return load()
