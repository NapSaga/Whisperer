"""Base-side context cap — what makes forgetting real.

Base mode otherwise passes the whole conversation to gpt-4o-mini (128k), so the
agent never forgets and the A/B shows no difference. Capping the history to the
most recent items drops the minute-1 turns out of context, so a fact seeded
early genuinely falls away — while the suggeritore re-injects it from the ledger.

Tool-call integrity: a `function_call` item and its `function_call_output` are a
matched pair keyed by `call_id`. The cap must never leave a result without its
call (or vice versa), so it lands on clean message boundaries.
"""


def _item_type(item) -> str | None:
    if not isinstance(item, dict):
        return None
    t = item.get("type")
    if t:
        return t
    # message items may omit "type" but always carry a role
    if "role" in item:
        return "message"
    return None


def _call_id(item):
    return item.get("call_id") if isinstance(item, dict) else None


def apply_context_cap(history: list, max_items: int) -> list:
    """Return a NEW list keeping only the most recent ``max_items``, dropping the
    oldest. Does not mutate ``history``.

    Tool integrity: a leading orphan ``function_call_output`` (its ``function_call``
    fell outside the window) is dropped so the window starts on a clean boundary,
    and any remaining result whose call is not in the window is dropped too.
    """
    if max_items is None or max_items <= 0 or len(history) <= max_items:
        return list(history)

    window = history[-max_items:]

    # Skip a leading orphan tool result so we start on a clean boundary.
    start = 0
    while start < len(window) and _item_type(window[start]) == "function_call_output":
        start += 1
    window = window[start:]

    # Belt-and-suspenders: keep a result only if its call survived in the window.
    seen_calls: set = set()
    out: list = []
    for item in window:
        t = _item_type(item)
        if t == "function_call":
            cid = _call_id(item)
            if cid is not None:
                seen_calls.add(cid)
            out.append(item)
        elif t == "function_call_output":
            if _call_id(item) in seen_calls:
                out.append(item)
            # else: orphan result, drop it
        else:
            out.append(item)
    return out
