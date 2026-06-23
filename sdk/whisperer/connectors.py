"""API connector contract + loader (roadmap #5).

The agent's tools (`get_past_orders`, `submit_refund_request`) call into a
*connector* module. The demo connector (`api_shopdemo`) returns fixture data; a
real deployment swaps in a per-client module that hits the client's real systems
(order DB, refund service, CRM) while implementing the same interface — so the
agent and the rest of the layer never change.

Select the connector at runtime with ``WHISPERER_API_CONNECTOR`` (default
``api_shopdemo``). A bare name is resolved inside the connector package; a dotted
path (e.g. ``mycompany.connectors.api_studierai``) is imported as-is, so a client
can ship its connector in its own package.
"""

import importlib
import os
from types import ModuleType
from typing import Protocol, runtime_checkable

# Where bare connector names live. The SDK is package-agnostic: the host app
# sets WHISPERER_CONNECTOR_PKG to the package holding its connector modules
# (the demo server uses ``app``). A dotted ``name`` bypasses this entirely.
_DEFAULT_CONNECTOR_PKG = "app"
_DEFAULT_CONNECTOR = "api_shopdemo"

# The interface every connector must implement.
_REQUIRED = ("get_past_orders", "submit_refund_request")


@runtime_checkable
class ApiConnector(Protocol):
    """The contract a connector module must satisfy."""

    def get_past_orders(self) -> list[dict]:
        """Return the caller's past orders (list of order dicts)."""
        ...

    def submit_refund_request(self, order_number: str) -> str:
        """Submit a refund for ``order_number``; return a status string."""
        ...


def load_connector(name: str | None = None) -> ModuleType:
    """Import and return the configured connector module.

    Resolution order: explicit ``name`` arg → ``WHISPERER_API_CONNECTOR`` env →
    the demo connector. Raises ``ImportError`` if the module is missing or does
    not implement the full interface — fail loud at startup, not mid-call.
    """
    name = name or os.getenv("WHISPERER_API_CONNECTOR", _DEFAULT_CONNECTOR)
    pkg = os.getenv("WHISPERER_CONNECTOR_PKG", _DEFAULT_CONNECTOR_PKG)
    target = name if "." in name else f"{pkg}.{name}"
    module = importlib.import_module(target)

    missing = [fn for fn in _REQUIRED if not callable(getattr(module, fn, None))]
    if missing:
        raise ImportError(
            f"connector '{target}' is missing required function(s): {', '.join(missing)}. "
            f"A connector must implement: {', '.join(_REQUIRED)}."
        )
    return module
