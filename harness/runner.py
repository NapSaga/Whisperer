"""harness/runner.py — drive the binary judge over fixtures or live transcripts.

Two modes, selected via --mode:

  fixture (default)  validate the judge against the bundled single transcript
                     before any server exists.
  live               score N real transcript files per side (base vs suggeritore).

Run either from the repo root (`python harness/runner.py ...`) or from inside
harness/ (`python runner.py ...`).
"""

import argparse
import json
import os
import sys
from pathlib import Path


def _load_dotenv() -> None:
    """Load KEY=value pairs from .env in the repo root into os.environ (stdlib only)."""
    root = Path(__file__).resolve().parent.parent
    env_file = root / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_dotenv()

# Import judge() whether we're launched from the repo root or from harness/.
try:
    from harness.judge import judge  # python harness/runner.py from the repo root
except ImportError:
    try:
        from judge import judge  # python runner.py from inside harness/
    except ImportError as e:
        sys.exit(
            "ERROR: could not import judge() from judge.py.\n"
            "Run this from the repo root (python harness/runner.py) "
            "or from inside harness/ (python runner.py).\n"
            f"Original error: {e}"
        )

HERE = Path(__file__).resolve().parent
FIXTURES = HERE.parent / "spec" / "fixtures"
COST_FIXTURE = FIXTURES / "cost.json"

# Fields every cost_event must carry (SPEC §5).
COST_FIELDS = ("agent", "turn", "tokens_in", "tokens_out", "usd_cumulative")

SEEDED_FACT = (
    "the watch must arrive before the 20th for grandson Luca's graduation, "
    "delivered to sig.ra Pina interno 3"
)


def load_jsonl(path: Path) -> list[dict]:
    """Read a .jsonl transcript into a list of turn dicts (blank lines skipped)."""
    rows: list[dict] = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def print_verdict(label: str, verdict) -> None:
    print(f"{label}: {verdict.model_dump_json()}")


def check_cost(cost_path: Path) -> None:
    """Print the diverging audio cost meter (SPEC §5) from a cost.json file.

    Accepts either a bare array of cost_event objects or the bundled
    ``{"events": [...]}`` wrapper. Splits events by agent, then prints the
    final usd_cumulative for each side plus the delta and how many times more
    expensive the base agent is. A missing required field warns but never
    crashes the run.
    """
    try:
        data = json.loads(cost_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        print(f"cost  WARN: could not read {cost_path}: {e}")
        return

    events = data.get("events") if isinstance(data, dict) else data
    if not isinstance(events, list):
        print(f"cost  WARN: no events array found in {cost_path}")
        return

    last = {"base": None, "suggeritore": None}
    for i, ev in enumerate(events):
        if not isinstance(ev, dict):
            print(f"cost  WARN: event {i} is not an object, skipping")
            continue
        missing = [f for f in COST_FIELDS if f not in ev]
        if missing:
            print(
                f"cost  WARN: event {i} (turn={ev.get('turn', '?')}) "
                f"missing {', '.join(missing)}"
            )
        agent = ev.get("agent")
        if agent in last and "usd_cumulative" in ev:
            last[agent] = ev["usd_cumulative"]

    base, sug = last["base"], last["suggeritore"]
    if base is None or sug is None:
        print(f"cost  WARN: incomplete data (base={base}, suggeritore={sug})")
        return

    delta = base - sug
    ratio = (
        f"base {base / sug:.1f}x more expensive"
        if sug > 0
        else "base infinitely more expensive"
    )
    print(
        f"cost  base=${base:.2f}  suggeritore=${sug:.2f}  "
        f"delta=${delta:.2f} ({ratio})"
    )


def run_fixture(cost_path: Path = COST_FIXTURE) -> int:
    rows = load_jsonl(FIXTURES / "transcript.jsonl")

    def build(exclude_marker: str, rename_from: str) -> list[dict]:
        out: list[dict] = []
        for row in rows:
            if exclude_marker in row["turn"]:
                continue
            turn = dict(row)
            if turn["turn"] == rename_from:
                turn["turn"] = "t41"
            out.append(turn)
        return out

    base_transcript = build("_suggeritore", "t41_base")
    suggeritore_transcript = build("_base", "t41_suggeritore")

    base_verdict = judge(base_transcript, SEEDED_FACT)
    suggeritore_verdict = judge(suggeritore_transcript, SEEDED_FACT)

    print_verdict("BASE        ", base_verdict)
    print_verdict("SUGGERITORE ", suggeritore_verdict)

    expected = json.loads((FIXTURES / "verdicts.json").read_text(encoding="utf-8"))
    expected_base = expected["runs"]["base"][0]["remembers"]
    expected_sug = expected["runs"]["suggeritore"][0]["remembers"]

    problems: list[str] = []
    if base_verdict.remembers != expected_base:
        problems.append(
            f"base.remembers={base_verdict.remembers}, expected {expected_base}"
        )
    if suggeritore_verdict.remembers != expected_sug:
        problems.append(
            f"suggeritore.remembers={suggeritore_verdict.remembers}, "
            f"expected {expected_sug}"
        )

    if problems:
        print("FIXTURE FAIL: " + "; ".join(problems))
        rc = 1
    else:
        print("FIXTURE OK")
        rc = 0

    check_cost(cost_path)
    return rc


def run_live(base_files: list[str], sug_files: list[str]) -> int:
    def score_side(label: str, files: list[str]) -> int:
        remembered = 0
        for i, raw in enumerate(files, start=1):
            verdict = judge(load_jsonl(Path(raw)), SEEDED_FACT)
            if verdict.remembers:
                remembered += 1
            print(
                f"[{label} run {i}] remembers={verdict.remembers} "
                f"citation={verdict.citation} reason={verdict.reason}"
            )
        return remembered

    base_hits = score_side("base", base_files)
    sug_hits = score_side("suggeritore", sug_files)

    print(
        f"base {base_hits}/{len(base_files)}, "
        f"suggeritore {sug_hits}/{len(sug_files)}"
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run the binary judge over fixtures or live transcripts."
    )
    parser.add_argument(
        "--mode",
        choices=["fixture", "live"],
        default="fixture",
        help="fixture: validate against the bundled transcript (default); "
        "live: score N transcript files per side.",
    )
    parser.add_argument(
        "--base",
        nargs="+",
        default=[],
        help="live mode: transcript files for the base side (one per run).",
    )
    parser.add_argument(
        "--sug",
        nargs="+",
        default=[],
        help="live mode: transcript files for the suggeritore side (one per run).",
    )
    parser.add_argument(
        "--cost",
        default=None,
        help="path to a cost.json (SPEC §5 cost meter). Fixture mode defaults to "
        "the bundled fixture; live mode only checks cost when this is passed.",
    )
    args = parser.parse_args()

    if args.mode == "fixture":
        return run_fixture(Path(args.cost) if args.cost else COST_FIXTURE)

    if not args.base or not args.sug:
        parser.error("--mode live requires both --base and --sug with at least one file each")
    rc = run_live(args.base, args.sug)
    if args.cost:
        check_cost(Path(args.cost))
    return rc


if __name__ == "__main__":
    sys.exit(main())
