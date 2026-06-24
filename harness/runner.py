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
SCENARIOS_DIR = FIXTURES / "scenarios"

# Fields every cost_event must carry (SPEC §5).
COST_FIELDS = ("agent", "turn", "tokens_in", "tokens_out", "usd_cumulative")

# Default seeded fact = the bundled "nonna" fixture (used by --mode fixture and
# as the fallback when no --scenario/--seeded-fact is given).
SEEDED_FACT = (
    "the watch must arrive before the 20th for grandson Luca's graduation, "
    "delivered to sig.ra Pina interno 3"
)


def load_seeded_fact(scenario_id: str) -> str:
    """Look up a scenario's seeded_fact in spec/fixtures/scenarios/index.json."""
    manifest = json.loads((SCENARIOS_DIR / "index.json").read_text(encoding="utf-8"))
    entry = next(
        (s for s in manifest["scenarios"] if s["id"] == scenario_id), None
    )
    if entry is None:
        known = ", ".join(s["id"] for s in manifest["scenarios"])
        sys.exit(f"unknown scenario {scenario_id!r}; known: {known}")
    return entry["seeded_fact"]


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
    print(
        f"cost  base=${base:.2f}  suggeritore=${sug:.2f}  "
        f"delta=${delta:.2f} ({_ratio(base, sug)})"
    )


def _ratio(base: float, sug: float) -> str:
    """Direction-aware ratio: name whichever side is dearer.

    The cost divergence can point either way — the base may be cheap when its
    context is capped while the suggeritore carries injected state — so we never
    assume the base is the expensive one.
    """
    if base == sug:
        return "equal cost"
    hi, lo, name = (base, sug, "base") if base > sug else (sug, base, "suggeritore")
    if lo <= 0:
        return f"{name} infinitely more expensive"
    return f"{name} {hi / lo:.1f}x more expensive"


def _last_cumulative(path: Path) -> float | None:
    """Final usd_cumulative in a per-run cost JSONL (last event carrying it)."""
    try:
        lines = [ln for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip()]
    except OSError as e:
        print(f"cost  WARN: could not read {path}: {e}")
        return None
    for line in reversed(lines):
        try:
            ev = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(ev, dict) and "usd_cumulative" in ev:
            missing = [f for f in COST_FIELDS if f not in ev]
            if missing:
                print(f"cost  WARN: {path.name} last event missing {', '.join(missing)}")
            return ev["usd_cumulative"]
    print(f"cost  WARN: no usd_cumulative found in {path.name}")
    return None


def check_cost_dir(cost_dir: Path, prefix: str = "") -> None:
    """Aggregate the per-run cost files batch_run.py writes (SPEC §5).

    batch_run.py emits one JSONL per run per side next to each transcript:
    ``{prefix}base_run{i}_cost.jsonl`` and ``{prefix}sug_run{i}_cost.jsonl``
    (the prefix is the scenario id, e.g. ``reso_``). Each file's last event
    carries that run's final ``usd_cumulative``. We average each side over its
    runs and print the divergence, naming whichever side is more expensive (it is
    NOT always the base — see the cost nodo in PLAN.md). A missing file or field
    warns but never crashes.
    """
    sides = {
        "base": sorted(cost_dir.glob(f"{prefix}base_run*_cost.jsonl")),
        "suggeritore": sorted(cost_dir.glob(f"{prefix}sug_run*_cost.jsonl")),
    }
    means: dict[str, float | None] = {}
    for label, files in sides.items():
        totals = [c for c in (_last_cumulative(p) for p in files) if c is not None]
        if not totals:
            print(f"cost  WARN: no {label} run files (*_cost.jsonl) in {cost_dir}")
            means[label] = None
            continue
        mean = sum(totals) / len(totals)
        means[label] = mean
        print(f"cost  {label:11s} mean=${mean:.4f} over {len(totals)} run(s)")

    base, sug = means["base"], means["suggeritore"]
    if base is None or sug is None:
        print("cost  WARN: incomplete data, no aggregate printed")
        return
    delta = base - sug
    print(
        f"cost  base=${base:.4f}  suggeritore=${sug:.4f}  "
        f"delta=${delta:.4f} ({_ratio(base, sug)})"
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


def run_live(base_files: list[str], sug_files: list[str], seeded_fact: str) -> int:
    def score_side(label: str, files: list[str]) -> int:
        remembered = 0
        for i, raw in enumerate(files, start=1):
            verdict = judge(load_jsonl(Path(raw)), seeded_fact)
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
        help="path to a single cost.json (SPEC §5 cost meter). Fixture mode "
        "defaults to the bundled fixture; live mode only checks cost when passed.",
    )
    parser.add_argument(
        "--cost-dir",
        default=None,
        help="directory of per-run cost files from batch_run.py "
        "({scenario}_base_run*_cost.jsonl / {scenario}_sug_run*_cost.jsonl); "
        "prints the mean base vs suggeritore cost across runs. Works in either "
        "mode. Pass --scenario to glob a specific scenario's files.",
    )
    parser.add_argument(
        "--scenario",
        default=None,
        help="live mode: scenario id from spec/fixtures/scenarios/index.json — "
        "loads its seeded_fact and scopes --cost-dir to that scenario's files.",
    )
    parser.add_argument(
        "--seeded-fact",
        default=None,
        help="live mode: override the recall fact the judge scores against "
        "(takes precedence over --scenario).",
    )
    args = parser.parse_args()

    # Resolve the fact the judge scores recall against: explicit --seeded-fact
    # wins, else the --scenario manifest, else the bundled nonna default.
    if args.seeded_fact:
        seeded_fact = args.seeded_fact
    elif args.scenario:
        seeded_fact = load_seeded_fact(args.scenario)
    else:
        seeded_fact = SEEDED_FACT

    if args.mode == "fixture":
        rc = run_fixture(Path(args.cost) if args.cost else COST_FIXTURE)
    else:
        if not args.base or not args.sug:
            parser.error("--mode live requires both --base and --sug with at least one file each")
        rc = run_live(args.base, args.sug, seeded_fact)
        if args.cost:
            check_cost(Path(args.cost))

    if args.cost_dir:
        prefix = f"{args.scenario}_" if args.scenario else ""
        check_cost_dir(Path(args.cost_dir), prefix)
    return rc


if __name__ == "__main__":
    sys.exit(main())
