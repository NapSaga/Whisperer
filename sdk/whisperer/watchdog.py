"""Watchdog — SPEC §4 (the drift guard, opt-in).

After the agent answers, a cheap check (`gpt-4o-mini`, structured output) compares
the response to the state ledger: does it **contradict or ignore** a known fact the
caller just relied on? On drift it names the single violated fact, and the caller
(`server.py`) re-injects *that one fact* and lets the agent answer again — the
faithful §4 behaviour.

    IN  { state, last_user_turn, agent_response }  →  OUT  { drift, fact_id, reinjected_text }

Same Agents-SDK pattern as the distiller: ``Agent(output_type=DriftVerdict)`` +
``Runner.run`` → ``result.final_output``, then a deterministic Python check makes
sure ``fact_id`` actually points at a real fact in the ledger before we trust the
drift — no invented contradictions can leak in (mirrors ``distiller._reconcile``).

Gated by ``SUGGERITORE_WATCHDOG`` (default off). The measured number and the
README honesty note ("periodic re-grounding is the safe default") stay true with
the flag off; turning it on activates the §4 re-answer edge.
"""

import os

from agents import Agent, Runner
from pydantic import BaseModel

from .state_store import StateLedger


class DriftVerdict(BaseModel):
    drift: bool
    fact_id: str
    reinjected_text: str
    reason: str


WATCHDOG_INSTRUCTIONS = """\
You are a drift watchdog for a phone-support call. You receive the memory ledger \
(established facts the caller stated earlier), the caller's last question, and the \
agent's reply. Decide whether the reply CONTRADICTS or IGNORES a known fact the \
caller is relying on right now.

Return structured output:
- `drift`: true ONLY if the reply contradicts a known fact, or asks the caller to \
repeat / re-confirm something already in the ledger that this question depends on. \
A reply that is merely incomplete but not wrong is NOT drift.
- `fact_id`: the exact `id` (e.g. "f3") of the single violated fact. Empty string if no drift.
- `reinjected_text`: the text of that fact, to re-ground the agent. Empty if no drift.
- `reason`: one short clause explaining the verdict.

Be conservative: when unsure, return drift=false. Pick the ONE most relevant fact.
"""

_watchdog_agent = Agent(
    name="Watchdog",
    model="gpt-4o-mini",
    instructions=WATCHDOG_INSTRUCTIONS,
    output_type=DriftVerdict,
)

_NO_DRIFT = DriftVerdict(drift=False, fact_id="", reinjected_text="", reason="")

CORRECTION_PREFIX = "Correction (Whisperer watchdog)"


def is_enabled() -> bool:
    return os.getenv("SUGGERITORE_WATCHDOG", "off").strip().lower() in {"on", "1", "true", "yes"}


def _build_prompt(state: StateLedger, last_user_turn: str, agent_response: str) -> str:
    facts = "\n".join(f"- [{f.id} @ {f.turn}] {f.text}" for f in state.facts) or "(none)"
    commitments = "\n".join(f"- [{c.id} @ {c.turn}] {c.text}" for c in state.commitments) or "(none)"
    return (
        f"Identity: {state.identity}\n"
        f"Objective: {state.objective}\n"
        f"Known facts:\n{facts}\n"
        f"Open commitments:\n{commitments}\n\n"
        f"Caller's last question:\n{last_user_turn}\n\n"
        f"Agent's reply:\n{agent_response}\n\n"
        "Does the reply contradict or ignore a known fact the caller relies on?"
    )


async def check(state: StateLedger, last_user_turn: str, agent_response: str) -> DriftVerdict:
    """Return a drift verdict for ``agent_response`` against the ledger.

    Deterministic guard: a reported drift is only trusted if ``fact_id`` names a
    real fact in ``state``; ``reinjected_text`` falls back to that fact's text so
    the re-grounding always carries the canonical wording, not the model's.
    """
    if not state.facts:
        return _NO_DRIFT
    result = await Runner.run(
        _watchdog_agent, _build_prompt(state, last_user_turn, agent_response)
    )
    verdict = result.final_output
    if not isinstance(verdict, DriftVerdict) or not verdict.drift:
        return _NO_DRIFT

    fact = next((f for f in state.facts if f.id == verdict.fact_id), None)
    if fact is None:
        # Model flagged drift but cited a fact that isn't in the ledger — don't trust it.
        return _NO_DRIFT
    return DriftVerdict(
        drift=True,
        fact_id=fact.id,
        reinjected_text=(verdict.reinjected_text.strip() or fact.text),
        reason=verdict.reason,
    )


def correction_item(verdict: DriftVerdict) -> dict:
    """Developer message that pins the contradicted fact for the re-answer."""
    content = (
        f"{CORRECTION_PREFIX} — your previous reply contradicted or ignored a "
        f"known fact from earlier in this call. Correct it now, staying concise: "
        f"[{verdict.fact_id}] {verdict.reinjected_text}"
    )
    return {"type": "message", "role": "developer", "content": content}
