"""Headless multi-run driver — produces the batch transcripts for the judge.

Runs the REAL agent N times over a fixed caller script and writes one
SPEC §7 transcript per run. It does NOT reimplement the layer: it imports the
live ``Workflow`` from ``server.py`` and drives it through a minimal headless
connection stub, so injection (SPEC §3), the base context cap
(``SUGGERITORE_BASE_CAP``) and the distiller (SPEC §2) fire exactly as they do
over the websocket — honoring ``SUGGERITORE_MODE``. If the driver forged any of
that, the judge's number would be fake.

Usage:
    uv run python batch_run.py --mode base        --n 10
    uv run python batch_run.py --mode suggeritore  --n 10

Output (SPEC §7 shape ``{ turn, role:"caller"|"agent", text, ts }``):
    recordings/base_run{i}.jsonl   (base)
    recordings/sug_run{i}.jsonl    (suggeritore)

The fixed script mirrors spec/fixtures/transcript.jsonl: order 4471, a watch
gifted to grandson Luca for his graduation, must arrive before the 20th, deliver
to the neighbor sig.ra Pina interno 3 (caller's buzzer is broken) — seeded in the
first turns, then filler, then the recall question. The cadence is chosen so the
recall lands on an injection turn (turn 8): the distiller earns the facts after
turn 4, and turn-8 injection re-grounds the agent with them. The suggeritore side
starts from a CLEAN runtime ledger (identity + objective only, no caller facts) at
a per-run state path, so the distiller has to earn the deadline/delivery itself
and never reads the committed fixture seed. spec/fixtures/ is never touched.
"""

import argparse
import asyncio
import json
import os
from pathlib import Path

# Resolve paths relative to this file, not cwd. batch_run.py lives at
# server/server/batch_run.py, so parents[2] is the repo root.
_HERE = Path(__file__).resolve().parent          # server/server
_REPO_ROOT = _HERE.parents[1]                     # repo root
_BATCH_STATE_DIR = _HERE / "run" / "batch"        # under run/ (gitignored)

# Load the same env as server.py (../.env relative to server/server), plus the
# repo-root .env as a fallback. Done before importing the agent/server modules.
from dotenv import load_dotenv  # noqa: E402

load_dotenv(dotenv_path=str(_REPO_ROOT / ".env"), override=True)
load_dotenv(dotenv_path=str(_HERE.parent / ".env"), override=True)

from app import state_store  # noqa: E402
from app.agent_config import starting_agent  # noqa: E402
from app.state_store import StateLedger  # noqa: E402
from app.utils import is_new_output_item  # noqa: E402
from server import Workflow  # noqa: E402  — the live class, reused verbatim


# Fixed caller script — the fixtures scenario. Facts are seeded in turns 1–3 (so
# the turn-4 distiller can extract them), then ~4 filler turns, then the recall
# question lands on caller turn 8 (an injection turn).
CALLER_SCRIPT = [
    "Buongiorno, chiamo per l'ordine 4471, è un orologio, il regalo per mio nipote Luca.",
    "Luca si laurea il venti, e l'orologio glielo regalo per la laurea: deve arrivare prima del venti.",
    "Mi raccomando per la consegna: a casa mia il citofono è rotto, lasciatelo dalla vicina, la signora Pina, interno tre.",
    "Va bene. Posso pagare alla consegna?",
    "E se non sono in casa quando arriva?",
    "Perfetto, la ringrazio molto.",
    "Ah, un'ultima cosa che mi ero quasi dimenticata.",
    "Senti, scusa: ma arriva in tempo? E dove lo lasciate?",
]

# Clean slate for the suggeritore side: identity + objective only, NO caller
# facts. The distiller must earn the watch/deadline/Pina from the conversation.
_CLEAN_LEDGER = StateLedger(
    identity="you are ShopDemo's phone support agent",
    objective="help the caller with their existing order",
    facts=[],
    commitments=[],
    last_turn=0,
)

# Heuristic recall markers — printed per run for the operator, never enforced.
_RECALL_MARKERS = ("orologio", "vent", "20", "pina", "laurea")


def _ts(turn_no: int) -> str:
    """Synthesize an increasing ``MM:SS`` timestamp (fixture shape)."""
    secs = 18 + (turn_no - 1) * 13
    return f"{secs // 60:02d}:{secs % 60:02d}"


class HeadlessConnection:
    """Mirrors WebsocketHelper's history semantics with no websocket I/O.

    Workflow.run only uses show_user_input / handle_new_item /
    text_output_complete — replicated here exactly so the conversation history
    (and thus injection, the cap, and to_input_list rollover) behaves as live.
    """

    def __init__(self, initial_agent):
        self.history: list = []
        self.latest_agent = initial_agent
        self.partial_response = ""

    async def show_user_input(self, user_input: str):
        self.history.append(
            {"type": "message", "role": "user", "content": user_input}
        )
        return (self.history, self.latest_agent)

    async def handle_new_item(self, event):
        # Append produced items (tool calls/results/messages) to history exactly
        # like WebsocketHelper. Text deltas are yielded by Workflow.run itself.
        if is_new_output_item(event):
            self.history.append(event.item.to_input_item())  # type: ignore

    async def text_output_complete(self, output, is_done=False):
        if is_done:
            self.partial_response = ""
            self.latest_agent = output.last_agent
            self.history = output.to_input_list()


async def _drain_distill(wf: Workflow) -> None:
    """Wait out the fire-and-forget distiller so state.json is written before the
    next injection turn reads it. Cadence/trigger are unchanged — this only
    awaits completion, which the live websocket loop does implicitly over time.
    """
    while getattr(wf, "_distilling", False):
        await asyncio.sleep(0.05)


async def run_one(mode: str, run_idx: int, out_dir: Path) -> list[dict]:
    """Drive the real Workflow once over CALLER_SCRIPT, returning the captured
    SPEC §7 transcript turns.
    """
    prefix = "base_run" if mode == "base" else "sug_run"
    if mode == "suggeritore":
        os.environ["SUGGERITORE_MODE"] = "on"
        state_path = _BATCH_STATE_DIR / f"sug_run{run_idx}_state.json"
        os.environ["SUGGERITORE_STATE_PATH"] = str(state_path)
        state_store.save(_CLEAN_LEDGER, state_path)  # clean slate per run
    else:
        os.environ["SUGGERITORE_MODE"] = "off"
        os.environ.pop("SUGGERITORE_STATE_PATH", None)

    # Per-run cost file beside the transcript, so each recorded run carries its
    # own real cost (§5). Unlink any stale copy so re-runs start fresh; a fresh
    # Workflow already means a fresh CostMeter (no cumulative leak across runs).
    cost_path = out_dir / f"{prefix}{run_idx}_cost.jsonl"
    os.environ["SUGGERITORE_COST_PATH"] = str(cost_path)
    cost_path.unlink(missing_ok=True)

    conn = HeadlessConnection(starting_agent)
    wf = Workflow(conn)

    turns: list[dict] = []
    tno = 0
    for line in CALLER_SCRIPT:
        tno += 1
        turns.append({"turn": f"t{tno}", "role": "caller", "text": line, "ts": _ts(tno)})

        agent_text = ""
        async for delta in wf.run(line):
            agent_text += delta

        tno += 1
        turns.append(
            {"turn": f"t{tno}", "role": "agent", "text": agent_text, "ts": _ts(tno)}
        )

        # Ensure any scheduled distillation has landed before the next turn's
        # injection reads the ledger (only blocks on turns that actually distill).
        await _drain_distill(wf)

    return turns


def _validate(turns: list[dict]) -> None:
    for t in turns:
        if set(t.keys()) != {"turn", "role", "text", "ts"}:
            raise ValueError(f"turn keys off contract: {t!r}")
        if t["role"] not in ("caller", "agent"):
            raise ValueError(f"bad role: {t!r}")
        if not isinstance(t["turn"], str) or not isinstance(t["text"], str):
            raise ValueError(f"bad field types: {t!r}")


def _recalled(turns: list[dict]) -> bool:
    last_agent = next(
        (t["text"] for t in reversed(turns) if t["role"] == "agent"), ""
    )
    low = last_agent.lower()
    return any(m in low for m in _RECALL_MARKERS)


async def main_async(mode: str, n: int, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    _BATCH_STATE_DIR.mkdir(parents=True, exist_ok=True)
    prefix = "base_run" if mode == "base" else "sug_run"

    recalled = 0
    for i in range(1, n + 1):
        turns = await run_one(mode, i, out_dir)
        _validate(turns)
        path = out_dir / f"{prefix}{i}.jsonl"
        with open(path, "w", encoding="utf-8") as fh:
            for t in turns:
                fh.write(json.dumps(t, ensure_ascii=False) + "\n")
        hit = _recalled(turns)
        recalled += hit
        print(f"  {path.name}: {len(turns)} turns, recall={'yes' if hit else 'no'}")

    print(
        f"\n{mode}: wrote {n} run(s) to {out_dir}/  "
        f"({recalled}/{n} contain the recall answer)"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Headless batch transcript driver")
    parser.add_argument("--mode", choices=["base", "suggeritore"], required=True)
    parser.add_argument("--n", type=int, default=10)
    parser.add_argument(
        "--out-dir",
        default=str(_REPO_ROOT / "recordings"),
        help="output directory (default: repo-root recordings/)",
    )
    args = parser.parse_args()
    asyncio.run(main_async(args.mode, args.n, Path(args.out_dir)))


if __name__ == "__main__":
    main()
