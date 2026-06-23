"""Live distiller — SPEC §2.

A cheap model (`gpt-4o-mini`) turns the live conversation into the typed,
append-only state ledger. It runs via the Agents SDK with
``output_type=StateLedger`` (the same pydantic schema the injector and HUD use),
so there is no raw OpenAI parse — ``result.final_output`` is a validated
``StateLedger``.

The model proposes the updated ledger; ``_reconcile`` then enforces the SPEC §1
invariants deterministically in Python: append-only by id, every new entry
carries a *real* turn ref from the provided window, repetition is dropped, and
``last_turn`` is set from the evidence — so nothing invented can leak in.
"""

import json
import re

from agents import Agent, Runner

from .state_store import Commitment, Fact, StateLedger

DISTILLER_INSTRUCTIONS = """\
You are a memory distiller for a phone-support call. You receive the current state \
ledger and the new transcript turns since the last update, and you return the UPDATED \
ledger as structured output.

Rules:
- Append-only: keep every existing fact and commitment exactly as given (same id, text, turn).
- Add a new fact for each concrete, durable fact the CALLER states that is not already \
in the ledger. Add a new commitment for each promise made about what will be done.
- Every new entry's `turn` MUST be the exact turn id (e.g. "t12") from the provided new \
turns where it was stated. Never invent a turn id.
- Update `objective` only if it clearly shifts; otherwise keep it. Keep `identity` unchanged.
- Discard pleasantries, small talk, the agent's own filler, and anything already known.
- Each text is one short clause. Stay compact — the win is fewer tokens, not a log.
"""

_distiller_agent = Agent(
    name="Distiller",
    model="gpt-4o-mini",
    instructions=DISTILLER_INSTRUCTIONS,
    output_type=StateLedger,
)


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower()).strip(" .,;:!?")


def _turn_num(turn) -> int | None:
    if not isinstance(turn, str):
        return None
    m = re.search(r"\d+", turn)
    return int(m.group()) if m else None


def _next_index(ids: list[str], prefix: str) -> int:
    nums = [
        int(s[len(prefix):])
        for s in ids
        if s.startswith(prefix) and s[len(prefix):].isdigit()
    ]
    return (max(nums) + 1) if nums else 1


def _build_prompt(state: StateLedger, new_turns: list[dict]) -> str:
    state_json = json.dumps(state.model_dump(), ensure_ascii=False, indent=2)
    turns_json = json.dumps(new_turns, ensure_ascii=False, indent=2)
    return (
        "Current state ledger:\n"
        + state_json
        + "\n\nNew transcript turns since the last update:\n"
        + turns_json
        + "\n\nReturn the updated state ledger."
    )


def _reconcile(
    state: StateLedger, model_out: StateLedger, new_turns: list[dict]
) -> StateLedger:
    caller_turns = {
        t.get("turn") for t in new_turns if isinstance(t, dict) and t.get("role") == "caller"
    }
    valid_turns = {t.get("turn") for t in new_turns if isinstance(t, dict)}

    # Facts: caller-stated, real caller-turn ref, not already known.
    facts = list(state.facts)
    seen = {_norm(f.text) for f in facts}
    fi = _next_index([f.id for f in facts], "f")
    for f in model_out.facts:
        text = (f.text or "").strip()
        if not text or _norm(text) in seen or f.turn not in caller_turns:
            continue
        facts.append(Fact(id=f"f{fi}", text=text, turn=f.turn))
        seen.add(_norm(text))
        fi += 1

    # Commitments: any real turn ref in the window (agent commitments cite agent turns).
    comms = list(state.commitments)
    seen_c = {_norm(c.text) for c in comms}
    ci = _next_index([c.id for c in comms], "c")
    for c in model_out.commitments:
        text = (c.text or "").strip()
        if not text or _norm(text) in seen_c or c.turn not in valid_turns:
            continue
        comms.append(Commitment(id=f"c{ci}", text=text, turn=c.turn))
        seen_c.add(_norm(text))
        ci += 1

    objective = (model_out.objective or "").strip() or state.objective
    identity = state.identity or (model_out.identity or "").strip()

    last_turn = state.last_turn
    for t in new_turns:
        n = _turn_num(t.get("turn")) if isinstance(t, dict) else None
        if n is not None:
            last_turn = max(last_turn, n)

    return StateLedger(
        identity=identity,
        objective=objective,
        facts=facts,
        commitments=comms,
        last_turn=last_turn,
    )


async def distill(state: StateLedger, new_turns: list[dict]) -> StateLedger:
    """Distill ``new_turns`` into ``state``, returning the updated ledger.

    IN  ``{ state, new_turns: [{turn, role, text}] }``  OUT  updated ``state``.
    """
    if not new_turns:
        return state
    result = await Runner.run(_distiller_agent, _build_prompt(state, new_turns))
    model_out = result.final_output
    if not isinstance(model_out, StateLedger):
        return state  # unexpected output shape — keep prior state
    return _reconcile(state, model_out, new_turns)
