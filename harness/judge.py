"""harness/judge.py — the binary judge (SPEC §6).

Given a recorded call transcript and the fact seeded at minute 1, decide — with a
citation, no vibes — whether the agent still remembered that fact when the caller
re-asked about the order near the end of the call.

Uses the OpenAI SDK with structured outputs (no free-form JSON parsing).
Reads OPENAI_API_KEY from the environment; nothing is hardcoded.
"""

import json
import os
from pathlib import Path

from openai import OpenAI
from pydantic import BaseModel

MODEL = "gpt-4o-mini"


class Verdict(BaseModel):
    remembers: bool
    citation: str          # id of the key turn, e.g. "t41"
    identity_held: bool
    objective_correct: bool
    reason: str


def judge(transcript: list[dict], seeded_fact: str) -> Verdict:
    """Return a structured Verdict on whether the agent recalled the seeded fact."""
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

    # Compact JSON serialization of the turns — one line, no whitespace padding.
    transcript_json = json.dumps(transcript, ensure_ascii=False, separators=(",", ":"))

    system_prompt = (
        "You are a strict binary judge for a voice-agent memory benchmark.\n"
        "A fact was seeded early in a long phone call. Near the end, the caller "
        "re-asks about their order. Your job is to read the agent's answer at that "
        "moment and decide, with evidence, whether the agent still remembered the "
        "seeded fact. Judge only what the transcript shows — never invent recall.\n\n"
        f"SEEDED FACT (the ground truth to check against):\n{seeded_fact}\n\n"
        "FULL TRANSCRIPT (compact JSON, one object per turn — "
        'each has "turn" id, "role" of agent|caller, "text", "ts"):\n'
        f"{transcript_json}\n\n"
        "HOW TO JUDGE:\n"
        "1. Find the moment the caller re-asks for information about the order "
        "(e.g. asking when it arrives / what was ordered), then read the AGENT turn "
        "that answers it. That agent turn is the one you evaluate.\n"
        "2. remembers = true only if that agent answer reflects the seeded fact "
        "(the right item and recipient, ideally the delivery date) instead of "
        "asking the caller to repeat it or inventing a different product.\n"
        "3. citation = the id of that evaluated AGENT turn (e.g. \"t41\").\n"
        "4. identity_held = did the agent stay in its support-agent role, or drift "
        "into a generic/different script?\n"
        "5. objective_correct = was the agent still tracking the right objective "
        "(this order / delivery), not a fabricated or unrelated one?\n"
        "6. reason = one short sentence explaining the verdict."
    )

    completion = client.beta.chat.completions.parse(
        model=MODEL,
        response_format=Verdict,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": "Return the verdict for the evaluated agent turn."},
        ],
    )
    return completion.choices[0].message.parsed


if __name__ == "__main__":
    fixture = Path(__file__).resolve().parent.parent / "spec" / "fixtures" / "transcript.jsonl"

    rows: list[dict] = []
    with fixture.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))

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

    seeded_fact = (
        "the watch must arrive before the 20th for grandson Luca's graduation, "
        "delivered to sig.ra Pina interno 3"
    )

    base_verdict = judge(base_transcript, seeded_fact)
    suggeritore_verdict = judge(suggeritore_transcript, seeded_fact)

    print("BASE        :", base_verdict.model_dump_json())
    print("SUGGERITORE :", suggeritore_verdict.model_dump_json())

    try:
        assert base_verdict.remembers is False, (
            f"expected base.remembers == False, got {base_verdict.remembers}"
        )
        assert suggeritore_verdict.remembers is True, (
            f"expected suggeritore.remembers == True, got {suggeritore_verdict.remembers}"
        )
        print("FIXTURE OK")
    except AssertionError as e:
        print("FIXTURE FAIL:", e)
