"""whisperer-sdk — the Whisperer memory layer for long voice-agent calls.

Public API (the two hooks plus the building blocks):

    from whisperer import distiller, injector, state_store
    state = await distiller.distill(state_store.current(), new_turns)
    run_input = injector.compact_input(history, state_store.current())

See the per-module docstrings and the package README for the full contract.
"""

from . import (
    connectors,
    cost_meter,
    distiller,
    injector,
    state_store,
    truncation,
    watchdog,
)
from .connectors import ApiConnector, load_connector
from .cost_meter import CostMeter
from .distiller import distill
from .injector import build_item, build_text, compact_input, is_enabled, with_injection
from .state_store import Commitment, Fact, StateLedger
from .truncation import apply_context_cap
from .watchdog import DriftVerdict
from .watchdog import check as watchdog_check

__all__ = [
    # submodules
    "connectors",
    "cost_meter",
    "distiller",
    "injector",
    "state_store",
    "truncation",
    "watchdog",
    # ledger
    "StateLedger",
    "Fact",
    "Commitment",
    # hooks / building blocks
    "distill",
    "compact_input",
    "with_injection",
    "build_text",
    "build_item",
    "is_enabled",
    "apply_context_cap",
    "CostMeter",
    "DriftVerdict",
    "watchdog_check",
    "ApiConnector",
    "load_connector",
]
