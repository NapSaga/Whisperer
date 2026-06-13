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
import sys
from pathlib import Path

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

SEEDED_FACT = (
    "the order is football boots, size 38, a gift for the caller's grandson, "
    "delivery Thursday"
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


def run_fixture() -> int:
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
        return 1
    print("FIXTURE OK")
    return 0


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
    args = parser.parse_args()

    if args.mode == "fixture":
        return run_fixture()

    if not args.base or not args.sug:
        parser.error("--mode live requires both --base and --sug with at least one file each")
    return run_live(args.base, args.sug)


if __name__ == "__main__":
    sys.exit(main())
