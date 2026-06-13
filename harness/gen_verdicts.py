"""Regenerate spec/fixtures/verdicts.json from the REAL batch recordings.

Runs the binary judge (judge.py) over recordings/base_run{1..N}.jsonl and
recordings/sug_run{1..N}.jsonl with the committed SEEDED_FACT, then writes the
SPEC §6 verdict shape exactly as the web consumes it. The number is whatever the
judge returns — nothing is hand-picked.
"""

import json
from pathlib import Path

from judge import judge
from runner import SEEDED_FACT, load_jsonl

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
REC = ROOT / "recordings"
OUT = ROOT / "spec" / "fixtures" / "verdicts.json"


def score_side(prefix: str, n: int) -> list[dict]:
    rows = []
    for i in range(1, n + 1):
        v = judge(load_jsonl(REC / f"{prefix}{i}.jsonl"), SEEDED_FACT)
        rows.append({
            "run": i,
            "remembers": v.remembers,
            "citation": v.citation,
            "identity_held": v.identity_held,
            "objective_correct": v.objective_correct,
            "reason": v.reason,
        })
        print(f"  {prefix}{i}: remembers={v.remembers} citation={v.citation}")
    return rows


def main() -> None:
    n = 10
    print("=== BASE ===")
    base = score_side("base_run", n)
    print("=== SUGGERITORE ===")
    sug = score_side("sug_run", n)

    base_hits = sum(r["remembers"] for r in base)
    sug_hits = sum(r["remembers"] for r in sug)

    # question_turn = the caller turn that re-asks; citation lands on the next
    # agent turn. The script's recall question is the last caller turn (t15),
    # answered at t16 — but use the judge's own citation for truth.
    out = {
        "seeded_fact": SEEDED_FACT,
        "question_turn": "t15",
        "runs": {"base": base, "suggeritore": sug},
        "score": {"base": f"{base_hits}/{n}", "suggeritore": f"{sug_hits}/{n}"},
    }
    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"\nIL NUMERO: base {base_hits}/{n}, suggeritore {sug_hits}/{n}")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
