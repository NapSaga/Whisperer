"""Headless multi-run driver — produces the batch transcripts for the judge.

Runs the REAL agent N times over a fixed caller script and writes one
SPEC §7 transcript per run. It does NOT reimplement the layer: it imports the
live ``Workflow`` from ``server.py`` and drives it through a minimal headless
connection stub, so injection (SPEC §3), the base context cap
(``SUGGERITORE_BASE_CAP``) and the distiller (SPEC §2) fire exactly as they do
over the websocket — honoring ``SUGGERITORE_MODE``. If the driver forged any of
that, the judge's number would be fake.

Usage:
    uv run python batch_run.py --mode base        --n 10            # scenario nonna
    uv run python batch_run.py --mode suggeritore  --n 10 --scenario reso
    uv run python batch_run.py --mode base --scenario long-call --turns 20
    uv run python batch_run.py --mode suggeritore --scenario studierai-oral  # real StudierAI oral exam

A scenario may declare ``agent_profile`` in index.json (e.g. ``studierai_oral``)
to pick the agent persona for that run; otherwise the WHISPERER_AGENT_PROFILE env
var, then the ShopDemo demo agent, are used.

Output (SPEC §7 shape ``{ turn, role:"caller"|"agent", text, ts }``):
    recordings/{scenario}_base_run{i}.jsonl   (base)
    recordings/{scenario}_sug_run{i}.jsonl    (suggeritore)

The caller script comes from spec/fixtures/scenarios/<id>.jsonl (selected with
--scenario, default ``nonna``); the manifest index.json also carries the clean
identity/objective and optional console recall_markers. The default ``nonna``
scenario mirrors spec/fixtures/transcript.jsonl: order 4471, a watch gifted to
grandson Luca for his graduation, must arrive before the 20th, deliver to the
neighbor sig.ra Pina interno 3 — seeded in the first turns, then filler, then the
recall question as the last line. Each scenario's recall question is its last
script line; the cadence puts it on an injection turn so the distiller earns the
facts and injection re-grounds the agent with them. The suggeritore side starts
from a CLEAN runtime ledger (identity + objective only, no caller facts) at a
per-run state path, so the distiller has to earn the deadline/delivery itself and
never reads any committed seed. spec/fixtures/ is never written to.
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

from whisperer import state_store  # noqa: E402
from app.agent_config import get_agent  # noqa: E402
from whisperer.state_store import StateLedger  # noqa: E402
from app.utils import is_new_output_item  # noqa: E402
from server import Workflow  # noqa: E402  — the live class, reused verbatim


# Scenarios live in spec/fixtures/scenarios/ — a manifest (index.json) plus one
# caller script per scenario (one turn per line). The script seeds facts in the
# first turns (so the turn-4 distiller can extract them), then filler, then the
# recall question as the LAST line. See ROADMAP.md #2/#3.
_SCENARIOS_DIR = _REPO_ROOT / "spec" / "fixtures" / "scenarios"

# Generic clean-ledger defaults when a scenario is loaded straight from a script
# file (--script) with no manifest entry.
_DEFAULT_IDENTITY = "you are ShopDemo's phone support agent"
_DEFAULT_OBJECTIVE = "help the caller with their existing order"


def _read_script(path: Path) -> list[str]:
    """Load a caller script: one JSON object per line, ``{"text": "..."}``."""
    lines: list[str] = []
    with open(path, encoding="utf-8") as fh:
        for raw in fh:
            raw = raw.strip()
            if not raw:
                continue
            obj = json.loads(raw)
            lines.append(obj["text"])
    if not lines:
        raise ValueError(f"empty caller script: {path}")
    return lines


def load_scenario(
    scenario_id: str | None,
    script_path: str | None = None,
    turns: int | None = None,
) -> dict:
    """Resolve a scenario into ``{id, script, identity, objective, recall_markers}``.

    Either ``scenario_id`` (manifest lookup in index.json) or ``script_path``
    (direct script file, manifest bypassed) must be given; ``script_path`` wins.
    ``turns`` optionally caps the call length to the first N caller turns, always
    re-appending the last script line so the recall question is preserved at any
    length (used to sweep call duration — ROADMAP #3).
    """
    if script_path:
        script = _read_script(Path(script_path))
        scenario = {
            "id": Path(script_path).stem,
            "script": script,
            "identity": _DEFAULT_IDENTITY,
            "objective": _DEFAULT_OBJECTIVE,
            "recall_markers": [],
            "agent_profile": None,
        }
    else:
        if not scenario_id:
            raise ValueError("load_scenario needs scenario_id or script_path")
        manifest = json.loads((_SCENARIOS_DIR / "index.json").read_text(encoding="utf-8"))
        entry = next(
            (s for s in manifest["scenarios"] if s["id"] == scenario_id), None
        )
        if entry is None:
            known = ", ".join(s["id"] for s in manifest["scenarios"])
            raise SystemExit(f"unknown scenario {scenario_id!r}; known: {known}")
        script = _read_script(_SCENARIOS_DIR / entry["script"])
        scenario = {
            "id": entry["id"],
            "script": script,
            "identity": entry.get("identity", _DEFAULT_IDENTITY),
            "objective": entry.get("objective", _DEFAULT_OBJECTIVE),
            "recall_markers": entry.get("recall_markers", []),
            "agent_profile": entry.get("agent_profile"),
        }

    if turns is not None and turns < len(scenario["script"]):
        recall = scenario["script"][-1]
        capped = scenario["script"][:turns]
        if not capped or capped[-1] != recall:
            capped.append(recall)
        scenario["script"] = capped

    return scenario


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


def _prefix(scenario_id: str, mode: str) -> str:
    """Per-scenario recording prefix, e.g. ``reso_base_run`` / ``reso_sug_run``."""
    side = "base_run" if mode == "base" else "sug_run"
    return f"{scenario_id}_{side}"


async def run_one(mode: str, run_idx: int, out_dir: Path, scenario: dict) -> list[dict]:
    """Drive the real Workflow once over the scenario's caller script, returning
    the captured SPEC §7 transcript turns.
    """
    prefix = _prefix(scenario["id"], mode)
    if mode == "suggeritore":
        os.environ["SUGGERITORE_MODE"] = "on"
        state_path = _BATCH_STATE_DIR / f"{prefix}{run_idx}_state.json"
        os.environ["SUGGERITORE_STATE_PATH"] = str(state_path)
        # Clean slate per run: identity + objective only, NO caller facts. The
        # distiller must earn the scenario's facts from the conversation.
        clean_ledger = StateLedger(
            identity=scenario["identity"],
            objective=scenario["objective"],
            facts=[],
            commitments=[],
            last_turn=0,
        )
        state_store.save(clean_ledger, state_path)
    else:
        os.environ["SUGGERITORE_MODE"] = "off"
        os.environ.pop("SUGGERITORE_STATE_PATH", None)

    # Per-run cost file beside the transcript, so each recorded run carries its
    # own real cost (§5). Unlink any stale copy so re-runs start fresh; a fresh
    # Workflow already means a fresh CostMeter (no cumulative leak across runs).
    cost_path = out_dir / f"{prefix}{run_idx}_cost.jsonl"
    os.environ["SUGGERITORE_COST_PATH"] = str(cost_path)
    cost_path.unlink(missing_ok=True)

    conn = HeadlessConnection(get_agent(scenario.get("agent_profile")))
    wf = Workflow(conn)

    turns: list[dict] = []
    tno = 0
    for line in scenario["script"]:
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


def _recalled(turns: list[dict], markers: list[str]) -> bool:
    if not markers:
        return False
    last_agent = next(
        (t["text"] for t in reversed(turns) if t["role"] == "agent"), ""
    )
    low = last_agent.lower()
    return any(m in low for m in markers)


async def main_async(mode: str, n: int, out_dir: Path, scenario: dict) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    _BATCH_STATE_DIR.mkdir(parents=True, exist_ok=True)
    prefix = _prefix(scenario["id"], mode)
    markers = scenario["recall_markers"]

    recalled = 0
    for i in range(1, n + 1):
        turns = await run_one(mode, i, out_dir, scenario)
        _validate(turns)
        path = out_dir / f"{prefix}{i}.jsonl"
        with open(path, "w", encoding="utf-8") as fh:
            for t in turns:
                fh.write(json.dumps(t, ensure_ascii=False) + "\n")
        hit = _recalled(turns, markers)
        recalled += hit
        print(f"  {path.name}: {len(turns)} turns, recall={'yes' if hit else 'no'}")

    tail = (
        f"({recalled}/{n} contain the recall answer)"
        if markers
        else "(recall markers off — score with harness/runner.py)"
    )
    print(f"\n{mode} [{scenario['id']}]: wrote {n} run(s) to {out_dir}/  {tail}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Headless batch transcript driver")
    parser.add_argument("--mode", choices=["base", "suggeritore"], required=True)
    parser.add_argument("--n", type=int, default=10)
    parser.add_argument(
        "--scenario",
        default="nonna",
        help="scenario id from spec/fixtures/scenarios/index.json (default: nonna)",
    )
    parser.add_argument(
        "--script",
        default=None,
        help="caller script JSONL to use directly, bypassing the manifest",
    )
    parser.add_argument(
        "--turns",
        type=int,
        default=None,
        help="cap the call to the first N caller turns (recall line always kept)",
    )
    parser.add_argument(
        "--out-dir",
        default=str(_REPO_ROOT / "recordings"),
        help="output directory (default: repo-root recordings/)",
    )
    args = parser.parse_args()
    scenario = load_scenario(args.scenario, args.script, args.turns)
    asyncio.run(main_async(args.mode, args.n, Path(args.out_dir), scenario))


if __name__ == "__main__":
    main()
